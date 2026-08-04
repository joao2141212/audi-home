import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getSupabasePublishableKey, getSupabaseSecretKey } from '../_shared/supabase-keys.ts'

declare const Deno: any

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
}

const WINKER_BASE_URL = 'https://api.winker.com.br/v1'
const WINKER_WEB_BASE_URL = 'https://app.winker.com.br'
const WINKER_STORAGE_BUCKET = 'winker-documents'
const WINKER_WEB_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchWinkerBody<T>(
    input: RequestInfo | URL,
    init: RequestInit,
    stage: string,
    readBody: (response: Response) => Promise<T>,
) {
    const controller = new AbortController()
    const timeoutMs = Math.max(1_000, Number(Deno.env.get('WINKER_HTTP_TIMEOUT_MS') || 30_000))
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(input, { ...init, signal: controller.signal })
        const body = await readBody(response)
        return { response, body }
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error(`WINKER_WEB_${stage}_TIMEOUT`)
        }
        throw error
    } finally {
        clearTimeout(timeoutId)
    }
}

type SyncBody = {
    condominio_id?: string
    username?: string
    password?: string
    key?: string | number
    app_key?: string | number
    id_portal?: number | string
    max_pages?: number
    trigger_source?: 'manual' | 'scheduled' | 'api'
}

type WinkerIntegrationMode = 'web' | 'rest'

type RequestContext = {
    adminClient: any
    perfil: {
        id: string | null
        role: 'master' | 'gestor' | 'sindico'
        condominio_id: string | null
    }
    serviceTrigger: boolean
}

class WinkerClient {
    private token: string | null = null

    constructor(
        private readonly baseUrl: string,
        private readonly username: string,
        private readonly password: string,
        private readonly appKey: string,
    ) {}

    async login() {
        const response = await fetch(`${this.baseUrl}/auth/login`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: this.username,
                password: this.password,
                ...(this.appKey ? { key: /^\d+$/.test(this.appKey) ? Number(this.appKey) : this.appKey } : {}),
            }),
        })

        const body = await readJson(response)
        if (!response.ok || !body?.token) {
            throw new Error(`WINKER_LOGIN_FAILED ${response.status}: ${safeError(body)}`)
        }

        this.token = body.token
        return body
    }

    async get(path: string) {
        if (!this.token) throw new Error('WINKER_NOT_AUTHENTICATED')

        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: this.token,
            },
        })

        if (response.status === 204) return null

        const body = await readJson(response)
        if (!response.ok) {
            throw new Error(`WINKER_GET_FAILED ${path} ${response.status}: ${safeError(body)}`)
        }

        return {
            body,
            pagination: {
                totalItems: toNumber(response.headers.get('pagination-total-items')),
                pageSize: toNumber(response.headers.get('pagination-page-size')),
                totalPages: toNumber(response.headers.get('pagination-total-pages')),
            },
        }
    }
}

class WinkerWebClient {
    private cookieHeader = ''

    constructor(
        private readonly baseUrl: string,
        private readonly username: string,
        private readonly password: string,
    ) {}

    async login() {
        const { response } = await fetchWinkerBody(`${this.baseUrl}/intra/default/login`, {
            method: 'POST',
            redirect: 'manual',
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': WINKER_WEB_USER_AGENT,
            },
            body: new URLSearchParams({
                'LoginForm[username]': this.username,
                'LoginForm[password]': this.password,
            }),
        }, 'LOGIN', async () => null)

        const location = response.headers.get('location') || ''
        const setCookieHeaders = typeof (response.headers as any).getSetCookie === 'function'
            ? (response.headers as any).getSetCookie()
            : [response.headers.get('set-cookie') || '']
        const cookies = setCookieHeaders
            .flatMap((value: string) => value.split(/,(?=[^;=]+=[^;]+)/))
            .map((value: string) => value.split(';', 1)[0].trim())
            .filter(Boolean)

        const finalUrl = response.url || ''
        const redirectedToPortal = location.includes('/intra') || (finalUrl.includes('/intra') && !finalUrl.includes('/default/login'))
        const statusAllowed = (response.status >= 200 && response.status < 300) || (response.status >= 300 && response.status < 400)
        if (!statusAllowed || !redirectedToPortal) {
            throw new Error(`WINKER_WEB_LOGIN_FAILED_${response.status}_${redirectedToPortal ? 'PORTAL' : 'LOGIN_PAGE'}_${cookies.length > 0 ? 'COOKIE' : 'NO_COOKIE'}`)
        }
        if (cookies.length === 0) throw new Error('WINKER_WEB_SESSION_MISSING')

        this.cookieHeader = cookies.join('; ')
        return { location }
    }

    async html(path: string) {
        const { response, body } = await fetchWinkerBody(new URL(path, this.baseUrl), {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                Cookie: this.cookieHeader,
                'User-Agent': WINKER_WEB_USER_AGENT,
            },
        }, 'PAGE', (pageResponse) => pageResponse.text())

        if (!response.ok || response.url.includes('/default/login')) {
            throw new Error(`WINKER_WEB_PAGE_FAILED ${response.status}`)
        }

        return body
    }

    async file(path: string) {
        const { response, body } = await fetchWinkerBody(new URL(path, this.baseUrl), {
            headers: {
                Accept: 'application/pdf, application/octet-stream, application/zip',
                Cookie: this.cookieHeader,
                'User-Agent': WINKER_WEB_USER_AGENT,
            },
        }, 'FILE', (fileResponse) => fileResponse.arrayBuffer())

        if (!response.ok || response.url.includes('/default/login')) {
            throw new Error(`WINKER_WEB_DOWNLOAD_FAILED ${response.status}`)
        }

        const contentType = (response.headers.get('content-type') || 'application/octet-stream').split(';', 1)[0].trim().toLowerCase()
        const bytes = new Uint8Array(body)
        const magic = String.fromCharCode(...bytes.slice(0, 4))
        const isPdf = magic === '%PDF'
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
        if (contentType === 'text/html' && !isPdf && !isZip) throw new Error('WINKER_WEB_UNSUPPORTED_FILE')

        const maxBytes = Number(Deno.env.get('WINKER_MAX_FILE_BYTES') || Deno.env.get('WINKER_MAX_PDF_BYTES') || 50_000_000)
        if (bytes.byteLength > maxBytes) throw new Error('WINKER_FILE_TOO_LARGE')
        return {
            bytes,
            contentType: isPdf ? 'application/pdf' : isZip ? 'application/zip' : contentType,
            extension: isPdf ? 'pdf' : isZip ? 'zip' : inferWebFileExtension(path, contentType),
        }
    }
}

function inferWebFileExtension(path: string, contentType: string) {
    const mimeExtensions: Record<string, string> = {
        'application/pdf': 'pdf',
        'application/zip': 'zip',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/tiff': 'tiff',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'application/json': 'json',
        'application/xml': 'xml',
        'text/xml': 'xml',
        'text/rtf': 'rtf',
    }
    if (mimeExtensions[contentType]) return mimeExtensions[contentType]

    try {
        const extension = new URL(path, WINKER_WEB_BASE_URL).pathname.match(/\.([a-z0-9]{1,8})$/i)?.[1]
        if (extension && !['php', 'html', 'htm'].includes(extension.toLowerCase())) return extension.toLowerCase()
    } catch {
        // Keep the generic extension when the provider path is not a valid URL.
    }

    return 'bin'
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const correlationId = crypto.randomUUID()
    let syncRunId: string | null = null
    let adminClient: any = null
    let condominioId: string | null = null
    let idPortal: number | null = null

    try {
        const body = await readRequestBody(req)
        const context = await getRequestContext(req)
        adminClient = context.adminClient

        condominioId = resolveCondominioId(body, context)
        assertCondoAccess(condominioId, context)

        console.log(JSON.stringify({
            fn: 'sync-winker',
            status: 'start',
            correlation_id: correlationId,
            condominio_id: condominioId,
            trigger_source: body.trigger_source || (context.serviceTrigger ? 'scheduled' : 'manual'),
        }))

        const triggerSource = body.trigger_source || (context.serviceTrigger ? 'scheduled' : 'manual')
        const { data: run, error: runError } = await adminClient
            .from('winker_sync_runs')
            .insert({
                condominio_id: condominioId,
                status: 'running',
                trigger_source: triggerSource,
            })
            .select('id')
            .single()

        if (runError) throw runError
        syncRunId = run.id

        const credentials = resolveCredentials(body)
        const integrationMode = resolveIntegrationMode(credentials.appKey)
        let loginBody: any = null
        let me: any = {}
        let portalName: string | null = null
        const stats: Record<string, number> = {}
        const now = new Date().toISOString()

        if (integrationMode === 'rest') {
            const winker = new WinkerClient(
                credentials.baseUrl,
                credentials.username,
                credentials.password,
                credentials.appKey,
            )

            loginBody = await winker.login()
            const meResult = await winker.get('/me')
            me = meResult?.body || {}

            idPortal = resolvePortalId(body, me)
            if (!idPortal) throw new Error('WINKER_PORTAL_NOT_FOUND')

            portalName = resolvePortalName(me, idPortal)

            await upsertConnection(adminClient, {
                condominioId,
                idPortal,
                portalName,
                usernameHint: maskIdentifier(credentials.username),
                appKeyHint: maskAppKey(credentials.appKey),
                baseUrl: credentials.baseUrl,
                rawMe: me,
                now,
            })

            const divisionsResult = await winker.get(`/division?id_portal=${idPortal}&with_units=1`)
            const divisions = Array.isArray(divisionsResult?.body) ? divisionsResult.body : []
            await upsertDivisionsAndUnits(adminClient, condominioId, idPortal, divisions, now)
            stats.divisions = divisions.length
            stats.units = divisions.reduce((sum: number, division: any) => sum + (Array.isArray(division.units) ? division.units.length : 0), 0)

            const documents = await fetchAllDocuments(winker, idPortal, body.max_pages ?? 100)
            await upsertDocuments(adminClient, condominioId, idPortal, documents, now)
            stats.documents = documents.length
            stats.financial_documents = documents.filter(isFinancialDocument).length

            const externalStats = await syncExternalRecords(adminClient, winker, condominioId, idPortal, now)
            Object.assign(stats, externalStats)
        } else {
            const web = new WinkerWebClient(
                credentials.webBaseUrl,
                credentials.username,
                credentials.password,
            )
            const webResult = await syncWinkerWeb(adminClient, web, body, condominioId, now)
            idPortal = webResult.idPortal
            portalName = webResult.portalName
            me = webResult.rawMe
            loginBody = { name: portalName }
            Object.assign(stats, webResult.stats)

            await upsertConnection(adminClient, {
                condominioId,
                idPortal,
                portalName,
                usernameHint: maskIdentifier(credentials.username),
                appKeyHint: '',
                baseUrl: credentials.webBaseUrl,
                rawMe: me,
                now,
            })
        }

        await adminClient
            .from('winker_sync_runs')
            .update({
                status: 'success',
                id_portal: idPortal,
                finished_at: now,
                stats,
            })
            .eq('id', syncRunId)

        await adminClient
            .from('winker_connections')
            .update({
                last_sync_at: now,
                last_sync_status: 'success',
                last_sync_error: null,
                status: 'active',
                updated_at: now,
            })
            .eq('condominio_id', condominioId)

        console.log(JSON.stringify({
            fn: 'sync-winker',
            status: 'success',
            correlation_id: correlationId,
            condominio_id: condominioId,
            integration_mode: integrationMode,
            id_portal: idPortal,
            stats,
        }))

        return jsonResponse({
            success: true,
            correlation_id: correlationId,
            condominio_id: condominioId,
            integration_mode: integrationMode,
            id_portal: idPortal,
            portal_name: portalName,
            winker_user: {
                id_user: loginBody.id_user ?? me.id_user ?? null,
                name: loginBody.name ?? me.name ?? null,
            },
            stats,
        })
    } catch (err: any) {
        const message = err?.message || String(err)
        const finishedAt = new Date().toISOString()
        const errorCode = message.split(/\s|:/)[0].slice(0, 80) || 'WINKER_SYNC_FAILED'

        if (adminClient && syncRunId) {
            await adminClient
                .from('winker_sync_runs')
                .update({
                    status: 'error',
                    id_portal: idPortal,
                    finished_at: finishedAt,
                    error_message: message,
                })
                .eq('id', syncRunId)
        }

        if (adminClient && condominioId) {
            await adminClient
                .from('winker_connections')
                .update({
                    last_sync_at: finishedAt,
                    last_sync_status: 'error',
                    last_sync_error: message,
                    status: 'error',
                    updated_at: finishedAt,
                })
                .eq('condominio_id', condominioId)
        }

        console.error(JSON.stringify({
            fn: 'sync-winker',
            status: 'error',
            correlation_id: correlationId,
            condominio_id: condominioId,
            id_portal: idPortal,
            error_class: errorCode,
        }))

    const status = errorCode === 'AUTH_REQUIRED'
        ? 401
        : errorCode === 'PROFILE_NOT_FOUND' || errorCode === 'FORBIDDEN_CONDO'
            ? 403
            : errorCode === 'CONDOMINIO_ID_REQUIRED' || errorCode === 'WINKER_CREDENTIALS_REQUIRED' || errorCode === 'WINKER_REST_APP_KEY_REQUIRED'
                ? 400
                : 500
    return jsonResponse({ success: false, error: errorCode, correlation_id: correlationId }, status)
    }
})

async function getRequestContext(req: Request): Promise<RequestContext> {
    const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        getSupabaseSecretKey(),
    )

    const syncSecret = Deno.env.get('SYNC_WINKER_SECRET')
    const providedSecret = req.headers.get('x-sync-secret')
    if (syncSecret && providedSecret && providedSecret === syncSecret) {
        return {
            adminClient,
            perfil: { id: null, role: 'master', condominio_id: null },
            serviceTrigger: true,
        }
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('AUTH_REQUIRED')

    const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        getSupabasePublishableKey(),
        { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) throw new Error('AUTH_REQUIRED')

    const { data: perfil, error: perfilError } = await adminClient
        .from('perfis')
        .select('id, role, condominio_id')
        .eq('id', user.id)
        .single()

    if (perfilError || !perfil) throw new Error('PROFILE_NOT_FOUND')

    return { adminClient, perfil, serviceTrigger: false }
}

function resolveCondominioId(body: SyncBody, context: RequestContext) {
    const condominioId =
        body.condominio_id ||
        Deno.env.get('WINKER_CONDOMINIO_ID') ||
        context.perfil.condominio_id

    if (!condominioId) throw new Error('CONDOMINIO_ID_REQUIRED')
    return condominioId
}

function assertCondoAccess(condominioId: string, context: RequestContext) {
    if (context.perfil.role === 'master') return
    if (context.perfil.condominio_id === condominioId) return
    throw new Error('FORBIDDEN_CONDO')
}

function resolveCredentials(body: SyncBody) {
    const username = body.username || Deno.env.get('WINKER_USERNAME')
    const password = body.password || Deno.env.get('WINKER_PASSWORD')
    const appKey = String(body.key || body.app_key || Deno.env.get('WINKER_APP_KEY') || '')
    const baseUrl = Deno.env.get('WINKER_BASE_URL') || WINKER_BASE_URL
    const webBaseUrl = Deno.env.get('WINKER_WEB_BASE_URL') || WINKER_WEB_BASE_URL

    if (!username || !password) {
        throw new Error('WINKER_CREDENTIALS_REQUIRED')
    }

    return { username, password, appKey, baseUrl, webBaseUrl }
}

function resolveIntegrationMode(appKey: string): WinkerIntegrationMode {
    const configuredMode = (Deno.env.get('WINKER_INTEGRATION_MODE') || 'web').trim().toLowerCase()
    if (configuredMode !== 'web' && configuredMode !== 'rest') {
        throw new Error('WINKER_INTEGRATION_MODE_INVALID')
    }
    if (configuredMode === 'rest' && !appKey) {
        throw new Error('WINKER_REST_APP_KEY_REQUIRED')
    }
    return configuredMode
}

function resolvePortalId(body: SyncBody, me: any) {
    if (body.id_portal) return Number(body.id_portal)
    if (Deno.env.get('WINKER_PORTAL_ID')) return Number(Deno.env.get('WINKER_PORTAL_ID'))

    const unitPortal = Array.isArray(me.units)
        ? me.units.find((unit: any) => unit?.id_portal)?.id_portal
        : null
    if (unitPortal) return Number(unitPortal)

    const defaultPortal = Array.isArray(me.portal_default)
        ? me.portal_default[0]?.id_portal
        : me.default_portal?.id_portal
    return defaultPortal ? Number(defaultPortal) : null
}

function resolvePortalName(me: any, idPortal: number) {
    if (Array.isArray(me.units)) {
        const unit = me.units.find((item: any) => Number(item?.id_portal) === idPortal)
        if (unit?.portal?.name) return unit.portal.name
    }

    if (Array.isArray(me.portals)) {
        const portal = me.portals.find((item: any) => Number(item?.id_portal) === idPortal)
        if (portal?.name) return portal.name
    }

    return null
}

async function fetchAllDocuments(winker: WinkerClient, idPortal: number, maxPages: number) {
    const documents: any[] = []
    let totalPages = 1

    for (let page = 1; page <= totalPages && page <= maxPages; page += 1) {
        const result = await winker.get(`/portal/${idPortal}/document?page=${page}`)
        const pageItems = Array.isArray(result?.body) ? result.body : []
        documents.push(...pageItems)
        totalPages = result?.pagination?.totalPages || totalPages
    }

    return documents
}

async function upsertConnection(adminClient: any, input: {
    condominioId: string
    idPortal: number | null
    portalName: string | null
    usernameHint: string
    appKeyHint: string
    baseUrl: string
    rawMe: any
    now: string
}) {
    const { error } = await adminClient
        .from('winker_connections')
        .upsert({
            condominio_id: input.condominioId,
            id_portal: input.idPortal,
            portal_name: input.portalName,
            username_hint: input.usernameHint,
            app_key_hint: input.appKeyHint,
            base_url: input.baseUrl,
            sync_interval_minutes: 39,
            raw_me: input.rawMe,
            updated_at: input.now,
        }, { onConflict: 'condominio_id' })

    if (error) throw error
}

async function upsertDivisionsAndUnits(adminClient: any, condominioId: string, idPortal: number, divisions: any[], now: string) {
    const divisionRows = divisions
        .filter((division) => division?.id_division)
        .map((division) => ({
            condominio_id: condominioId,
            id_portal: idPortal,
            id_division: Number(division.id_division),
            name: division.name ?? null,
            description: division.description ?? null,
            raw: division,
            last_synced_at: now,
        }))

    if (divisionRows.length > 0) {
        const { error } = await adminClient
            .from('winker_divisions')
            .upsert(divisionRows, { onConflict: 'condominio_id,id_division' })
        if (error) throw error
    }

    const unitRows = divisions.flatMap((division) => {
        const units = Array.isArray(division.units) ? division.units : []
        return units
            .filter((unit: any) => unit?.id_unit)
            .map((unit: any) => ({
                condominio_id: condominioId,
                id_portal: idPortal,
                id_unit: Number(unit.id_unit),
                id_division: unit.id_division ? Number(unit.id_division) : Number(division.id_division),
                division_name: division.name ?? unit.division?.name ?? null,
                name: unit.name ?? null,
                administrative: toBoolean(unit.administrative),
                generate_billing: unit.generate_billing == null ? null : toBoolean(unit.generate_billing),
                raw: unit,
                last_synced_at: now,
            }))
    })

    if (unitRows.length > 0) {
        const { error } = await adminClient
            .from('winker_units')
            .upsert(unitRows, { onConflict: 'condominio_id,id_unit' })
        if (error) throw error
    }
}

async function upsertDocuments(adminClient: any, condominioId: string, idPortal: number | null, documents: any[], now: string) {
    const rows = documents
        .filter((document) => document?.id_document)
        .map((document) => ({
            condominio_id: condominioId,
            id_portal: idPortal,
            id_document: String(document.id_document),
            id_document_type: document.id_document_type ? String(document.id_document_type) : null,
            document_type: document.type ?? null,
            name: document.name ?? null,
            description: document.description ?? null,
            document_date_raw: document.document_date ?? null,
            created_at_winker: parseDateTime(document.created),
            uploaded_by: document.user?.name ?? null,
            uploaded_by_email: document.user?.user ?? null,
            file_uuid: document.file?.uuid ?? null,
            file_name: document.file?.original_name ?? null,
            file_mime_type: document.file?.type ?? null,
            file_size_bytes: toNumber(document.file?.size),
            converted_to_ia: document.converted_to_ia == null ? null : toBoolean(document.converted_to_ia),
            is_financial: isFinancialDocument(document),
            app_view_url: `https://app.winker.com.br/intra/meuCondominio/documento/view/id/${document.id_document}`,
            app_download_url: `https://app.winker.com.br/intra/meuCondominio/documento/download/id/${document.id_document}`,
            raw: document,
            last_synced_at: now,
        }))

    if (rows.length === 0) return

    const { error } = await adminClient
        .from('winker_documents')
        .upsert(rows, { onConflict: 'condominio_id,id_document' })

    if (error) throw error
}

type WebDocument = {
    id_document: string
    id_document_type: string | null
    type: string | null
    name: string
    description: string | null
    document_date: string | null
    created: string | null
    file: {
        uuid: null
        original_name: string
        type: string
        size: null
    }
    app_download_path: string
    raw: Record<string, unknown>
}

function cleanWebText(value: string) {
    return value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim()
}

function decodeWebUrl(value: string) {
    try {
        return decodeURIComponent(value)
    } catch (_err) {
        return value
    }
}

function parseWebCategories(html: string) {
    const categories = new Map<string, { id: string; label: string; href: string }>()
    for (const match of html.matchAll(/href=["']([^"']*id_documento_tipo[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = match[1]
        const decodedHref = decodeWebUrl(href)
        const idMatch = decodedHref.match(/id_documento_tipo(?:\]|\/)?\s*=?\s*(\d+)/i)
        if (!idMatch) continue
        const label = cleanWebText(match[2])
        if (!label) continue
        categories.set(idMatch[1], { id: idMatch[1], label, href })
    }
    return [...categories.values()]
}

function slugifyWebFileName(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100) || 'documento'
}

function parseWebDocuments(html: string, category: { id: string; label: string }) {
    const documents: WebDocument[] = []
    for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const row = match[1]
        const downloadMatch = row.match(/href=["']([^"']*\/documento\/download\/id\/(\d+)[^"']*)["']/i)
        if (!downloadMatch) continue

        const viewMatch = row.match(/href=["']([^"']*\/documento\/view\/id\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i)
        const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanWebText(cell[1]))
        const idDocument = downloadMatch[2]
        const name = cleanWebText(viewMatch?.[2] || cells[1] || `Documento ${idDocument}`)

        documents.push({
            id_document: idDocument,
            id_document_type: category.id,
            type: cells[0] || category.label,
            name,
            description: null,
            document_date: cells[3] || null,
            created: cells[2] || null,
            file: {
                uuid: null,
                original_name: `${slugifyWebFileName(name)}-${idDocument}`,
                type: 'application/octet-stream',
                size: null,
            },
            app_download_path: decodeWebUrl(downloadMatch[1]),
            raw: {
                source: 'winker_web',
                category_id: category.id,
                category_label: category.label,
                app_view_path: viewMatch?.[1] ? decodeWebUrl(viewMatch[1]) : null,
                app_download_path: decodeWebUrl(downloadMatch[1]),
            },
        })
    }
    return documents
}

function nextWebPage(html: string, currentPage: number) {
    const candidates = [...html.matchAll(/href=["']([^"']*Documento_page\/(\d+)[^"']*)["']/gi)]
        .map((match) => ({ href: decodeWebUrl(match[1]), page: Number(match[2]) }))
        .filter((candidate) => candidate.page > currentPage)
        .sort((a, b) => a.page - b.page)
    return candidates[0] || null
}

function parseWebPortalName(html: string) {
    const heading = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    return heading ? cleanWebText(heading[1]) || null : null
}

async function resolveWebPortalId(adminClient: any, condominioId: string, body: SyncBody) {
    if (body.id_portal) return Number(body.id_portal)
    const configured = Deno.env.get('WINKER_PORTAL_ID')
    if (configured) return Number(configured)

    const { data, error } = await adminClient
        .from('winker_connections')
        .select('id_portal')
        .eq('condominio_id', condominioId)
        .maybeSingle()
    if (error) throw error
    return data?.id_portal ? Number(data.id_portal) : null
}

async function ensureWinkerStorageBucket(adminClient: any) {
    const { error } = await adminClient.storage.createBucket(WINKER_STORAGE_BUCKET, { public: false })
    if (error && !/already exists|duplicate/i.test(error.message || '')) throw error
}

async function markWebDocumentStorage(adminClient: any, condominioId: string, documentId: string, storagePath: string | null, status: string, now: string, errorClass: string | null = null, contentType: string | null = null, fileSizeBytes: number | null = null, fileName: string | null = null) {
    const storagePatch: Record<string, unknown> = {
        storage_bucket: WINKER_STORAGE_BUCKET,
        storage_path: storagePath,
        storage_status: status,
        storage_error: errorClass,
        storage_uploaded_at: status === 'available' ? now : null,
    }
    if (contentType) storagePatch.file_mime_type = contentType
    if (fileSizeBytes != null) storagePatch.file_size_bytes = fileSizeBytes
    if (fileName) storagePatch.file_name = fileName
    const { error } = await adminClient
        .from('winker_documents')
        .update(storagePatch)
        .eq('condominio_id', condominioId)
        .eq('id_document', documentId)

    if (!error) return
    if (!/storage_|schema cache|does not exist/i.test(error.message || '')) throw error

    const { data: current, error: readError } = await adminClient
        .from('winker_documents')
        .select('raw')
        .eq('condominio_id', condominioId)
        .eq('id_document', documentId)
        .maybeSingle()
    if (readError) throw readError

    const { error: rawError } = await adminClient
        .from('winker_documents')
        .update({
            raw: {
                ...(current?.raw || {}),
                storage: { ...storagePatch },
            },
        })
        .eq('condominio_id', condominioId)
        .eq('id_document', documentId)
    if (rawError) throw rawError
}

async function fetchAllWebDocuments(web: WinkerWebClient, maxPages: number) {
    const homeHtml = await web.html('/intra/meuCondominio/documento')
    const categories = parseWebCategories(homeHtml)
    if (categories.length === 0) throw new Error('WINKER_WEB_DOCUMENT_CATEGORIES_EMPTY')

    const documents: WebDocument[] = []
    for (const category of categories) {
        let path = category.href
        let page = 1
        while (page <= maxPages) {
            const html = await web.html(path)
            documents.push(...parseWebDocuments(html, category))
            const next = nextWebPage(html, page)
            if (!next) break
            path = next.href
            page = next.page
        }
    }

    const unique = new Map(documents.map((document) => [document.id_document, document]))
    return {
        homeHtml,
        categories,
        documents: [...unique.values()],
    }
}

async function runWinkerWebStage<T>(stage: string, operation: () => Promise<T>) {
    try {
        return await operation()
    } catch (err: any) {
        const errorClass = String(err?.message || err?.code || err?.name || (err == null ? 'NULL' : typeof err)).split(/\s|:/)[0].slice(0, 60) || 'UNKNOWN'
        throw new Error(`WINKER_WEB_STAGE_${stage}_${errorClass}`)
    }
}

async function syncOneWinkerWebDocument(adminClient: any, web: WinkerWebClient, document: WebDocument, condominioId: string, now: string) {
    try {
        const file = await runWinkerWebStage('file', () => web.file(document.app_download_path))
        const storagePath = `${condominioId}/${document.id_document}.${file.extension}`
        const baseName = (document.file.original_name || document.name || document.id_document).replace(/\.[a-z0-9]{1,8}$/i, '')
        const fileName = `${baseName}.${file.extension}`
        const { error: uploadError } = await runWinkerWebStage('upload', () => adminClient.storage
            .from(WINKER_STORAGE_BUCKET)
            .upload(storagePath, new Blob([file.bytes], { type: file.contentType }), {
                contentType: file.contentType,
                upsert: true,
            }))
        if (uploadError) throw uploadError

        await runWinkerWebStage('mark', () => markWebDocumentStorage(adminClient, condominioId, document.id_document, storagePath, 'available', now, null, file.contentType, file.bytes.byteLength, fileName))
        return true
    } catch (err: any) {
        const errorClass = String(err?.message || err).split(/\s|:/)[0].slice(0, 80)
        console.error(JSON.stringify({
            fn: 'syncWinkerWeb',
            status: 'document_error',
            condominio_id: condominioId,
            external_id: document.id_document,
            error_class: errorClass,
        }))
        try {
            await markWebDocumentStorage(adminClient, condominioId, document.id_document, null, 'error', now, errorClass)
        } catch (_statusError) {
            // Preserve the download failure as the decisive signal.
        }
        return false
    }
}

async function syncWinkerWeb(adminClient: any, web: WinkerWebClient, body: SyncBody, condominioId: string, now: string) {
    await runWinkerWebStage('login', () => web.login())
    const result = await runWinkerWebStage('list', () => fetchAllWebDocuments(web, body.max_pages ?? 100))
    const idPortal = await runWinkerWebStage('portal', () => resolveWebPortalId(adminClient, condominioId, body))
    const portalName = parseWebPortalName(result.homeHtml)
    await runWinkerWebStage('bucket', () => ensureWinkerStorageBucket(adminClient))
    await runWinkerWebStage('metadata', () => upsertDocuments(adminClient, condominioId, idPortal, result.documents, now))

    let downloaded = 0
    let downloadErrors = 0
    const concurrency = Math.max(1, Math.min(8, Number(Deno.env.get('WINKER_WEB_CONCURRENCY') || 6)))
    for (let index = 0; index < result.documents.length; index += concurrency) {
        const batch = result.documents.slice(index, index + concurrency)
        const outcomes = await Promise.all(batch.map((document) => syncOneWinkerWebDocument(adminClient, web, document, condominioId, now)))
        downloaded += outcomes.filter(Boolean).length
        downloadErrors += outcomes.filter((outcome) => !outcome).length
    }

    if (downloadErrors > 0) throw new Error(`WINKER_WEB_DOCUMENT_DOWNLOAD_ERRORS ${downloadErrors}`)

    return {
        idPortal,
        portalName,
        rawMe: {
            source: 'winker_web',
            portal_name: portalName,
            categories: result.categories.map((category) => ({ id: category.id, label: category.label })),
        },
        stats: {
            web_categories: result.categories.length,
            web_documents: result.documents.length,
            web_documents_downloaded: downloaded,
            web_documents_download_errors: downloadErrors,
            web_financial_documents: result.documents.filter(isFinancialDocument).length,
        },
    }
}

async function syncExternalRecords(adminClient: any, winker: WinkerClient, condominioId: string, idPortal: number, now: string) {
    const specs = [
        { recordType: 'portal_about', path: `/portal/${idPortal}/about`, idField: null, titleField: null },
        { recordType: 'provider', path: `/portal/${idPortal}/provider`, idField: 'id_provider', titleField: 'name' },
        { recordType: 'booking_resource', path: `/booking?id_portal=${idPortal}`, idField: 'id_resource', titleField: 'name' },
        { recordType: 'maintenance', path: `/maintenance?id_portal=${idPortal}`, idField: 'id_maintenance', titleField: 'name' },
    ]

    const stats: Record<string, number> = {}

    for (const spec of specs) {
        try {
            const result = await winker.get(spec.path)
            const body = result?.body
            const items = Array.isArray(body) ? body : body ? [body] : []
            const rows = items.map((item: any, index: number) => ({
                condominio_id: condominioId,
                id_portal: idPortal,
                record_type: spec.recordType,
                external_id: spec.idField && item?.[spec.idField] ? String(item[spec.idField]) : `${idPortal}:${index}`,
                title: spec.titleField && item?.[spec.titleField] ? String(item[spec.titleField]) : null,
                raw: item,
                last_synced_at: now,
            }))

            if (rows.length > 0) {
                const { error } = await adminClient
                    .from('winker_external_records')
                    .upsert(rows, { onConflict: 'condominio_id,record_type,external_id' })
                if (error) throw error
            }

            stats[spec.recordType] = rows.length
        } catch (_err) {
            stats[`${spec.recordType}_errors`] = 1
        }
    }

    return stats
}

function isFinancialDocument(document: any) {
    const searchable = [
        document.name,
        document.type,
        document.description,
        document.file?.original_name,
    ].filter(Boolean).join(' ')

    return /balancete|demonstrativo|prestação|prestacao|receitas?|despesas?|contas/i.test(searchable)
}

async function readRequestBody(req: Request): Promise<SyncBody> {
    if (req.method === 'GET') return {}
    try {
        return await req.json()
    } catch {
        return {}
    }
}

async function readJson(response: Response) {
    const text = await response.text()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return { raw: text.slice(0, 500) }
    }
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

function safeError(body: any) {
    if (!body) return 'empty response'
    if (typeof body === 'string') return body.slice(0, 300)
    return body.description || body.message || JSON.stringify(body).slice(0, 300)
}

function toNumber(value: unknown) {
    if (value == null || value === '') return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

function toBoolean(value: unknown) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    if (typeof value === 'string') return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase())
    return false
}

function parseDateTime(value: unknown) {
    if (!value || typeof value !== 'string') return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function maskIdentifier(value: string) {
    if (value.includes('@')) {
        const [name, domain] = value.split('@')
        return `${name.slice(0, 2)}***@${domain}`
    }
    return `${value.slice(0, 2)}***${value.slice(-2)}`
}

function maskAppKey(value: string) {
    return `***${value.slice(-4)}`
}
