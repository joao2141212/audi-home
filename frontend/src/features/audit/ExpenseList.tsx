import { useState, useEffect } from 'react'
import { TrendingDown, AlertCircle, Search } from 'lucide-react'

interface Transaction {
    id: string
    amount: number
    date: string
    description: string
}

interface ExpenseListProps {
    condominioId: string
    onAuditClick: (transaction: Transaction) => void
}

export function ExpenseList({ condominioId, onAuditClick }: ExpenseListProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isDemo, setIsDemo] = useState(false)

    // Dados de demonstração para testes
    const demoExpenses: Transaction[] = [
        { id: 'demo_001', amount: 5000.00, date: '2025-12-01', description: 'MANUTENCAO ELEVADOR ATLAS - NF 12345' },
        { id: 'demo_002', amount: 3500.00, date: '2025-11-28', description: 'LIMPEZA PREDIAL LIMPMAX LTDA' },
        { id: 'demo_003', amount: 1200.00, date: '2025-11-25', description: 'PORTARIA - SEGURANCA 24H' },
        { id: 'demo_004', amount: 850.00, date: '2025-11-20', description: 'ENERGIA ELETRICA - ENEL' },
        { id: 'demo_005', amount: 2100.00, date: '2025-11-15', description: 'ADMINISTRACAO - HABITCOND' },
    ]

    const fetchExpenses = async () => {
        setLoading(true)
        setError(null)
        setIsDemo(false)

        try {
            // Buscar transações de débito (saídas) da API real
            const response = await fetch(
                `http://localhost:8000/api/v1/pluggy/sync-transactions/${condominioId}`
            )

            if (!response.ok) {
                throw new Error('Falha ao buscar despesas')
            }

            const data = await response.json()

            // Processar transações da API
            // Filtrar apenas débitos (valores negativos)
            const expenses: Transaction[] = (data.transactions || [])
                .filter((tx: any) => tx.amount < 0)
                .map((tx: any) => ({
                    id: tx.id,
                    amount: Math.abs(tx.amount), // Converter para positivo para display
                    date: tx.date,
                    description: tx.description
                }))

            setTransactions(expenses)
        } catch (err) {
            // Em caso de erro, mostrar dados de demonstração
            console.error('Erro ao buscar despesas, mostrando dados demo:', err)
            setTransactions(demoExpenses)
            setIsDemo(true)
            setError('API não disponível - usando dados de demonstração')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchExpenses()
    }, [condominioId])

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <TrendingDown className="h-6 w-6 text-red-600" />
                    <h3 className="text-lg font-semibold">Despesas (Saídas)</h3>
                </div>
                <button
                    onClick={fetchExpenses}
                    disabled={loading}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Carregando...' : 'Atualizar'}
                </button>
            </div>

            {isDemo && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <span className="text-yellow-900">
                        <span className="font-semibold">Modo Demo:</span> Exibindo dados de exemplo. Conecte uma conta real no Open Finance para ver despesas reais.
                    </span>
                </div>
            )}

            {error && !isDemo && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="text-red-900">{error}</span>
                </div>
            )}

            {loading ? (
                <div className="text-center py-8 text-gray-500">
                    Carregando despesas...
                </div>
            ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    Nenhuma despesa encontrada
                </div>
            ) : (
                <div className="space-y-3">
                    {transactions.map((tx) => (
                        <div
                            key={tx.id}
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                        >
                            <div className="flex-1">
                                <p className="font-medium text-gray-900">{tx.description}</p>
                                <p className="text-sm text-gray-500">{tx.date}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-lg font-bold text-red-600">
                                    - R$ {tx.amount.toFixed(2)}
                                </span>
                                <button
                                    onClick={() => onAuditClick(tx)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                                >
                                    <Search className="h-4 w-4" />
                                    Auditar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
