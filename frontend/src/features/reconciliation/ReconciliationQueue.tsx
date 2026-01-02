import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { FraudAlertBadge, FraudScoreBadge } from '../../components/ui/FraudAlert'
import type { ReconciliationQueueItem, TransactionMatch, Receipt } from '../../types'

export function ReconciliationQueue() {
    const [queue, setQueue] = useState<ReconciliationQueueItem[]>([])
    const [selectedItem, setSelectedItem] = useState<ReconciliationQueueItem | null>(null)
    const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null)
    const [matches, setMatches] = useState<TransactionMatch[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchQueue()
    }, [])

    const fetchQueue = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/v1/reconciliation/queue')
            const data = await response.json()
            setQueue(data)
        } catch (error) {
            console.error('Failed to fetch queue:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchMatches = async (receiptId: string) => {
        try {
            const response = await fetch(`http://localhost:8000/api/v1/reconciliation/matches/${receiptId}`)
            const data = await response.json()
            setMatches(data)
        } catch (error) {
            console.error('Failed to fetch matches:', error)
        }
    }

    const handleSelectItem = (item: ReconciliationQueueItem) => {
        setSelectedItem(item)
        fetchMatches(item.comprovante_id)
    }

    const handleApprove = async (transactionId: string) => {
        if (!selectedItem) return

        try {
            await fetch('http://localhost:8000/api/v1/reconciliation/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comprovante_id: selectedItem.comprovante_id,
                    transacao_id: transactionId,
                }),
            })

            // Refresh queue
            fetchQueue()
            setSelectedItem(null)
            setSelectedReceipt(null)
            setMatches([])
        } catch (error) {
            console.error('Failed to approve:', error)
        }
    }

    const handleReject = async (reason: string) => {
        if (!selectedItem) return

        try {
            await fetch('http://localhost:8000/api/v1/reconciliation/reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comprovante_id: selectedItem.comprovante_id,
                    motivo_decisao: reason,
                }),
            })

            // Refresh queue
            fetchQueue()
            setSelectedItem(null)
            setSelectedReceipt(null)
            setMatches([])
        } catch (error) {
            console.error('Failed to reject:', error)
        }
    }

    if (loading) {
        return <div className="text-center py-8">Carregando...</div>
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
            {/* Queue List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-y-auto">
                <h2 className="text-xl font-semibold mb-4">Fila de Reconciliação</h2>

                {queue.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Nenhum item pendente</p>
                ) : (
                    <div className="space-y-3">
                        {queue.map((item) => {
                            const receipt = (item as any).comprovantes
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => handleSelectItem(item)}
                                    className={cn(
                                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                                        selectedItem?.id === item.id
                                            ? "border-blue-500 bg-blue-50"
                                            : "border-gray-200 hover:border-blue-300"
                                    )}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <p className="font-medium">Comprovante #{item.comprovante_id.slice(0, 8)}</p>
                                            <p className="text-sm text-gray-600 mt-1">
                                                Tipo: <span className="font-medium">{item.tipo}</span>
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Matches: <span className="font-medium">{item.matches_sugeridos.length}</span>
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span className={cn(
                                                "px-2 py-1 text-xs font-medium rounded",
                                                item.prioridade > 5 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                                            )}>
                                                Prioridade: {item.prioridade}
                                            </span>
                                            {receipt && <FraudScoreBadge score={receipt.fraud_score || 0} />}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Match Details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-y-auto">
                {selectedItem && selectedReceipt ? (
                    <>
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold">Comprovante</h2>
                                <FraudScoreBadge score={selectedReceipt.fraud_score} />
                            </div>

                            {/* Fraud Alert */}
                            {selectedReceipt.fraud_score > 0 && (
                                <div className="mb-4">
                                    <FraudAlertBadge receipt={selectedReceipt} />
                                </div>
                            )}

                            {/* OCR Info */}
                            {selectedReceipt.ocr_processado && (
                                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                                    <h3 className="font-medium mb-2">Dados Extraídos (OCR)</h3>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <span className="text-gray-600">Valor:</span>
                                            <span className="ml-2 font-medium">
                                                {selectedReceipt.ocr_valor ? `R$ ${selectedReceipt.ocr_valor.toFixed(2)}` : 'N/A'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-600">Data:</span>
                                            <span className="ml-2 font-medium">
                                                {selectedReceipt.ocr_data || 'N/A'}
                                            </span>
                                        </div>
                                        {selectedReceipt.ocr_nsu && (
                                            <div className="col-span-2">
                                                <span className="text-gray-600">NSU:</span>
                                                <span className="ml-2 font-medium">{selectedReceipt.ocr_nsu}</span>
                                            </div>
                                        )}
                                        <div className="col-span-2">
                                            <span className="text-gray-600">Confiança:</span>
                                            <span className="ml-2 font-medium">
                                                {selectedReceipt.ocr_confianca ? `${selectedReceipt.ocr_confianca.toFixed(0)}%` : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <h2 className="text-xl font-semibold mb-4">Transações Sugeridas</h2>

                        {matches.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">Nenhuma transação compatível encontrada</p>
                        ) : (
                            <div className="space-y-3">
                                {matches.map((match) => (
                                    <div
                                        key={match.transacao_id}
                                        className="p-4 rounded-lg border border-gray-200 hover:border-green-400 transition-all"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <p className="font-medium text-lg">R$ {match.valor.toFixed(2)}</p>
                                                <p className="text-sm text-gray-600">{match.data_transacao}</p>
                                                {match.descricao && (
                                                    <p className="text-sm text-gray-500 mt-1">{match.descricao}</p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-green-600">{match.match_score.toFixed(0)}%</p>
                                                <p className="text-xs text-gray-500">confiança</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {match.match_reasons.map((reason) => (
                                                <span
                                                    key={reason}
                                                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded"
                                                >
                                                    {reason}
                                                </span>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => handleApprove(match.transacao_id)}
                                            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle className="h-4 w-4" />
                                            Aprovar Match
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <button
                                onClick={() => handleReject('Comprovante inválido')}
                                className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition flex items-center justify-center gap-2"
                            >
                                <XCircle className="h-4 w-4" />
                                Rejeitar Comprovante
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                            <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
                            <p>Selecione um item da fila para ver os matches</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
