import { useState, useEffect } from 'react'
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    ArrowRightLeft,
    DollarSign,
    Building2,
    RefreshCw,
    Filter
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from '../../components/ui/Skeleton'
import { supabase } from '../../lib/supabase'

interface ReconciliationItem {
    id: string
    comprovante_id: string
    transacao_id: string
    status: string
    tipo: string
    confianca: number
    valor_transacao: number
    valor_comprovante: number
    data_criacao: string
    metadata?: {
        valor_diff?: number
        data_diff_days?: number
        cnpj_match?: boolean
    }
}


export function ReconciliationQueueRefactored() {
    const [items, setItems] = useState<ReconciliationItem[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>('all')

    const CONDOMINIO_ID = 'demo_condo_1'

    const fetchQueue = async () => {
        setLoading(true)
        try {
            console.log("Calling reconciliation Edge Function")
            const { data, error } = await supabase.functions.invoke(
                `reconciliation?condominio_id=${CONDOMINIO_ID}`,
                { method: 'GET' }
            )

            if (error) throw error

            // Adaptar o formato do Deno para o que o componente espera
            // O componente espera ReconciliationItem[], mas o Deno retorna Match[]
            // Por enquanto vamos simular os campos extras que o UI precisa baseado no que o Deno tem
            const mappedItems = (data.sugestoes || []).map((s: any) => ({
                id: `${s.transacao_id}_${s.comprovante_id}`,
                comprovante_id: s.comprovante_id,
                transacao_id: s.transacao_id,
                status: 'sugerido',
                tipo: 'DEBIT',
                confianca: s.score / 100, // Converte score 0-100 para 0-1
                valor_transacao: 0, // Precisamos buscar no banco ou melhorar a Edge
                valor_comprovante: 0,
                data_criacao: new Date().toISOString(),
                metadata: {
                    cnpj_match: s.motivos?.includes('cnpj_match'),
                }
            }))

            setItems(mappedItems)
        } catch (error) {
            console.error('Erro ao buscar fila de reconciliação:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchQueue()
    }, [filter])

    const handleApprove = async (item: ReconciliationItem) => {
        try {
            const { error } = await supabase.functions.invoke('reconciliation', {
                body: {
                    transacao_id: item.transacao_id,
                    comprovante_id: item.comprovante_id,
                    acao: 'aprovar'
                }
            })

            if (error) throw error

            setItems(prev => prev.map(i =>
                i.id === item.id
                    ? { ...i, status: 'concluido' }
                    : i
            ))
        } catch (error) {
            console.error('Erro ao aprovar:', error)
        }
    }

    const handleReject = async (item: ReconciliationItem) => {
        try {
            const { error } = await supabase.functions.invoke('reconciliation', {
                body: {
                    transacao_id: item.transacao_id,
                    comprovante_id: item.comprovante_id,
                    acao: 'rejeitar',
                    motivo: 'Rejeitado pelo usuário'
                }
            })

            if (error) throw error

            setItems(prev => prev.filter(i => i.id !== item.id))
        } catch (error) {
            console.error('Erro ao rejeitar:', error)
        }
    }

    const getConfidenceBadge = (confidence: number) => {
        const percent = Math.round(confidence * 100)

        if (percent >= 90) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full"></span>
                    {percent}% - Alta
                </span>
            )
        } else if (percent >= 70) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    <span className="h-1.5 w-1.5 bg-amber-500 rounded-full"></span>
                    {percent}% - Média
                </span>
            )
        } else {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-medium">
                    <span className="h-1.5 w-1.5 bg-rose-500 rounded-full"></span>
                    {percent}% - Baixa
                </span>
            )
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('pt-BR')
        } catch {
            return dateStr
        }
    }

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <div className="skeleton h-8 w-48 rounded" />
                    <div className="skeleton h-10 w-28 rounded-lg" />
                </div>
                <SkeletonTable rows={3} />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900">Fila de Reconciliação</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Aprove ou rejeite sugestões automáticas de matching
                    </p>
                </div>
                <button onClick={fetchQueue} className="btn btn-secondary">
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <div className="flex gap-2">
                    {[
                        { value: 'all', label: 'Todos' },
                        { value: 'sugerido', label: 'Pendentes' },
                        { value: 'auto_conciliado', label: 'Auto-aprovados' },
                        { value: 'conciliado', label: 'Concluídos' }
                    ].map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
                                filter === f.value
                                    ? "bg-gray-900 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <span className="ml-auto text-sm text-gray-500">
                    {items.length} item(ns)
                </span>
            </div>

            {/* Items */}
            {items.length === 0 ? (
                <div className="card p-12 text-center">
                    <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                        <AlertTriangle className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Nenhum item na fila
                    </h3>
                    <p className="text-sm text-gray-500">
                        Faça upload de comprovantes e adicione transações para ver sugestões aqui
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {items.map((item) => (
                        <div key={item.id} className="card p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">
                                            Match Sugerido
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {formatDate(item.data_criacao)}
                                        </p>
                                    </div>
                                </div>

                                {getConfidenceBadge(item.confianca)}
                            </div>

                            {/* Match Details */}
                            <div className="grid grid-cols-2 gap-6 mb-4">
                                {/* Comprovante (Left) */}
                                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Building2 className="h-4 w-4 text-emerald-600" />
                                        <span className="text-sm font-medium text-emerald-900">
                                            Comprovante
                                        </span>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                        <div>
                                            <span className="text-gray-600">ID:</span>
                                            <p className="font-mono text-xs text-gray-700 truncate">
                                                {item.comprovante_id}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600">Valor:</span>
                                            <p className="font-semibold text-emerald-700">
                                                {formatCurrency(item.valor_comprovante || 0)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Transação (Right) */}
                                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 mb-3">
                                        <DollarSign className="h-4 w-4 text-blue-600" />
                                        <span className="text-sm font-medium text-blue-900">
                                            Transação Bancária
                                        </span>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                        <div>
                                            <span className="text-gray-600">ID:</span>
                                            <p className="font-mono text-xs text-gray-700 truncate">
                                                {item.transacao_id}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600">Valor:</span>
                                            <p className="font-semibold text-blue-700">
                                                {formatCurrency(item.valor_transacao || 0)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Metadata */}
                            {item.metadata && (
                                <div className="flex gap-4 text-xs text-gray-500 mb-4">
                                    {item.metadata.valor_diff !== undefined && (
                                        <span>
                                            Diferença de valor: {formatCurrency(item.metadata.valor_diff)}
                                        </span>
                                    )}
                                    {item.metadata.data_diff_days !== undefined && (
                                        <span>
                                            Diferença de data: {item.metadata.data_diff_days} dia(s)
                                        </span>
                                    )}
                                    {item.metadata.cnpj_match && (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                            <CheckCircle className="h-4 w-4" aria-hidden="true" />
                                            CNPJ corresponde
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            {item.status !== 'concluido' && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleApprove(item)}
                                        className="btn btn-primary flex-1"
                                    >
                                        <CheckCircle className="h-4 w-4" />
                                        Aprovar Match
                                    </button>

                                    <button
                                        onClick={() => handleReject(item)}
                                        className="btn btn-danger flex-1"
                                    >
                                        <XCircle className="h-4 w-4" />
                                        Rejeitar
                                    </button>
                                </div>
                            )}

                            {item.status === 'concluido' && (
                                <div className="p-3 bg-gray-100 rounded-lg text-center">
                                    <span className="inline-flex items-center gap-1 text-sm text-gray-600 font-medium">
                                        <CheckCircle className="h-4 w-4" aria-hidden="true" />
                                        Reconciliação concluída
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
