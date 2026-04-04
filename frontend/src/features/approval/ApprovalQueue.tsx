import { useState, useEffect, useCallback } from 'react'
import {
    ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
    MessageSquare, ChevronDown, ChevronUp, Clock, Loader2, RefreshCw,
    FileText, Building2, Calendar, DollarSign, Fingerprint
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

interface QueueItem {
    id: string
    condominio_id: string
    arquivo_nome: string
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

export function ApprovalQueue() {
    const { user } = useAuth()
    const [items, setItems] = useState<QueueItem[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [motivos, setMotivos] = useState<Record<string, string>>({})
    const [filter, setFilter] = useState<'todos' | 'suspeito' | 'alerta' | 'pendente'>('todos')
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

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
            setItems((data || []) as QueueItem[])
        } catch (err: any) {
            showToast(`Erro ao carregar fila: ${err.message}`, 'error')
        } finally {
            setLoading(false)
        }
    }, [user, filter])

    useEffect(() => { load() }, [load])

    const takeAction = async (
        item: QueueItem,
        acao: 'aprovado' | 'rejeitado' | 'solicitado_esclarecimento'
    ) => {
        const motivo = motivos[item.id] || ''
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
                aprovado: '✅ Comprovante aprovado e registrado no audit log.',
                rejeitado: '❌ Comprovante rejeitado com motivo registrado.',
                solicitado_esclarecimento: '📨 Esclarecimento solicitado ao síndico.'
            }
            showToast(msgs[acao], 'success')
            setExpanded(null)
            setMotivos(prev => { const n = { ...prev }; delete n[item.id]; return n })
            await load()
        } catch (err: any) {
            showToast(`Erro: ${err.message}`, 'error')
        } finally {
            setActionLoading(null)
        }
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
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Fila de Revisão Humana</h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Documentos com irregularidades detectadas pela IA aguardam sua decisão.
                    </p>
                </div>
                <button onClick={load} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <RefreshCw className={cn("h-4 w-4 text-slate-400", loading && "animate-spin")} />
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
                {([
                    { key: 'todos', label: 'Todos', count: items.length },
                    { key: 'suspeito', label: '🚨 Suspeitos', count: counts.suspeito },
                    { key: 'alerta', label: '⚠️ Alertas', count: counts.alerta },
                    { key: 'pendente', label: '🕐 Pendentes', count: counts.pendente },
                ] as const).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key)}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold border transition-all",
                            filter === tab.key
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        )}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={cn(
                                "ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-black",
                                filter === tab.key ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-600"
                            )}>
                                {tab.count}
                            </span>
                        )}
                    </button>
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
                                <button
                                    className="w-full p-5 flex items-center gap-4 text-left"
                                    onClick={() => setExpanded(isExpanded ? null : item.id)}
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

                                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                                </button>

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
                                        <div className="flex gap-3 flex-wrap">
                                            <button
                                                onClick={() => takeAction(item, 'aprovado')}
                                                disabled={!!isActing}
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
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
