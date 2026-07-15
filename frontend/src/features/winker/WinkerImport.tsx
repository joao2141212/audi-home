import { useCallback, useEffect, useState } from 'react'
import { Database, FileText, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
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
}

interface WinkerConnection {
    id_portal: number | null
    portal_name: string | null
    username_hint: string | null
    last_sync_at: string | null
    last_sync_status: string | null
    last_sync_error: string | null
}

export function WinkerImport() {
    const { user } = useAuth()
    const [connection, setConnection] = useState<WinkerConnection | null>(null)
    const [documents, setDocuments] = useState<WinkerDocument[]>([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [form, setForm] = useState({
        condominio_id: user?.condominio_id || '',
        username: '',
        password: '',
        key: '',
        id_portal: '',
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
                .select('id, id_document, document_type, name, file_name, file_size_bytes, created_at_winker, is_financial, app_download_url')
                .order('created_at_winker', { ascending: false })
                .limit(80)

            if (user.role !== 'master' && user.condominio_id) {
                connectionQuery = connectionQuery.eq('condominio_id', user.condominio_id)
                docsQuery = docsQuery.eq('condominio_id', user.condominio_id)
            }

            const [{ data: connData }, { data: docData, error: docError }] = await Promise.all([
                connectionQuery.maybeSingle(),
                docsQuery,
            ])

            if (docError) throw docError
            setConnection(connData as WinkerConnection | null)
            setDocuments((docData || []) as WinkerDocument[])
        } catch (err: any) {
            setMessage(err.message)
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => { load() }, [load])

    const sync = async () => {
        setSyncing(true)
        setMessage(null)
        try {
            const body: Record<string, string | number> = {}
            if (form.condominio_id) body.condominio_id = form.condominio_id
            if (form.username) body.username = form.username
            if (form.password) body.password = form.password
            if (form.key) body.key = form.key
            if (form.id_portal) body.id_portal = Number(form.id_portal)

            const { data, error } = await supabase.functions.invoke('sync-winker', { body })
            if (error) throw error
            if (data?.error) throw new Error(data.error)

            setMessage(`Sync OK: ${data?.stats?.documents || 0} documentos, ${data?.stats?.financial_documents || 0} financeiros.`)
            setForm(prev => ({ ...prev, password: '' }))
            await load()
        } catch (err: any) {
            setMessage(err.message || 'Erro ao sincronizar Winker')
        } finally {
            setSyncing(false)
        }
    }

    const financialCount = documents.filter(doc => doc.is_financial).length

    return (
        <div className="space-y-6">
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
                            <p className="font-black text-slate-900">{connection?.portal_name || 'Ainda não sincronizado'}</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-500">ID Winker: {connection?.id_portal || '-'}</p>
                    <p className="text-sm text-slate-500">Conta: {connection?.username_hint || '-'}</p>
                    <p className="text-sm text-slate-500">Último sync: {connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString('pt-BR') : '-'}</p>
                    {connection?.last_sync_error && <p className="text-xs text-rose-600 mt-2">{connection.last_sync_error}</p>}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Documentos</p>
                    <p className="text-3xl font-black text-slate-900 mt-2">{documents.length}</p>
                    <p className="text-sm text-slate-500">últimos documentos importados</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Financeiros</p>
                    <p className="text-3xl font-black text-emerald-600 mt-2">{financialCount}</p>
                    <p className="text-sm text-slate-500">balancetes, demonstrativos e prestações</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-black text-slate-900">Sincronizar agora</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {user?.role === 'master' && (
                        <input
                            value={form.condominio_id}
                            onChange={event => setForm(prev => ({ ...prev, condominio_id: event.target.value }))}
                            placeholder="condominio_id"
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                        />
                    )}
                    <input
                        value={form.username}
                        onChange={event => setForm(prev => ({ ...prev, username: event.target.value }))}
                        placeholder="login Winker"
                        className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                        type="password"
                        value={form.password}
                        onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))}
                        placeholder="senha Winker"
                        className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                        value={form.key}
                        onChange={event => setForm(prev => ({ ...prev, key: event.target.value }))}
                        placeholder="app key"
                        className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                        value={form.id_portal}
                        onChange={event => setForm(prev => ({ ...prev, id_portal: event.target.value }))}
                        placeholder="id_portal opcional"
                        className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                    <button
                        onClick={sync}
                        disabled={syncing}
                        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
                        Sincronizar
                    </button>
                </div>
                {message && <p className="text-sm text-slate-600">{message}</p>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-slate-400" />
                    <h3 className="font-black text-slate-900">Documentos importados</h3>
                </div>
                {loading ? (
                    <div className="p-10 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                                    <th className="px-5 py-3">Documento</th>
                                    <th className="px-5 py-3">Tipo</th>
                                    <th className="px-5 py-3">Arquivo</th>
                                    <th className="px-5 py-3">Criado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {documents.map(doc => (
                                    <tr key={doc.id} className="hover:bg-slate-50/60">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900">{doc.name || doc.id_document}</span>
                                                {doc.is_financial && (
                                                    <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-50 text-emerald-700">Financeiro</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-sm text-slate-500">{doc.document_type || '-'}</td>
                                        <td className="px-5 py-3 text-sm text-slate-500">{doc.file_name || '-'}</td>
                                        <td className="px-5 py-3 text-sm text-slate-500">
                                            {doc.created_at_winker ? new Date(doc.created_at_winker).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
