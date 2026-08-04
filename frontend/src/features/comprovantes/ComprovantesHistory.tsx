import { Fragment, useState, useEffect, useCallback } from 'react'
import {
    FileText, Download, Search,
    ChevronDown, ChevronUp,
    ShieldAlert, AlertTriangle, Clock, CheckCircle2,
    XCircle, RefreshCw, Loader2, Building2, User, Check, Eye,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

interface ComprovItem {
    id: string
    arquivo_nome: string
    arquivo_url: string | null
    tipo_documento: string | null
    tipo_arquivo: string | null
    valor: number | null
    data_emissao: string | null
    status_auditoria: string
    fraud_score: number | null
    fraud_flags: string[]
    ocr_razao_social: string | null
    ocr_cnpj: string | null
    natureza_servico: string | null
    pix_autotransferencia: boolean | null
    pix_e2e_id: string | null
    pix_recebedor_banco: string | null
    morador_id: string | null
    morador_nome: string | null
    morador_unidade: string | null
    morador_bloco: string | null
    motivo_rejeicao: string | null
    ultima_acao: string | null
    ultima_acao_por: string | null
    created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
    suspeito:  { label: 'Suspeito',  icon: ShieldAlert,   color: 'bg-rose-100 text-rose-700' },
    alerta:    { label: 'Alerta',    icon: AlertTriangle,  color: 'bg-amber-100 text-amber-700' },
    pendente:  { label: 'Pendente',  icon: Clock,          color: 'bg-slate-100 text-slate-600' },
    auditado:  { label: 'Aprovado',  icon: CheckCircle2,   color: 'bg-emerald-100 text-emerald-700' },
    rejeitado: { label: 'Rejeitado', icon: XCircle,        color: 'bg-rose-100 text-rose-700' },
}

const TIPO_CONFIG: Record<string, string> = {
    COMPROVANTE_PIX: 'Pix',
    NOTA_FISCAL:     'Nota Fiscal',
    BOLETO:          'Boleto',
    RECIBO:          'Recibo',
    DESCONHECIDO:    'Desconhecido',
}

const STATUS_FILTERS = [
    { value: 'todos', label: 'Todos os status', icon: FileText },
    { value: 'auditado', label: 'Aprovados', icon: CheckCircle2 },
    { value: 'suspeito', label: 'Suspeitos', icon: ShieldAlert },
    { value: 'alerta', label: 'Alertas', icon: AlertTriangle },
    { value: 'pendente', label: 'Pendentes', icon: Clock },
    { value: 'rejeitado', label: 'Rejeitados', icon: XCircle },
] as const

interface ComprovantesHistoryProps {
    onOpenReview?: (itemId: string) => void
}

export function ComprovantesHistory({ onOpenReview }: ComprovantesHistoryProps) {
    const { user } = useAuth()
    const [items, setItems] = useState<ComprovItem[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)

    // Filters
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState('todos')
    const [filterTipo, setFilterTipo] = useState('todos')
    const [filterMorador, setFilterMorador] = useState('')
    const [statusMenuOpen, setStatusMenuOpen] = useState(false)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [sortBy, setSortBy] = useState<'created_at' | 'fraud_score' | 'valor'>('created_at')
    const [downloadingId, setDownloadingId] = useState<string | null>(null)

    const fmt = (v: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    const load = useCallback(async () => {
        if (!user) return
        setLoading(true)
        try {
            let query = supabase
                .from('view_historico_comprovantes')
                .select('*')
                .limit(200)

            if (user.role !== 'master' && user.condominio_id) {
                query = query.eq('condominio_id', user.condominio_id)
            }
            if (filterStatus !== 'todos') query = query.eq('status_auditoria', filterStatus)
            if (filterTipo !== 'todos') query = query.eq('tipo_documento', filterTipo)
            if (dateFrom) query = query.gte('data_emissao', dateFrom)
            if (dateTo) query = query.lte('data_emissao', dateTo)

            if (sortBy === 'fraud_score') query = query.order('fraud_score', { ascending: false })
            else if (sortBy === 'valor') query = query.order('valor', { ascending: false })
            else query = query.order('created_at', { ascending: false })

            const { data, error } = await query
            if (error) throw error
            setItems((data || []) as ComprovItem[])
        } catch (err: any) {
            console.error('ComprovantesHistory:', err.message)
        } finally {
            setLoading(false)
        }
    }, [user, filterStatus, filterTipo, dateFrom, dateTo, sortBy])

    useEffect(() => { load() }, [load])

    const handleDownload = async (item: ComprovItem, event: React.MouseEvent) => {
        event.stopPropagation()

        if (!item.arquivo_url) return

        if (item.arquivo_url.startsWith('http://') || item.arquivo_url.startsWith('https://')) {
            window.open(item.arquivo_url, '_blank', 'noopener,noreferrer')
            return
        }

        try {
            setDownloadingId(item.id)
            const { data, error } = await supabase.storage
                .from('comprovantes')
                .createSignedUrl(item.arquivo_url, 60)

            if (error) throw error

            window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
        } catch (err) {
            console.error('Erro ao gerar link assinado do comprovante:', err)
        } finally {
            setDownloadingId(null)
        }
    }

    // Client-side search + morador filter
    const filtered = items.filter(item => {
        const q = search.toLowerCase()
        const matchSearch = !q ||
            item.arquivo_nome?.toLowerCase().includes(q) ||
            item.ocr_razao_social?.toLowerCase().includes(q) ||
            item.ocr_cnpj?.includes(q) ||
            item.pix_e2e_id?.toLowerCase().includes(q) ||
            item.morador_nome?.toLowerCase().includes(q)

        const matchMorador = !filterMorador ||
            item.morador_nome?.toLowerCase().includes(filterMorador.toLowerCase()) ||
            item.morador_unidade?.toLowerCase().includes(filterMorador.toLowerCase())

        return matchSearch && matchMorador
    })

    const scoreColor = (s: number | null) => {
        if (!s || s < 30) return 'bg-emerald-50 text-emerald-700'
        if (s < 60) return 'bg-amber-50 text-amber-700'
        return 'bg-rose-50 text-rose-700'
    }

    const stats = {
        total: items.length,
        suspeitos: items.filter(i => i.status_auditoria === 'suspeito').length,
        aprovados: items.filter(i => i.status_auditoria === 'auditado').length,
        valorTotal: items.filter(i => i.status_auditoria === 'auditado')
            .reduce((s, i) => s + (Number(i.valor) || 0), 0)
    }

    const activeStatusFilter = STATUS_FILTERS.find(option => option.value === filterStatus) || STATUS_FILTERS[0]
    const ActiveStatusIcon = activeStatusFilter.icon

    const openReview = (item: ComprovItem) => {
        if (onOpenReview) {
            onOpenReview(item.id)
            return
        }
        setExpanded(current => current === item.id ? null : item.id)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Histórico de Comprovantes</h2>
                    <p className="text-slate-500 text-sm mt-1">Todos os documentos enviados — com download e trilha de auditoria</p>
                </div>
                <button onClick={load} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <RefreshCw className={cn("h-4 w-4 text-slate-400", loading && "animate-spin")} />
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total', value: stats.total, color: 'text-slate-900' },
                    { label: 'Aprovados', value: stats.aprovados, color: 'text-emerald-600' },
                    { label: 'Suspeitos', value: stats.suspeitos, color: 'text-rose-600' },
                    { label: 'Valor Aprovado', value: fmt(stats.valorTotal), color: 'text-indigo-600' },
                ].map(k => (
                    <div key={k.label} className="bg-white rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{k.label}</p>
                        <p className={cn("text-xl font-black mt-1", k.color)}>{k.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por arquivo, empresa, CNPJ, chave Pix, morador..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="relative">
                        <button
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={statusMenuOpen}
                            onClick={() => setStatusMenuOpen(open => !open)}
                            className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm outline-none transition-colors hover:border-indigo-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        >
                            <ActiveStatusIcon className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="min-w-0 flex-1 truncate">{activeStatusFilter.label}</span>
                            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", statusMenuOpen && "rotate-180")} />
                        </button>
                        {statusMenuOpen && (
                            <div
                                role="listbox"
                                aria-label="Filtrar por status"
                                className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
                            >
                                {STATUS_FILTERS.map(option => {
                                    const OptionIcon = option.icon
                                    const selected = filterStatus === option.value
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            role="option"
                                            aria-selected={selected}
                                            onClick={() => {
                                                setFilterStatus(option.value)
                                                setStatusMenuOpen(false)
                                            }}
                                            className={cn(
                                                "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                                                selected ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                                            )}
                                        >
                                            <OptionIcon className={cn("h-4 w-4 shrink-0", selected ? "text-indigo-600" : "text-slate-400")} />
                                            <span className="flex-1">{option.label}</span>
                                            {selected && <Check className="h-4 w-4 text-indigo-600" />}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <select
                        value={filterTipo}
                        onChange={e => setFilterTipo(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                        <option value="todos">Todos os tipos</option>
                        <option value="COMPROVANTE_PIX">Pix</option>
                        <option value="NOTA_FISCAL">Nota Fiscal</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="RECIBO">Recibo</option>
                    </select>

                    <input
                        type="text"
                        placeholder="Filtrar morador / unidade"
                        value={filterMorador}
                        onChange={e => setFilterMorador(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />

                    <input type="date" title="De" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <input type="date" title="Até" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>

                <div className="flex gap-2 text-xs">
                    <span className="text-slate-400 font-semibold py-1">Ordenar:</span>
                    {([['created_at', 'Mais recentes'], ['fraud_score', 'Maior risco'], ['valor', 'Maior valor']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setSortBy(key)}
                            className={cn("px-3 py-1 rounded-lg font-bold transition-colors",
                                sortBy === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}>
                            {label}
                        </button>
                    ))}
                    <span className="ml-auto text-slate-400 py-1">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                    <p className="text-slate-400 text-sm">Carregando histórico...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center">
                    <FileText className="h-14 w-14 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-900">Nenhum comprovante encontrado</h3>
                    <p className="text-slate-400 mt-2 text-sm">Ajuste os filtros ou envie o primeiro comprovante.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                                <th className="px-5 py-3">Documento</th>
                                <th className="px-5 py-3 hidden md:table-cell">Tipo</th>
                                <th className="px-5 py-3 hidden md:table-cell">Morador / Empresa</th>
                                <th className="px-5 py-3 text-right hidden md:table-cell">Valor</th>
                                <th className="px-5 py-3 text-center">Score</th>
                                <th className="px-5 py-3 text-center">Status</th>
                                <th className="px-5 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filtered.map(item => {
                                const statusCfg = STATUS_CONFIG[item.status_auditoria] || STATUS_CONFIG.pendente
                                const StatusIcon = statusCfg.icon
                                const isExp = expanded === item.id

                                return (
                                    <Fragment key={item.id}>
                                        <tr key={item.id}
                                            className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                            onClick={() => openReview(item)}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault()
                                                    openReview(item)
                                                }
                                            }}
                                            tabIndex={0}
                                            aria-label={`Abrir revisão de ${item.arquivo_nome}`}>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                                        <FileText className="h-4 w-4 text-indigo-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900 truncate max-w-[180px]">
                                                            {item.arquivo_nome}
                                                        </p>
                                                        <p className="text-xs text-slate-400">
                                                            {item.data_emissao
                                                                ? new Date(item.data_emissao).toLocaleDateString('pt-BR')
                                                                : new Date(item.created_at).toLocaleDateString('pt-BR')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 hidden md:table-cell">
                                                    <span className="inline-flex items-center gap-1.5 text-sm">
                                                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                                                        {TIPO_CONFIG[item.tipo_documento || ''] || 'Desconhecido'}
                                                    </span>
                                                {item.pix_autotransferencia && (
                                                    <span className="ml-2 text-[10px] bg-rose-100 text-rose-700 font-black px-1.5 py-0.5 rounded-full uppercase">Auto!</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 hidden md:table-cell">
                                                {item.morador_nome ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                        <span className="text-sm font-semibold text-slate-700">{item.morador_nome}</span>
                                                        <span className="text-xs text-slate-400">Apto {item.morador_unidade}</span>
                                                    </div>
                                                ) : item.ocr_razao_social ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                        <span className="text-sm text-slate-600 truncate max-w-[140px]">{item.ocr_razao_social}</span>
                                                    </div>
                                                ) : <span className="text-xs text-slate-300">—</span>}
                                            </td>
                                            <td className="px-5 py-3 text-right hidden md:table-cell">
                                                <span className="text-sm font-bold text-slate-900">
                                                    {item.valor ? fmt(Number(item.valor)) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={cn("text-xs font-black px-2 py-1 rounded-lg", scoreColor(item.fraud_score))}>
                                                    {item.fraud_score ?? '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={cn("inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full uppercase", statusCfg.color)}>
                                                    <StatusIcon className="h-3 w-3" />
                                                    {statusCfg.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {onOpenReview && (
                                                        <button
                                                            type="button"
                                                            onClick={event => {
                                                                event.stopPropagation()
                                                                onOpenReview(item.id)
                                                            }}
                                                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 transition-colors hover:bg-indigo-100"
                                                            title="Abrir revisão do comprovante"
                                                        >
                                                            <Eye className="h-3.5 w-3.5" />
                                                            <span className="hidden sm:inline">Revisar</span>
                                                        </button>
                                                    )}
                                                    {item.arquivo_url && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDownload(item, e)}
                                                            className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                                                            title="Ver/baixar documento"
                                                            disabled={downloadingId === item.id}
                                                        >
                                                            {downloadingId === item.id ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Download className="h-3.5 w-3.5" />
                                                            )}
                                                        </button>
                                                    )}
                                                    {isExp
                                                        ? <ChevronUp className="h-4 w-4 text-slate-400" />
                                                        : <ChevronDown className="h-4 w-4 text-slate-400" />}
                                                </div>
                                            </td>
                                        </tr>
                                        {isExp && (
                                            <tr key={item.id + '_exp'}>
                                                <td colSpan={7} className="px-5 pb-4 pt-2 bg-slate-50/50">
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                                        {[
                                                            { label: 'E2E ID Pix', value: item.pix_e2e_id },
                                                            { label: 'Banco recebedor', value: item.pix_recebedor_banco },
                                                            { label: 'CNPJ', value: item.ocr_cnpj },
                                                            { label: 'Natureza', value: item.natureza_servico },
                                                            { label: 'Revisado por', value: item.ultima_acao_por },
                                                            { label: 'Última ação', value: item.ultima_acao },
                                                            { label: 'Motivo rejeição', value: item.motivo_rejeicao },
                                                            { label: 'Flags', value: Array.isArray(item.fraud_flags) ? item.fraud_flags.join(', ') : null },
                                                        ].filter(d => d.value).map(d => (
                                                            <div key={d.label} className="bg-white rounded-xl p-3 border border-slate-100">
                                                                <p className="text-[10px] font-black text-slate-400 uppercase">{d.label}</p>
                                                                <p className="font-bold text-slate-900 mt-0.5 break-all">{d.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
