import { useState, useEffect, useCallback } from 'react'
import {
    ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
    MessageSquare, ChevronDown, ChevronUp, Clock, Loader2, RefreshCw,
    FileText, Building2, Calendar, DollarSign, Fingerprint, Download, Eye, X, ArrowLeft
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

interface QueueItem {
    id: string
    condominio_id: string
    arquivo_nome: string
    arquivo_url: string | null
    tipo_arquivo: string | null
    valor: number | null
    data_emissao: string | null
    status_auditoria: string
    fraud_score: number | null
    fraud_flags: string[]
    ocr_razao_social: string | null
    ocr_cnpj: string | null
    cnpj_status: string | null
    natureza_servico: string | null
    descricao: string | null
    created_at: string
    motivo_rejeicao: string | null
    ultima_acao: string | null
    ultima_acao_em: string | null
}

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
    SEM_CNPJ:             { label: 'Sem CNPJ', color: 'bg-rose-100 text-rose-700' },
    CNPJ_BAIXADA:         { label: 'CNPJ Baixado', color: 'bg-rose-100 text-rose-700' },
    CNPJ_INAPTA:          { label: 'CNPJ Inapta', color: 'bg-rose-100 text-rose-700' },
    CNAE_INCOMPATIVEL:    { label: 'CNAE Incompatível', color: 'bg-amber-100 text-amber-700' },
    POSSIVEL_DUPLICATA:   { label: 'Possível Duplicata', color: 'bg-rose-100 text-rose-700' },
    BAIXA_CONFIANCA_OCR:  { label: 'OCR Incerto', color: 'bg-slate-100 text-slate-600' },
    DOCUMENTO_INVALIDO:   { label: 'Doc Inválido', color: 'bg-rose-100 text-rose-700' },
}

interface ApprovalQueueProps {
    initialItemId?: string | null
    onBackToHistory?: () => void
}

export function ApprovalQueue({ initialItemId, onBackToHistory }: ApprovalQueueProps) {
    const { user } = useAuth()
    const [items, setItems] = useState<QueueItem[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [motivos, setMotivos] = useState<Record<string, string>>({})
    const [filter, setFilter] = useState<'todos' | 'suspeito' | 'alerta' | 'pendente'>('todos')
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
    const [previewItem, setPreviewItem] = useState<QueueItem | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const load = useCallback(async () => {
        if (!user?.condominio_id && user?.role !== 'master') return
        setLoading(true)
        try {
            let query = supabase
                .from('view_fila_revisao')
                .select('*')

            if (user.role !== 'master' && user.condominio_id) {
                query = query.eq('condominio_id', user.condominio_id)
            }

            if (filter !== 'todos') {
                query = query.eq('status_auditoria', filter)
            }

            const { data, error } = await query.limit(50)
            if (error) throw error

            const queueItems = (data || []) as QueueItem[]
            if (initialItemId && !queueItems.some(item => item.id === initialItemId)) {
                const { data: selectedItem, error: selectedItemError } = await supabase
                    .from('comprovantes')
                    .select('*')
                    .eq('id', initialItemId)
                    .maybeSingle()

                if (selectedItemError) throw selectedItemError
                if (selectedItem && (user.role === 'master' || selectedItem.condominio_id === user.condominio_id)) {
                    queueItems.unshift(selectedItem as QueueItem)
                }
            }

            setItems(queueItems)
        } catch (err: any) {
            showToast(`Erro ao carregar fila: ${err.message}`, 'error')
        } finally {
            setLoading(false)
        }
    }, [user, filter])

    useEffect(() => {
        if (initialItemId) {
            setFilter('todos')
            setExpanded(initialItemId)
        }
    }, [initialItemId])

    useEffect(() => { load() }, [load])

    const takeAction = async (
        item: QueueItem,
        acao: 'aprovado' | 'rejeitado' | 'solicitado_esclarecimento'
    ) => {
        const motivo = motivos[item.id] || ''
        if (acao === 'aprovado' && !item.arquivo_url) {
            showToast('Não é possível aprovar sem visualizar o arquivo original.', 'error')
            return
        }
        if (acao === 'rejeitado' && !motivo.trim()) {
            showToast('Informe o motivo da rejeição antes de confirmar.', 'error')
            return
        }

        setActionLoading(item.id + acao)
        try {
            // 1. Registra audit trail
            const { error: logError } = await supabase.from('audit_acoes').insert({
                comprovante_id: item.id,
                condominio_id: item.condominio_id,
                usuario_id: user!.id,
                usuario_nome: user!.nome,
                acao,
                motivo: motivo || null,
                fraud_score_na_acao: item.fraud_score
            })
            if (logError) throw logError

            // 2. Atualiza status do comprovante
            const newStatus = acao === 'aprovado' ? 'auditado'
                : acao === 'rejeitado' ? 'rejeitado'
                : 'alerta' // solicitado_esclarecimento → volta para alerta aguardando

            const { error: updateError } = await supabase
                .from('comprovantes')
                .update({
                    status_auditoria: newStatus,
                    motivo_rejeicao: acao === 'rejeitado' ? motivo : null,
                    aprovado_por: acao === 'aprovado' ? user!.id : null,
                    aprovado_em: acao === 'aprovado' ? new Date().toISOString() : null
                })
                .eq('id', item.id)
            if (updateError) throw updateError

            const msgs: Record<string, string> = {
                aprovado: 'Comprovante aprovado e registrado no audit log.',
                rejeitado: 'Comprovante rejeitado com motivo registrado.',
                solicitado_esclarecimento: 'Esclarecimento solicitado ao síndico.'
            }
            showToast(msgs[acao], 'success')
            setExpanded(null)
            setPreviewItem(null)
            setPreviewUrl(null)
            setMotivos(prev => { const n = { ...prev }; delete n[item.id]; return n })
            await load()
        } catch (err: any) {
            showToast(`Erro: ${err.message}`, 'error')
        } finally {
            setActionLoading(null)
        }
    }

    const openDocumentPreview = async (item: QueueItem, event?: React.MouseEvent) => {
        event?.stopPropagation()
        setPreviewItem(item)
        setPreviewUrl(null)
        setPreviewLoading(true)

        if (!item.arquivo_url) {
            setPreviewLoading(false)
            return
        }

        try {
            if (item.arquivo_url.startsWith('http://') || item.arquivo_url.startsWith('https://')) {
                setPreviewUrl(item.arquivo_url)
            } else {
                const { data, error } = await supabase.storage
                    .from('comprovantes')
                    .createSignedUrl(item.arquivo_url, 300)
                if (error) throw error
                setPreviewUrl(data.signedUrl)
            }
        } catch (err: any) {
            showToast(`Não foi possível abrir o comprovante: ${err.message}`, 'error')
        } finally {
            setPreviewLoading(false)
        }
    }

    const previewKind = (item: QueueItem) => {
        const hint = `${item.tipo_arquivo || ''} ${item.arquivo_nome || ''} ${item.arquivo_url || ''}`.toLowerCase()
        if (hint.includes('pdf') || /\.pdf(?:$|[?#])/.test(hint)) return 'pdf'
        if (hint.includes('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)(?:$|[?#])/.test(hint)) return 'image'
        return 'other'
    }

    const fmt = (v: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    const scoreColor = (s: number | null) => {
        if (!s || s < 30) return 'text-emerald-600 bg-emerald-50'
        if (s < 60) return 'text-amber-600 bg-amber-50'
        return 'text-rose-600 bg-rose-50'
    }

    const statusIcon = (s: string) => {
        if (s === 'suspeito') return <ShieldAlert className="h-4 w-4 text-rose-500" />
        if (s === 'alerta') return <AlertTriangle className="h-4 w-4 text-amber-500" />
        if (s === 'auditado') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        if (s === 'rejeitado') return <XCircle className="h-4 w-4 text-rose-500" />
        return <Clock className="h-4 w-4 text-slate-400" />
    }

    const counts = {
        suspeito: items.filter(i => i.status_auditoria === 'suspeito').length,
        alerta: items.filter(i => i.status_auditoria === 'alerta').length,
        pendente: items.filter(i => i.status_auditoria === 'pendente').length,
    }

    return (
        <div className="space-y-6">
            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold text-white transition-all animate-in slide-in-from-top-2",
                    toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
                )}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Fila de Revisão Humana</h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Documentos com irregularidades detectadas pela IA aguardam sua decisão.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {onBackToHistory && (
                        <button
                            type="button"
                            onClick={onBackToHistory}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Voltar ao histórico</span>
                        </button>
                    )}
                    <button onClick={load} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        <RefreshCw className={cn("h-4 w-4 text-slate-400", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
                {([
                    { key: 'todos', label: 'Todos', icon: FileText, count: items.length },
                    { key: 'suspeito', label: 'Suspeitos', icon: ShieldAlert, count: counts.suspeito },
                    { key: 'alerta', label: 'Alertas', icon: AlertTriangle, count: counts.alerta },
                    { key: 'pendente', label: 'Pendentes', icon: Clock, count: counts.pendente },
                ] as const).map(tab => (
                    (() => {
                        const TabIcon = tab.icon
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setFilter(tab.key)}
                                className={cn(
                                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all",
                                    filter === tab.key
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                )}
                            >
                                <TabIcon className="h-4 w-4" />
                                <span>{tab.label}</span>
                                {tab.count > 0 && (
                                    <span className={cn(
                                        "px-1.5 py-0.5 rounded-full text-[10px] font-black",
                                        filter === tab.key ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-600"
                                    )}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        )
                    })()
                ))}
            </div>

            {/* List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                    <p className="text-slate-400 text-sm">Carregando fila...</p>
                </div>
            ) : items.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center">
                    <ShieldCheck className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-900">Fila limpa!</h3>
                    <p className="text-slate-400 mt-2 text-sm">Nenhum documento aguardando revisão no momento.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map(item => {
                        const isExpanded = expanded === item.id
                        const isActing = actionLoading?.startsWith(item.id)
                        const flags = Array.isArray(item.fraud_flags) ? item.fraud_flags : []
                        const isFinal = item.status_auditoria === 'auditado' || item.status_auditoria === 'rejeitado'

                        return (
                            <div key={item.id} className={cn(
                                "bg-white rounded-2xl border transition-all duration-200",
                                item.status_auditoria === 'suspeito'
                                    ? "border-rose-200 shadow-rose-50 shadow-md"
                                    : item.status_auditoria === 'alerta'
                                        ? "border-amber-200"
                                        : "border-slate-200"
                            )}>
                                {/* Row Header */}
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className="w-full p-5 flex items-center gap-4 text-left"
                                    onClick={() => setExpanded(isExpanded ? null : item.id)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault()
                                            setExpanded(isExpanded ? null : item.id)
                                        }
                                    }}
                                    aria-expanded={isExpanded}
                                >
                                    {/* Score badge */}
                                    <div className={cn(
                                        "w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 font-black",
                                        scoreColor(item.fraud_score)
                                    )}>
                                        <span className="text-lg leading-none">{item.fraud_score ?? '?'}</span>
                                        <span className="text-[9px] uppercase tracking-wider">score</span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {statusIcon(item.status_auditoria)}
                                            <span className="text-sm font-black text-slate-900 truncate">
                                                {item.ocr_razao_social || item.arquivo_nome}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                                            {item.valor && (
                                                <span className="flex items-center gap-1 text-indigo-600 font-bold">
                                                    <DollarSign className="h-3 w-3" />
                                                    {fmt(item.valor)}
                                                </span>
                                            )}
                                            {item.ocr_cnpj && (
                                                <span className="flex items-center gap-1 font-mono">
                                                    <Fingerprint className="h-3 w-3" />
                                                    {item.ocr_cnpj}
                                                </span>
                                            )}
                                            {item.data_emissao && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(item.data_emissao).toLocaleDateString('pt-BR')}
                                                </span>
                                            )}
                                        </div>
                                        {/* Flags */}
                                        {flags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {flags.map(f => {
                                                    const fl = FLAG_LABELS[f] || { label: f, color: 'bg-slate-100 text-slate-600' }
                                                    return (
                                                        <span key={f} className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", fl.color)}>
                                                            {fl.label}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {item.arquivo_url && (
                                        <button
                                            type="button"
                                            onClick={event => openDocumentPreview(item, event)}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 transition-colors hover:bg-indigo-100"
                                            title="Visualizar comprovante"
                                        >
                                            <Eye className="h-4 w-4" />
                                            <span className="hidden sm:inline">Ver comprovante</span>
                                        </button>
                                    )}
                                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                                </div>

                                {/* Expanded Panel */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 space-y-5 border-t border-slate-100 pt-4">
                                        {/* Details grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {[
                                                { icon: FileText, label: 'Arquivo', value: item.arquivo_nome },
                                                { icon: Building2, label: 'CNPJ Status', value: item.cnpj_status || 'Não verificado' },
                                                { icon: Clock, label: 'Natureza', value: item.natureza_servico || 'Não identificado' },
                                                { icon: Calendar, label: 'Upload em', value: new Date(item.created_at).toLocaleDateString('pt-BR') },
                                            ].map(d => (
                                                <div key={d.label} className="bg-slate-50 rounded-xl p-3">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{d.label}</p>
                                                    <p className="text-sm font-bold text-slate-900 truncate">{d.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3">
                                            {item.arquivo_url ? (
                                                <button
                                                    type="button"
                                                    onClick={event => openDocumentPreview(item, event)}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-indigo-700"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                    Visualizar comprovante
                                                </button>
                                            ) : (
                                                <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700">
                                                    Arquivo original indisponível. A aprovação fica bloqueada.
                                                </p>
                                            )}
                                        </div>

                                        {/* Description from OCR */}
                                        {item.descricao && (
                                            <div className="bg-slate-50 rounded-xl p-4">
                                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Descrição OCR</p>
                                                <p className="text-sm text-slate-700">{item.descricao}</p>
                                            </div>
                                        )}

                                        {/* Motivo input */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-2">
                                                Motivo / Observação <span className="text-rose-500">(obrigatório para rejeitar)</span>
                                            </label>
                                            <textarea
                                                rows={2}
                                                placeholder="Ex: CNPJ da empresa emissora está baixado desde 2023. Solicitei cópia física ao fornecedor."
                                                value={motivos[item.id] || ''}
                                                onChange={e => setMotivos(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none"
                                            />
                                        </div>

                                        {/* Action buttons */}
                                        {isFinal ? (
                                            <div className={cn(
                                                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold",
                                                item.status_auditoria === 'auditado'
                                                    ? "bg-emerald-50 text-emerald-700"
                                                    : "bg-rose-50 text-rose-700"
                                            )}>
                                                {item.status_auditoria === 'auditado'
                                                    ? <CheckCircle2 className="h-4 w-4" />
                                                    : <XCircle className="h-4 w-4" />}
                                                Este documento já foi {item.status_auditoria === 'auditado' ? 'aprovado' : 'rejeitado'}.
                                            </div>
                                        ) : (
                                        <div className="flex gap-3 flex-wrap">
                                            <button
                                                onClick={() => takeAction(item, 'aprovado')}
                                                disabled={!!isActing || !item.arquivo_url}
                                                title={!item.arquivo_url ? 'Visualize o arquivo original antes de aprovar' : 'Aprovar comprovante'}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                            >
                                                {actionLoading === item.id + 'aprovado'
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <CheckCircle2 className="h-4 w-4" />}
                                                Aprovar
                                            </button>
                                            <button
                                                onClick={() => takeAction(item, 'solicitado_esclarecimento')}
                                                disabled={!!isActing}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                            >
                                                {actionLoading === item.id + 'solicitado_esclarecimento'
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <MessageSquare className="h-4 w-4" />}
                                                Pedir Esclarecimento
                                            </button>
                                            <button
                                                onClick={() => takeAction(item, 'rejeitado')}
                                                disabled={!!isActing}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white text-sm font-bold rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors"
                                            >
                                                {actionLoading === item.id + 'rejeitado'
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <XCircle className="h-4 w-4" />}
                                                Rejeitar
                                            </button>
                                        </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {previewItem && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    role="presentation"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) {
                            setPreviewItem(null)
                            setPreviewUrl(null)
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="review-document-title"
                        className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="rounded-xl bg-indigo-50 p-2.5">
                                    <FileText className="h-5 w-5 text-indigo-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-black uppercase tracking-wide text-indigo-500">Revisão do documento original</p>
                                    <h3 id="review-document-title" className="mt-1 truncate text-lg font-black text-slate-900">{previewItem.arquivo_nome}</h3>
                                    <p className="mt-1 text-xs text-slate-500">Confira a evidência antes de aprovar, pedir esclarecimento ou rejeitar.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewItem(null)
                                    setPreviewUrl(null)
                                }}
                                aria-label="Fechar visualização"
                                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_330px]">
                            <div className="flex min-h-[420px] items-center justify-center bg-slate-100 p-4 sm:p-6">
                                {previewLoading ? (
                                    <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                                        Gerando visualização segura...
                                    </div>
                                ) : !previewUrl ? (
                                    <div className="max-w-sm text-center">
                                        <FileText className="mx-auto h-12 w-12 text-slate-300" />
                                        <p className="mt-3 font-bold text-slate-700">Arquivo original indisponível</p>
                                        <p className="mt-1 text-sm text-slate-500">Não é possível tomar uma decisão de aprovação sem a evidência.</p>
                                    </div>
                                ) : previewKind(previewItem) === 'pdf' ? (
                                    <iframe
                                        title={`Visualização de ${previewItem.arquivo_nome}`}
                                        src={previewUrl}
                                        className="h-[65vh] min-h-[420px] w-full rounded-2xl border border-slate-200 bg-white"
                                    />
                                ) : previewKind(previewItem) === 'image' ? (
                                    <img
                                        src={previewUrl}
                                        alt={`Visualização de ${previewItem.arquivo_nome}`}
                                        className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-sm"
                                    />
                                ) : (
                                    <div className="max-w-sm text-center">
                                        <FileText className="mx-auto h-12 w-12 text-slate-300" />
                                        <p className="mt-3 font-bold text-slate-700">Formato sem visualização embutida</p>
                                        <a
                                            href={previewUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700"
                                        >
                                            <Download className="h-4 w-4" />
                                            Abrir arquivo
                                        </a>
                                    </div>
                                )}
                            </div>

                            <aside className="space-y-4 border-t border-slate-100 bg-white p-5 lg:border-l lg:border-t-0">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Valor</p>
                                        <p className="mt-1 font-bold text-slate-900">{previewItem.valor ? fmt(previewItem.valor) : 'Não informado'}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Score</p>
                                        <p className="mt-1 font-bold text-slate-900">{previewItem.fraud_score ?? 'Não informado'}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">CNPJ</p>
                                        <p className="mt-1 break-all font-semibold text-slate-700">{previewItem.ocr_cnpj || 'Não verificado'}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Status</p>
                                        <p className="mt-1 font-semibold text-slate-700">{previewItem.cnpj_status || 'Não verificado'}</p>
                                    </div>
                                </div>

                                {previewItem.descricao && (
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Descrição OCR</p>
                                        <p className="mt-1 text-sm text-slate-700">{previewItem.descricao}</p>
                                    </div>
                                )}

                                <div>
                                    <label className="mb-2 block text-xs font-bold text-slate-600">
                                        Motivo / Observação <span className="text-rose-500">(obrigatório para rejeitar)</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Registre a justificativa da decisão..."
                                        value={motivos[previewItem.id] || ''}
                                        onChange={event => setMotivos(prev => ({ ...prev, [previewItem.id]: event.target.value }))}
                                        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                </div>

                                <div className="space-y-2 border-t border-slate-100 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => takeAction(previewItem, 'aprovado')}
                                        disabled={!!actionLoading || !previewItem.arquivo_url}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {actionLoading === previewItem.id + 'aprovado' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        Aprovar comprovante
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => takeAction(previewItem, 'solicitado_esclarecimento')}
                                        disabled={!!actionLoading}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-50"
                                    >
                                        {actionLoading === previewItem.id + 'solicitado_esclarecimento' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                                        Pedir esclarecimento
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => takeAction(previewItem, 'rejeitado')}
                                        disabled={!!actionLoading}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50"
                                    >
                                        {actionLoading === previewItem.id + 'rejeitado' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                        Rejeitar
                                    </button>
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
