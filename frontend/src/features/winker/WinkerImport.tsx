import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Database, Download, FileText, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

interface WinkerDocument {
    id: string
    id_document: string
    document_type: string | null
    name: string | null
    file_name: string | null
    file_size_bytes: number | null
    created_at_winker: string | null
    is_financial: boolean
    app_download_url: string | null
    storage_status: string | null
    storage_path: string | null
}

interface WinkerConnection {
    id_portal: number | null
    portal_name: string | null
    username_hint: string | null
    last_sync_at: string | null
    last_sync_status: string | null
    last_sync_error: string | null
}

interface WinkerExternalRecord {
    id: string
    record_type: string
    external_id: string
    title: string | null
    last_synced_at: string | null
}

interface WinkerDivision {
    id: string
    id_division: number
    name: string | null
    last_synced_at: string | null
}

interface WinkerUnit {
    id: string
    id_unit: number
    name: string | null
    division_name: string | null
    administrative: boolean | null
    last_synced_at: string | null
}

const DOCUMENT_PAGE_SIZE = 100

function formatWinkerDate(value: string | null, withTime = false) {
    if (!value) return 'Data não informada'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Data não informada'
    return withTime ? date.toLocaleString('pt-BR') : date.toLocaleDateString('pt-BR')
}

function formatWinkerFileSize(bytes: number | null) {
    if (!bytes || bytes <= 0) return 'Tamanho não informado'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DOCUMENT_GROUP_ORDER = [
    'Balancetes',
    'Prestação de contas',
    'Demonstrativos',
    'Regimento interno',
    'Outros documentos',
] as const

type WinkerDocumentGroup = typeof DOCUMENT_GROUP_ORDER[number]

function getWinkerDocumentGroup(document: WinkerDocument): WinkerDocumentGroup {
    const searchText = [document.document_type, document.name, document.file_name]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

    if (searchText.includes('balancete')) return 'Balancetes'
    if (searchText.includes('prestacao de contas') || searchText.includes('prestacao-de-contas')) return 'Prestação de contas'
    if (searchText.includes('demonstrativo') || searchText.includes('demonstracao')) return 'Demonstrativos'
    if (searchText.includes('regimento') || searchText.includes('convencao')) return 'Regimento interno'
    return 'Outros documentos'
}

export function WinkerImport() {
    const { user } = useAuth()
    const [connection, setConnection] = useState<WinkerConnection | null>(null)
    const [documents, setDocuments] = useState<WinkerDocument[]>([])
    const [documentTotal, setDocumentTotal] = useState(0)
    const [financialTotal, setFinancialTotal] = useState(0)
    const [externalRecords, setExternalRecords] = useState<WinkerExternalRecord[]>([])
    const [divisions, setDivisions] = useState<WinkerDivision[]>([])
    const [units, setUnits] = useState<WinkerUnit[]>([])
    const [documentPage, setDocumentPage] = useState(0)
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [syncPending, setSyncPending] = useState(false)
    const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null)
    const [selectedDocument, setSelectedDocument] = useState<WinkerDocument | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [recordsMessage, setRecordsMessage] = useState<string | null>(null)
    const [complianceLoading, setComplianceLoading] = useState(false)
    const [compliance, setCompliance] = useState<any | null>(null)
    const [form, setForm] = useState({
        condominio_id: user?.condominio_id || '',
    })

    useEffect(() => {
        setForm(prev => ({ ...prev, condominio_id: prev.condominio_id || user?.condominio_id || '' }))
    }, [user?.condominio_id])

    const load = useCallback(async () => {
        if (!user) return
        setLoading(true)
        try {
            let connectionQuery = supabase
                .from('winker_connections')
                .select('id_portal, portal_name, username_hint, last_sync_at, last_sync_status, last_sync_error')
                .limit(1)

            let docsQuery = supabase
                .from('winker_documents')
                .select('id, id_document, document_type, name, file_name, file_size_bytes, created_at_winker, is_financial, app_download_url, storage_status, storage_path', { count: 'exact' })
                .order('created_at_winker', { ascending: false })
                .range(documentPage * DOCUMENT_PAGE_SIZE, documentPage * DOCUMENT_PAGE_SIZE + DOCUMENT_PAGE_SIZE - 1)

            let financialQuery = supabase
                .from('winker_documents')
                .select('id', { count: 'exact', head: true })
                .eq('is_financial', true)

            let recordsQuery = supabase
                .from('winker_external_records')
                .select('id, record_type, external_id, title, last_synced_at')
                .order('last_synced_at', { ascending: false })
                .limit(200)

            let divisionsQuery = supabase
                .from('winker_divisions')
                .select('id, id_division, name, last_synced_at')
                .order('name', { ascending: true })
                .limit(200)

            let unitsQuery = supabase
                .from('winker_units')
                .select('id, id_unit, name, division_name, administrative, last_synced_at')
                .order('name', { ascending: true })
                .limit(500)

            if (user.role !== 'master' && user.condominio_id) {
                connectionQuery = connectionQuery.eq('condominio_id', user.condominio_id)
                docsQuery = docsQuery.eq('condominio_id', user.condominio_id)
                financialQuery = financialQuery.eq('condominio_id', user.condominio_id)
                recordsQuery = recordsQuery.eq('condominio_id', user.condominio_id)
                divisionsQuery = divisionsQuery.eq('condominio_id', user.condominio_id)
                unitsQuery = unitsQuery.eq('condominio_id', user.condominio_id)
            }

            const [{ data: connData }, { data: docData, count: docCount, error: docError }, { count: financeCount, error: financeError }, { data: recordData, error: recordError }, { data: divisionData, error: divisionError }, { data: unitData, error: unitError }] = await Promise.all([
                connectionQuery.maybeSingle(),
                docsQuery,
                financialQuery,
                recordsQuery,
                divisionsQuery,
                unitsQuery,
            ])

            if (docError) throw docError
            if (financeError) throw financeError
            setConnection(connData as WinkerConnection | null)
            setDocuments((docData || []) as WinkerDocument[])
            setDocumentTotal(docCount || 0)
            setFinancialTotal(financeCount || 0)
            setDivisions((divisionData || []) as WinkerDivision[])
            setUnits((unitData || []) as WinkerUnit[])
            const operationalErrors = [recordError, divisionError, unitError].filter(Boolean)
            if (operationalErrors.length > 0) {
                setExternalRecords([])
                setRecordsMessage('Alguns dados operacionais ainda não estão disponíveis neste projeto.')
                console.error(JSON.stringify({ fn: 'WinkerImport.loadOperationalData', status: 'error', error_class: operationalErrors[0]?.message?.split(/\s|:/)[0] || 'WINKER_OPERATIONAL_DATA_FAILED' }))
            } else {
                setExternalRecords((recordData || []) as WinkerExternalRecord[])
                setRecordsMessage(null)
            }
        } catch (err: any) {
            setMessage(err.message)
        } finally {
            setLoading(false)
        }
    }, [documentPage, user])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        if (!selectedDocument) return
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedDocument(null)
        }
        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    }, [selectedDocument])

    const downloadDocument = async (document: WinkerDocument) => {
        if (!document.storage_path || document.storage_status !== 'available') {
            setMessage(document.storage_status === 'error'
                ? 'Este arquivo apresentou erro durante a sincronização.'
                : 'Este arquivo ainda não está disponível no Storage do Supabase.')
            return
        }

        setDownloadingDocumentId(document.id)
        setMessage(null)
        try {
            const { data, error } = await supabase.functions.invoke('winker-document-download', {
                body: { document_id: document.id },
            })
            if (error || !data?.signed_url) throw error || new Error('WINKER_DOCUMENT_URL_FAILED')

            const anchor = window.document.createElement('a')
            anchor.href = data.signed_url
            anchor.target = '_blank'
            anchor.rel = 'noopener noreferrer'
            anchor.download = document.file_name || document.name || document.id_document
            window.document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            setMessage(`Arquivo disponível para download: ${document.file_name || document.name || document.id_document}`)
        } catch (err: any) {
            const errorClass = String(err?.message || 'WINKER_DOCUMENT_DOWNLOAD_FAILED').split(/\s|:/)[0]
            console.error(JSON.stringify({ fn: 'WinkerImport.downloadDocument', status: 'error', error_class: errorClass }))
            setMessage('Não foi possível gerar o download deste arquivo.')
        } finally {
            setDownloadingDocumentId(null)
        }
    }

    const sync = async () => {
        setSyncing(true)
        setMessage(null)
        let syncTimeout: ReturnType<typeof setTimeout> | null = null
        try {
            const body: Record<string, string | number> = {}
            if (form.condominio_id) body.condominio_id = form.condominio_id

            const syncRequest = supabase.functions.invoke('sync-winker', { body })
            const syncDeadline = new Promise<never>((_, reject) => {
                syncTimeout = setTimeout(() => reject(new Error('WINKER_SYNC_TIMEOUT')), 45_000)
            })
            const { data, error } = await Promise.race([syncRequest, syncDeadline])
            if (error) throw error
            if (data?.error) throw new Error(data.error)

            const documentCount = data?.stats?.documents ?? data?.stats?.web_documents ?? 0
            const financialCount = data?.stats?.financial_documents ?? data?.stats?.web_financial_documents ?? 0
            const downloadedCount = data?.stats?.web_documents_downloaded ?? 0
            setMessage(`Sync OK: ${documentCount} documentos, ${financialCount} financeiros${downloadedCount ? `, ${downloadedCount} arquivos no Supabase.` : '.'}`)
            setSyncPending(false)
            await load()
        } catch (err: any) {
            if (err?.message === 'WINKER_SYNC_TIMEOUT') {
                const condominioId = form.condominio_id || user?.condominio_id
                let runStatus: string | null = null

                if (condominioId) {
                    try {
                        const { data: latestRun } = await supabase
                            .from('winker_sync_runs')
                            .select('status')
                            .eq('condominio_id', condominioId)
                            .order('started_at', { ascending: false })
                            .limit(1)
                            .maybeSingle()
                        runStatus = latestRun?.status || null
                    } catch {
                        // The timeout itself remains the decisive UI signal.
                    }
                }

                console.error(JSON.stringify({
                    fn: 'WinkerImport.sync',
                    status: 'timeout',
                    run_status: runStatus || 'unknown',
                }))
                if (runStatus === 'success') {
                    setSyncPending(false)
                    setMessage('A sincronização foi concluída no Supabase. A resposta demorou, mas os documentos foram atualizados.')
                    await load()
                } else {
                    setSyncPending(runStatus === 'running')
                    setMessage(runStatus === 'running'
                        ? 'A sincronização continua em processamento no Supabase. Aguarde a conclusão antes de iniciar outra.'
                        : 'A sincronização excedeu o tempo de resposta. Atualize a lista e confira o status da execução antes de tentar novamente.')
                }
                return
            }
            const errorClass = String(err?.message || 'WINKER_SYNC_FAILED').split(' ')[0]
            setSyncPending(false)
            console.error(JSON.stringify({ fn: 'WinkerImport.sync', status: 'error', error_class: errorClass }))
            setMessage(err.message || 'Erro ao sincronizar Winker')
        } finally {
            if (syncTimeout) clearTimeout(syncTimeout)
            setSyncing(false)
        }
    }

    const runCompliance = async () => {
        setComplianceLoading(true)
        setMessage(null)
        try {
            const { data, error } = await supabase.functions.invoke('winker-compliance', {
                body: { condominio_id: form.condominio_id || user?.condominio_id },
            })
            if (error) throw error
            if (data?.error) throw new Error(data.error)
            setCompliance(data)
            setMessage(`Compliance: ${data?.stats?.open_findings || 0} achados abertos.`)
        } catch (err: any) {
            const errorClass = String(err?.message || 'WINKER_COMPLIANCE_FAILED').split(' ')[0]
            console.error(JSON.stringify({ fn: 'WinkerImport.runCompliance', status: 'error', error_class: errorClass }))
            setMessage(err.message || 'Erro na correlação de compliance Winker')
        } finally {
            setComplianceLoading(false)
        }
    }

    const documentGroups = DOCUMENT_GROUP_ORDER
        .map(label => ({
            label,
            documents: documents.filter(document => getWinkerDocumentGroup(document) === label),
        }))
        .filter(group => group.documents.length > 0)

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Compliance</p>
                        <h3 className="font-black text-slate-900">Correlação CNPJ e comprovantes</h3>
                        <p className="text-sm text-slate-500 mt-1">Cruza fornecedores Winker com o cadastro interno e os CNPJs extraídos dos comprovantes.</p>
                    </div>
                    <button
                        onClick={runCompliance}
                        disabled={complianceLoading}
                        className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50"
                    >
                        {complianceLoading ? 'Correlacionando...' : 'Correlacionar compliance'}
                    </button>
                </div>
                {compliance && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                        <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Fornecedores Winker</span><strong>{compliance.stats?.winker_providers || 0}</strong></div>
                        <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Comprovantes cruzados</span><strong>{compliance.stats?.receipts_matched_to_winker || 0}</strong></div>
                        <div className="rounded-xl bg-amber-50 p-3"><span className="block text-amber-600">Achados abertos</span><strong>{compliance.stats?.open_findings || 0}</strong></div>
                        <div className="rounded-xl bg-slate-50 p-3"><span className="block text-slate-400">Evidência</span><strong>{compliance.stats?.evidence_gap ? 'Aguardando Winker' : 'Disponível'}</strong></div>
                    </div>
                )}
                {!!compliance?.findings?.length && (
                    <div className="mt-4 space-y-2">
                        {compliance.findings.slice(0, 5).map((finding: any) => (
                            <div key={finding.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
                                <span className="font-semibold text-amber-900">{finding.title}</span>
                                <span className="text-xs font-black uppercase text-amber-700">{finding.severity}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Integração Winker</h2>
                    <p className="text-slate-500 text-sm mt-1">Importação de unidades, documentos financeiros, manutenções e dados operacionais.</p>
                </div>
                <button
                    onClick={load}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                    <RefreshCw className={cn('h-4 w-4 text-slate-400', loading && 'animate-spin')} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-indigo-50 rounded-xl">
                            <Database className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Portal</p>
                            <p className="font-black text-slate-900">
                                {connection?.last_sync_status === 'success'
                                    ? (connection.portal_name || 'Sincronizado')
                                    : connection?.last_sync_status === 'error'
                                        ? 'Erro na sincronização'
                                        : 'Ainda não sincronizado'}
                            </p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-500">ID Winker: {connection?.id_portal || 'não exposto pelo portal web'}</p>
                    <p className="text-sm text-slate-500">Conta: {connection?.username_hint || '-'}</p>
                    <p className="text-sm text-slate-500">Último sync: {connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString('pt-BR') : '-'}</p>
                    {connection?.last_sync_error && <p className="text-xs text-rose-600 mt-2">{connection.last_sync_error}</p>}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Documentos</p>
                    <p className="text-3xl font-black text-slate-900 mt-2">{documentTotal}</p>
                    <p className="text-sm text-slate-500">documentos importados</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Financeiros</p>
                    <p className="text-3xl font-black text-emerald-600 mt-2">{financialTotal}</p>
                    <p className="text-sm text-slate-500">balancetes, demonstrativos e prestações</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-black text-slate-900">Sincronizar agora</h3>
                </div>
                <p className="text-sm text-slate-500">A sincronização usa exclusivamente a credencial Winker protegida no backend. Nenhum login ou token fica no navegador.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {user?.role === 'master' && (
                        <input
                            value={form.condominio_id}
                            onChange={event => setForm(prev => ({ ...prev, condominio_id: event.target.value }))}
                            placeholder="condominio_id"
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                        />
                    )}
                    <button
                        onClick={sync}
                        disabled={syncing || syncPending}
                        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
                        Sincronizar
                    </button>
                </div>
                {message && <p className="text-sm text-slate-600">{message}</p>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Divisões</p>
                    <p className="text-3xl font-black text-slate-900 mt-2">{divisions.length}</p>
                    <p className="text-sm text-slate-500">divisões retornadas pelo Winker</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Unidades</p>
                    <p className="text-3xl font-black text-indigo-600 mt-2">{units.length}</p>
                    <p className="text-sm text-slate-500">unidades retornadas pelo Winker</p>
                </div>
            </div>

            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide font-black text-indigo-500">Estrutura do portal</p>
                        <h3 className="font-black text-slate-900 mt-1">Unidades sincronizadas</h3>
                        <p className="text-sm text-slate-500 mt-1">Cada unidade recebida do Winker fica visível como um cartão independente.</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{units.length} unidades</span>
                </div>
                {loading ? (
                    <div className="p-10 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                ) : units.length === 0 ? (
                    <div className="m-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <p className="font-bold text-slate-700">Nenhuma unidade sincronizada ainda.</p>
                        <p className="text-sm text-slate-500 mt-1">Execute uma sincronização para importar a estrutura do condomínio.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 bg-slate-50/60 p-5">
                        {units.map(unit => (
                            <article key={unit.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-xl bg-indigo-50 p-2.5">
                                        <Database className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-black text-slate-900 break-words">{unit.name || `Unidade ${unit.id_unit}`}</h4>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">ID Winker: {unit.id_unit}</p>
                                    </div>
                                </div>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <span className={cn(
                                        'rounded-full px-2.5 py-1 text-xs font-black',
                                        unit.administrative ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                                    )}>
                                        {unit.administrative ? 'Administrativa' : 'Residencial'}
                                    </span>
                                    <span className="max-w-full rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 break-words">
                                        {unit.division_name || 'Sem divisão informada'}
                                    </span>
                                </div>
                                <p className="mt-4 text-xs text-slate-400">Sincronizada em {formatWinkerDate(unit.last_synced_at, true)}</p>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-5 border-b border-slate-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-indigo-50 p-2.5">
                            <FileText className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide font-black text-indigo-500">Acervo do Winker</p>
                            <h3 className="font-black text-slate-900 mt-1">Documentos importados</h3>
                            <p className="text-sm text-slate-500 mt-1">Cada documento fica separado por tipo, arquivo, data e disponibilidade.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-black">
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{documentTotal} documentos</span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{financialTotal} financeiros</span>
                    </div>
                </div>
                {loading ? (
                    <div className="p-10 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                ) : documents.length === 0 ? (
                    <div className="m-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <p className="font-bold text-slate-700">Nenhum documento importado.</p>
                        <p className="text-sm text-slate-500 mt-1">Os arquivos sincronizados pelo Winker aparecerão aqui.</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-5 bg-slate-50/60 p-5">
                            {documentGroups.map(group => (
                                <section key={group.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="mb-4 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-wide text-indigo-500">Categoria de documentos</p>
                                            <h4 className="mt-1 text-lg font-black text-slate-900">{group.label}</h4>
                                        </div>
                                        <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{group.documents.length} {group.documents.length === 1 ? 'documento' : 'documentos'}</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                        {group.documents.map(doc => (
                                            <article key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDocument(doc)}
                                                    className="block w-full text-left"
                                                    aria-label={`Abrir detalhes de ${doc.name || doc.id_document}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="rounded-xl bg-slate-100 p-2">
                                                            <FileText className="h-5 w-5 text-slate-500" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <h4 className="h-12 overflow-hidden break-words font-black leading-6 text-slate-900">{doc.name || doc.id_document}</h4>
                                                                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-indigo-400" />
                                                            </div>
                                                            <p className="mt-1 truncate text-xs font-semibold text-slate-400">{doc.file_name || doc.document_type || 'Arquivo não informado'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                                                        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">{doc.document_type || 'Documento'}</span>
                                                        <span className="text-xs font-semibold text-slate-400">{formatWinkerDate(doc.created_at_winker)}</span>
                                                    </div>
                                                </button>
                                                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                                    <span className={cn(
                                                        'text-xs font-black',
                                                        doc.storage_status === 'available' ? 'text-emerald-600' : doc.storage_status === 'error' ? 'text-rose-600' : 'text-slate-500'
                                                    )}>
                                                        {doc.storage_status === 'available' ? 'Arquivo disponível' : doc.storage_status === 'error' ? 'Erro no arquivo' : 'Aguardando arquivo'}
                                                    </span>
                                                    {doc.storage_status === 'available' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => downloadDocument(doc)}
                                                            disabled={downloadingDocumentId === doc.id}
                                                            aria-label={`Baixar ${doc.name || doc.file_name || doc.id_document}`}
                                                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
                                                        >
                                                            {downloadingDocumentId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                                            Baixar
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                {documentTotal === 0
                                    ? '0 documentos'
                                    : `Exibindo ${documentPage * DOCUMENT_PAGE_SIZE + 1}-${Math.min((documentPage + 1) * DOCUMENT_PAGE_SIZE, documentTotal)} de ${documentTotal}`}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setDocumentPage(page => Math.max(0, page - 1))}
                                    disabled={documentPage === 0 || loading}
                                    className="rounded-xl border border-slate-200 px-3 py-2 font-bold transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setDocumentPage(page => page + 1)}
                                    disabled={(documentPage + 1) * DOCUMENT_PAGE_SIZE >= documentTotal || loading}
                                    className="rounded-xl border border-slate-200 px-3 py-2 font-bold transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Próxima
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-5 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wide font-black text-slate-500">Outros dados do portal</p>
                        <h3 className="font-black text-slate-900 mt-1">Dados operacionais sincronizados</h3>
                        <p className="text-sm text-slate-500 mt-1">Fornecedores, manutenções, recursos e registros retornados pelo Winker.</p>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{externalRecords.length} registros</span>
                </div>
                {recordsMessage && <p className="mx-5 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{recordsMessage}</p>}
                {loading ? (
                    <div className="p-10 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                ) : externalRecords.length === 0 ? (
                    <div className="m-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <p className="font-bold text-slate-700">Nenhum dado operacional sincronizado ainda.</p>
                        <p className="text-sm text-slate-500 mt-1">Fornecedores e outros registros aparecerão após a sincronização.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 bg-slate-50/60 p-5">
                        {externalRecords.map(record => (
                            <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-violet-700">
                                            {record.record_type.replace(/_/g, ' ')}
                                        </span>
                                        <h4 className="mt-3 break-words font-black text-slate-900">{record.title || 'Registro sem título'}</h4>
                                    </div>
                                    <Database className="h-5 w-5 shrink-0 text-slate-300" />
                                </div>
                                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">ID externo</p>
                                        <p className="mt-1 break-words text-sm font-semibold text-slate-700">{record.external_id}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Sincronizado</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-700">{formatWinkerDate(record.last_synced_at, true)}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {selectedDocument && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
                    role="presentation"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) setSelectedDocument(null)
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="winker-document-title"
                        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="rounded-xl bg-indigo-50 p-2.5">
                                    <FileText className="h-5 w-5 text-indigo-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-black uppercase tracking-wide text-indigo-500">Detalhes do documento</p>
                                    <h3 id="winker-document-title" className="mt-1 break-words text-xl font-black text-slate-900">{selectedDocument.name || selectedDocument.id_document}</h3>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDocument(null)}
                                aria-label="Fechar detalhes"
                                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Categoria</p>
                                <p className="mt-1 font-bold text-slate-800">{getWinkerDocumentGroup(selectedDocument)}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Tipo</p>
                                <p className="mt-1 font-bold text-slate-800">{selectedDocument.document_type || 'Documento'}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Arquivo</p>
                                <p className="mt-1 break-words font-bold text-slate-800">{selectedDocument.file_name || 'Arquivo não informado'}</p>
                                <p className="mt-1 text-xs text-slate-400">{formatWinkerFileSize(selectedDocument.file_size_bytes)}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Recebido</p>
                                <p className="mt-1 font-bold text-slate-800">{formatWinkerDate(selectedDocument.created_at_winker)}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Status</p>
                                <p className={cn(
                                    'mt-1 font-bold',
                                    selectedDocument.storage_status === 'available' ? 'text-emerald-600' : selectedDocument.storage_status === 'error' ? 'text-rose-600' : 'text-slate-600'
                                )}>
                                    {selectedDocument.storage_status === 'available' ? 'Arquivo disponível' : selectedDocument.storage_status === 'error' ? 'Erro no arquivo' : 'Aguardando arquivo'}
                                </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">ID Winker</p>
                                <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-700">{selectedDocument.id_document}</p>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedDocument(null)}
                                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                                Fechar
                            </button>
                            {selectedDocument.storage_status === 'available' && (
                                <button
                                    type="button"
                                    onClick={() => downloadDocument(selectedDocument)}
                                    disabled={downloadingDocumentId === selectedDocument.id}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
                                >
                                    {downloadingDocumentId === selectedDocument.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    Baixar documento
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
