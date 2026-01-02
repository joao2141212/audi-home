import { useState, useEffect } from 'react'
import { FileText, RefreshCw, ArrowUpRight, ArrowDownLeft, Search } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Transaction {
    id: string
    description: string
    amount: number
    date: string
    type: 'CREDIT' | 'DEBIT'
    category?: string
}

export function TransactionHistory() {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const condominioId = '00000000-0000-0000-0000-000000000001'

    const fetchTransactions = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`http://localhost:8000/api/v1/pluggy/sync-transactions/${condominioId}`)
            if (!response.ok) throw new Error('Falha ao carregar extrato')
            const data = await response.json()

            // Mapear para o formato do componente
            const mapped: Transaction[] = (data.transactions || []).map((tx: any) => ({
                id: tx.id,
                description: tx.description,
                amount: tx.amount,
                date: tx.date.split('T')[0],
                type: tx.amount > 0 ? 'CREDIT' : 'DEBIT',
                category: tx.category
            }))

            setTransactions(mapped)
        } catch (err) {
            console.error(err)
            // FALLBACK DEMO PARA NETLIFY
            const mockTransactions: Transaction[] = [
                { id: 'tx_001', description: 'CONDOMINIO EDIFICIO SOLAR - UNID 101', amount: 850.00, date: '2025-12-30', type: 'CREDIT', category: 'Receita' },
                { id: 'tx_002', description: 'MANUTENCAO ELEVADOR ATLAS SCHINDLER', amount: -1200.00, date: '2025-12-28', type: 'DEBIT', category: 'Manutenção' },
                { id: 'tx_003', description: 'ENEL DISTRIBUICAO - CONTA LUZ', amount: -3450.20, date: '2025-12-25', type: 'DEBIT', category: 'Contas Fixas' },
                { id: 'tx_004', description: 'CONDOMINIO EDIFICIO SOLAR - UNID 202', amount: 850.00, date: '2025-12-22', type: 'CREDIT', category: 'Receita' },
                { id: 'tx_005', description: 'LIMPEZA E CONSERVACAO LTDA', amount: -2800.00, date: '2025-12-20', type: 'DEBIT', category: 'Serviços' },
            ]
            setTransactions(mockTransactions)
            setError('Modo Visualização (API Offline)')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTransactions()
    }, [])

    if (loading && transactions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-4" />
                <p className="text-gray-500">Buscando extrato em tempo real...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    Extrato Consolidado (Bancos Conectados)
                </h3>
                <button
                    onClick={fetchTransactions}
                    className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700 underline underline-offset-4"
                >
                    <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                    Atualizar Agora
                </button>
            </div>

            {transactions.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-500">Nenhuma transação encontrada para este período.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {transactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {tx.date}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {tx.description}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className="px-2 py-1 bg-gray-100 rounded-md text-[10px] font-bold uppercase tracking-tight">
                                                {tx.category || 'Outros'}
                                            </span>
                                        </td>
                                        <td className={cn(
                                            "px-6 py-4 whitespace-nowrap text-sm text-right font-bold flex items-center justify-end gap-1",
                                            tx.type === 'CREDIT' ? "text-green-600" : "text-red-600"
                                        )}>
                                            {tx.type === 'CREDIT' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                                            R$ {Math.abs(tx.amount).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
