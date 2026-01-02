import { useState, useEffect } from 'react'
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    FileText,
    GitMerge,
    ArrowRight,
    Clock,
    BadgePercent,
    User,
    Calendar,
    Banknote,
    RefreshCw,
    Zap
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from '../../components/ui/Skeleton'

interface QueueItem {
    id: string
    receiptId: string
    unidade: string
    valor: number
    data: string
    status: 'pendente' | 'processando'
    matchCount: number
    prioridade: number
    ocrConfianca: number
}

interface TransactionMatch {
    id: string
    valor: number
    data: string
    descricao: string
    matchScore: number
    matchReasons: string[]
}

// Mock data para demo
const mockQueue: QueueItem[] = [
    {
        id: '1',
        receiptId: 'REC-001',
        unidade: 'Apto 101',
        valor: 850.00,
        data: '2025-12-28',
        status: 'pendente',
        matchCount: 2,
        prioridade: 8,
        ocrConfianca: 96
    },
    {
        id: '2',
        receiptId: 'REC-002',
        unidade: 'Apto 202',
        valor: 850.00,
        data: '2025-12-27',
        status: 'pendente',
        matchCount: 1,
        prioridade: 5,
        ocrConfianca: 88
    },
    {
        id: '3',
        receiptId: 'REC-003',
        unidade: 'Apto 303',
        valor: 1700.00,
        data: '2025-12-25',
        status: 'pendente',
        matchCount: 0,
        prioridade: 3,
        ocrConfianca: 72
    },
]

const mockMatches: TransactionMatch[] = [
    {
        id: 'tx_101',
        valor: 850.00,
        data: '2025-12-28',
        descricao: 'PIX RECEBIDO - JOAO SILVA',
        matchScore: 98,
        matchReasons: ['Valor exato', 'Data coincidente', 'Unidade identificada']
    },
    {
        id: 'tx_102',
        valor: 850.00,
        data: '2025-12-27',
        descricao: 'TED RECEBIDA - MARIA SANTOS',
        matchScore: 75,
        matchReasons: ['Valor exato', 'Data próxima']
    },
]

export function ReconciliationQueue() {
    const [queue, setQueue] = useState<QueueItem[]>([])
    const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null)
    const [matches, setMatches] = useState<TransactionMatch[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Simulate loading
        setTimeout(() => {
            setQueue(mockQueue)
            setLoading(false)
        }, 800)
    }, [])

    const handleSelectItem = (item: QueueItem) => {
        setSelectedItem(item)
        // Simulate fetching matches
        if (item.matchCount > 0) {
            setMatches(mockMatches.slice(0, item.matchCount))
        } else {
            setMatches([])
        }
    }

    const handleApprove = (matchId: string) => {
        // Simulate approval
        setQueue(prev => prev.filter(q => q.id !== selectedItem?.id))
        setSelectedItem(null)
        setMatches([])
    }

    const handleReject = () => {
        // Simulate rejection
        setQueue(prev => prev.filter(q => q.id !== selectedItem?.id))
        setSelectedItem(null)
        setMatches([])
    }

    if (loading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-fade-in">
                <div className="lg:col-span-2">
                    <div className="skeleton h-10 w-48 rounded mb-4" />
                    <SkeletonTable rows={4} />
                </div>
                <div className="lg:col-span-3">
                    <div className="skeleton h-96 rounded-xl" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-100 rounded-lg">
                        <GitMerge className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Reconciliação de Pagamentos</h3>
                        <p className="text-sm text-gray-500">Cruze comprovantes com transações bancárias</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                        {queue.length} itens pendentes
                    </span>
                    <button className="btn btn-secondary">
                        <RefreshCw className="h-4 w-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Queue List - 2 cols */}
                <div className="lg:col-span-2 card">
                    <div className="card-header">
                        <h4 className="text-sm font-semibold text-gray-900">Fila de Comprovantes</h4>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {queue.length === 0 ? (
                            <div className="p-8 text-center">
                                <CheckCircle className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
                                <p className="text-gray-500 font-medium">Tudo reconciliado!</p>
                                <p className="text-sm text-gray-400 mt-1">Não há itens pendentes</p>
                            </div>
                        ) : (
                            queue.map((item, index) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelectItem(item)}
                                    className={cn(
                                        "w-full p-4 text-left transition-all animate-fade-in",
                                        selectedItem?.id === item.id
                                            ? "bg-violet-50"
                                            : "hover:bg-gray-50"
                                    )}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                selectedItem?.id === item.id ? "bg-violet-100" : "bg-gray-100"
                                            )}>
                                                <FileText className={cn(
                                                    "h-4 w-4",
                                                    selectedItem?.id === item.id ? "text-violet-600" : "text-gray-500"
                                                )} />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{item.unidade}</p>
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    {new Date(item.data).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-gray-900">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1 justify-end">
                                                {item.matchCount > 0 ? (
                                                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                        {item.matchCount} match{item.matchCount > 1 ? 'es' : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                                        Sem match
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* OCR Confidence Bar */}
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="text-gray-500">OCR Confiança</span>
                                            <span className={cn(
                                                "font-medium",
                                                item.ocrConfianca >= 90 ? "text-emerald-600" :
                                                    item.ocrConfianca >= 70 ? "text-amber-600" : "text-rose-600"
                                            )}>
                                                {item.ocrConfianca}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all",
                                                    item.ocrConfianca >= 90 ? "bg-emerald-500" :
                                                        item.ocrConfianca >= 70 ? "bg-amber-500" : "bg-rose-500"
                                                )}
                                                style={{ width: `${item.ocrConfianca}%` }}
                                            />
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Match Details - 3 cols */}
                <div className="lg:col-span-3 card">
                    {selectedItem ? (
                        <div className="h-full flex flex-col">
                            {/* Selected Receipt Header */}
                            <div className="card-header border-b border-gray-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-base font-semibold text-gray-900">
                                            Comprovante {selectedItem.unidade}
                                        </h4>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedItem.valor)} • {new Date(selectedItem.data).toLocaleDateString('pt-BR')}
                                        </p>
                                    </div>
                                    <span className={cn(
                                        "px-3 py-1 rounded-full text-xs font-medium",
                                        selectedItem.prioridade >= 7 ? "bg-rose-100 text-rose-700" :
                                            selectedItem.prioridade >= 4 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"
                                    )}>
                                        Prioridade {selectedItem.prioridade}
                                    </span>
                                </div>
                            </div>

                            {/* Matches */}
                            <div className="card-body flex-1 overflow-y-auto">
                                <div className="flex items-center gap-2 mb-4">
                                    <Zap className="h-4 w-4 text-violet-600" />
                                    <h5 className="text-sm font-semibold text-gray-900">Transações Compatíveis</h5>
                                </div>

                                {matches.length === 0 ? (
                                    <div className="text-center py-8">
                                        <AlertTriangle className="h-10 w-10 text-amber-300 mx-auto mb-3" />
                                        <p className="font-medium text-gray-700">Nenhuma transação compatível</p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Verifique o extrato ou rejeite este comprovante
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {matches.map((match) => (
                                            <div
                                                key={match.id}
                                                className="p-5 rounded-xl border-2 border-gray-200 hover:border-emerald-400 transition-all"
                                            >
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-start gap-3">
                                                        <div className="p-2 bg-blue-100 rounded-lg">
                                                            <Banknote className="h-5 w-5 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-900">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(match.valor)}
                                                            </p>
                                                            <p className="text-sm text-gray-600 mt-0.5">{match.descricao}</p>
                                                            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                                                                <Calendar className="h-3 w-3" />
                                                                {new Date(match.data).toLocaleDateString('pt-BR')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className={cn(
                                                            "text-2xl font-bold",
                                                            match.matchScore >= 90 ? "text-emerald-600" :
                                                                match.matchScore >= 70 ? "text-amber-600" : "text-gray-600"
                                                        )}>
                                                            {match.matchScore}%
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Match</p>
                                                    </div>
                                                </div>

                                                {/* Match Reasons */}
                                                <div className="flex flex-wrap gap-2 mb-4">
                                                    {match.matchReasons.map((reason) => (
                                                        <span
                                                            key={reason}
                                                            className="px-2 py-1 text-xs bg-violet-50 text-violet-700 rounded-full font-medium"
                                                        >
                                                            {reason}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Approve Button */}
                                                <button
                                                    onClick={() => handleApprove(match.id)}
                                                    className="w-full btn btn-success"
                                                >
                                                    <CheckCircle className="h-4 w-4" />
                                                    Aprovar Match
                                                    <ArrowRight className="h-4 w-4 ml-auto" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Reject Button */}
                            <div className="p-4 border-t border-gray-100">
                                <button
                                    onClick={handleReject}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 font-medium transition-colors"
                                >
                                    <XCircle className="h-4 w-4" />
                                    Rejeitar Comprovante
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center p-8">
                            <div className="text-center max-w-xs">
                                <div className="p-4 bg-gray-100 rounded-full w-fit mx-auto mb-4">
                                    <GitMerge className="h-8 w-8 text-gray-400" />
                                </div>
                                <h4 className="font-semibold text-gray-700 mb-2">Selecione um comprovante</h4>
                                <p className="text-sm text-gray-500">
                                    Clique em um item da fila para visualizar as transações compatíveis e fazer a reconciliação.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-4 p-4 bg-violet-50 border border-violet-200 rounded-xl">
                <GitMerge className="h-5 w-5 text-violet-600 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-violet-900">Como funciona a Reconciliação</p>
                    <p className="text-sm text-violet-700 mt-1">
                        O sistema analisa os comprovantes enviados pelos moradores e busca transações correspondentes no extrato bancário.
                        Você revisa os matches sugeridos e aprova ou rejeita manualmente para garantir a precisão.
                    </p>
                </div>
            </div>
        </div>
    )
}
