import { useState, useEffect } from 'react'
import { FileText, RefreshCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from '../../components/ui/Skeleton'

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
    const [loading, setLoading] = useState(true)
    const condominioId = '00000000-0000-0000-0000-000000000001'

    const fetchTransactions = async () => {
        setLoading(true)
        try {
            const response = await fetch(`http://localhost:8000/api/v1/pluggy/sync-transactions/${condominioId}`)
            if (response.ok) {
                const data = await response.json()
                const mapped: Transaction[] = (data.transactions || []).map((tx: any) => ({
                    id: tx.id,
                    description: tx.description,
                    amount: tx.amount,
                    date: tx.date.split('T')[0],
                    type: tx.amount > 0 ? 'CREDIT' : 'DEBIT',
                    category: tx.category
                }))
                setTransactions(mapped)
            } else {
                throw new Error('API offline')
            }
        } catch {
            // Fallback demo data
            setTransactions([
                { id: 'tx_001', description: 'CONDOMINIO EDIFICIO SOLAR - UNID 101', amount: 850.00, date: '2025-12-30', type: 'CREDIT', category: 'Receita' },
                { id: 'tx_002', description: 'MANUTENCAO ELEVADOR ATLAS SCHINDLER', amount: -1200.00, date: '2025-12-28', type: 'DEBIT', category: 'Manutenção' },
                { id: 'tx_003', description: 'ENEL DISTRIBUICAO - CONTA LUZ', amount: -3450.20, date: '2025-12-25', type: 'DEBIT', category: 'Contas Fixas' },
                { id: 'tx_004', description: 'CONDOMINIO EDIFICIO SOLAR - UNID 202', amount: 850.00, date: '2025-12-22', type: 'CREDIT', category: 'Receita' },
                { id: 'tx_005', description: 'LIMPEZA E CONSERVACAO LTDA', amount: -2800.00, date: '2025-12-20', type: 'DEBIT', category: 'Serviços' },
                { id: 'tx_006', description: 'CONDOMINIO EDIFICIO SOLAR - UNID 303', amount: 850.00, date: '2025-12-18', type: 'CREDIT', category: 'Receita' },
                { id: 'tx_007', description: 'SABESP - AGUA E ESGOTO', amount: -1890.50, date: '2025-12-15', type: 'DEBIT', category: 'Contas Fixas' },
            ])
        } finally {
            // Minimum loading time for polish
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
                        Movimentações via Open Finance
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
            </div>
        </div>
    )
}
