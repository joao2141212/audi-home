import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: any

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
}

const WINKER_BASE_URL = 'https://api.winker.com.br/v1'

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
                key: String(this.appKey),
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

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
        const winker = new WinkerClient(
            credentials.baseUrl,
            credentials.username,
            credentials.password,
            credentials.appKey,
        )

        const loginBody = await winker.login()
        const meResult = await winker.get('/me')
        const me = meResult?.body || {}

        idPortal = resolvePortalId(body, me)
        if (!idPortal) throw new Error('WINKER_PORTAL_NOT_FOUND')

        const portalName = resolvePortalName(me, idPortal)

        const stats: Record<string, number> = {}
        const now = new Date().toISOString()

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

        return jsonResponse({
            success: true,
            condominio_id: condominioId,
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

        return jsonResponse({ success: false, error: message }, 500)
    }
})

async function getRequestContext(req: Request): Promise<RequestContext> {
    const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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
        Deno.env.get('SUPABASE_ANON_KEY')!,
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

    if (!username || !password || !appKey) {
        throw new Error('WINKER_CREDENTIALS_REQUIRED')
    }

    return { username, password, appKey, baseUrl }
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
    idPortal: number
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

async function upsertDocuments(adminClient: any, condominioId: string, idPortal: number, documents: any[], now: string) {
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
