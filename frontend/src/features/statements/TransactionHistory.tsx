import { useState, useEffect } from 'react'
import { FileText, RefreshCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from '../../components/ui/Skeleton'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'

interface Transaction {
    id: string
    description: string
    amount: number
    date: string
    type: 'CREDIT' | 'DEBIT'
    category?: string
}

export function TransactionHistory() {
    const { user } = useAuth()
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)

    const fetchTransactions = async () => {
        if (!user?.condominio_id) {
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            const data = await api.getTransactions(user.condominio_id)
            const mapped: Transaction[] = (data || []).map((tx: any) => ({
                id: tx.id.toString(),
                description: tx.descricao,
                amount: tx.valor,
                date: tx.data_transacao,
                type: tx.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
                category: tx.category || 'Geral'
            }))
            setTransactions(mapped)
        } catch (err) {
            console.error('Erro ao buscar transações:', err)
            // Empty state on error, no mocks effectively
            setTransactions([])
        } finally {
            setTimeout(() => setLoading(false), 600)
        }
    }

    useEffect(() => {
        fetchTransactions()
    }, [])

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <div className="space-y-2">
                        <div className="skeleton h-6 w-64 rounded" />
                        <div className="skeleton h-4 w-40 rounded" />
                    </div>
                </div>
                <SkeletonTable rows={6} />
            </div>
        )
    }

    // Calculate totals
    const totalCredits = transactions.filter(t => t.type === 'CREDIT').reduce((sum, t) => sum + t.amount, 0)
    const totalDebits = transactions.filter(t => t.type === 'DEBIT').reduce((sum, t) => sum + Math.abs(t.amount), 0)

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        Extrato Consolidado
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Movimentações Bancárias
                    </p>
                </div>
                <button
                    onClick={fetchTransactions}
                    className="btn btn-secondary text-sm"
                >
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Entradas</p>
                            <p className="text-lg font-semibold text-emerald-600">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCredits)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-50 rounded-lg">
                            <ArrowDownLeft className="h-4 w-4 text-rose-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Saídas</p>
                            <p className="text-lg font-semibold text-rose-600">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDebits)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                {transactions.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                        <h4 className="text-lg font-medium text-gray-900">Nenhuma transação encontrada</h4>
                        <p className="text-sm mt-1">
                            O banco de dados está vazio. Importe um extrato para começar.
                        </p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Descrição</th>
                                <th>Categoria</th>
                                <th className="text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((tx, index) => (
                                <tr
                                    key={tx.id}
                                    className="animate-fade-in"
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <td className="font-medium text-gray-900">
                                        {new Date(tx.date).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td>
                                        <span className="font-medium text-gray-900">{tx.description}</span>
                                    </td>
                                    <td>
                                        <span className="badge badge-info">
                                            {tx.category || 'Outros'}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <div className={cn(
                                            "flex items-center justify-end gap-1 font-semibold",
                                            tx.type === 'CREDIT' ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {tx.type === 'CREDIT' ? (
                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                            ) : (
                                                <ArrowDownLeft className="h-3.5 w-3.5" />
                                            )}
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(tx.amount))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
