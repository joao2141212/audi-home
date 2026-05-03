import { useState, useEffect } from 'react'
import {
    TrendingDown,
    Search,
    RefreshCw,
    Building2,
    Calendar,
    AlertTriangle,
    CheckCircle,
    Clock,
    ChevronRight,
    Filter
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from '../../components/ui/Skeleton'
import { api } from '../../lib/api'

interface Transaction {
    id: string
    condominioId: string
    amount: number
    date: string
    description: string
    category?: string
    auditStatus?: 'pendente' | 'auditado' | 'suspeito' | 'alerta' | 'rejeitado'
}

interface ExpenseListProps {
    condominioId: string
    onAuditClick: (transaction: Transaction) => void
}

export function ExpenseList({ condominioId, onAuditClick }: ExpenseListProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'todos' | 'pendente' | 'auditado' | 'suspeito' | 'alerta' | 'rejeitado'>('todos')

    const fetchExpenses = async () => {
        setLoading(true)
        try {
            const data = await api.getExpenses(condominioId)
            const mapped: Transaction[] = (data || []).map((ex: any) => ({
                id: ex.id.toString(),
                condominioId: ex.condominio_id,
                amount: ex.valor,
                date: ex.data_emissao,
                description: ex.descricao || 'Despesa',
                category: ex.fornecedores?.razao_social || 'Geral',
                auditStatus: ex.status_auditoria || 'pendente'
            }))
            setTransactions(mapped)
        } catch (err) {
            console.error('Erro ao buscar despesas:', err)
            setTransactions([])
        } finally {
            setTimeout(() => setLoading(false), 600)
        }
    }

    useEffect(() => {
        fetchExpenses()
    }, [condominioId])

    const filteredTransactions = filter === 'todos'
        ? transactions
        : transactions.filter(t => t.auditStatus === filter)

    const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.amount, 0)

    const statusCounts = {
        pendente: transactions.filter(t => t.auditStatus === 'pendente').length,
        auditado: transactions.filter(t => t.auditStatus === 'auditado').length,
        rejeitado: transactions.filter(t => t.auditStatus === 'rejeitado').length,
    }

    const getStatusConfig = (status?: string) => {
        switch (status) {
            case 'auditado':
                return {
                    icon: <CheckCircle className="h-4 w-4" />,
                    classes: 'text-emerald-600 bg-emerald-50'
                }
            case 'suspeito':
            case 'alerta':
                return {
                    icon: <AlertTriangle className="h-4 w-4" />,
                    classes: 'text-amber-600 bg-amber-50'
                }
            case 'rejeitado':
                return {
                    icon: <AlertTriangle className="h-4 w-4" />,
                    classes: 'text-rose-600 bg-rose-50'
                }
            default:
                return {
                    icon: <Clock className="h-4 w-4" />,
                    classes: 'text-amber-600 bg-amber-50'
                }
        }
    }

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <div className="skeleton h-8 w-48 rounded" />
                    <div className="skeleton h-10 w-28 rounded-lg" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="skeleton h-20 rounded-xl" />
                    ))}
                </div>
                <SkeletonTable rows={5} />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 rounded-lg">
                        <TrendingDown className="h-5 w-5 text-rose-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Despesas para Auditoria</h3>
                        <p className="text-sm text-gray-500">Valide os fornecedores via CNPJ/RFB</p>
                    </div>
                </div>
                <button
                    onClick={fetchExpenses}
                    className="btn btn-secondary"
                >
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                </button>
            </div>

            {/* Status Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <button
                    onClick={() => setFilter('pendente')}
                    className={cn(
                        "card p-4 text-left transition-all",
                        filter === 'pendente' && "ring-2 ring-amber-500"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pendentes</p>
                            <p className="text-2xl font-semibold text-amber-600 mt-1">{statusCounts.pendente}</p>
                        </div>
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <Clock className="h-5 w-5 text-amber-600" />
                        </div>
                    </div>
                </button>

                <button
                    onClick={() => setFilter('auditado')}
                    className={cn(
                        "card p-4 text-left transition-all",
                        filter === 'auditado' && "ring-2 ring-emerald-500"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aprovados</p>
                            <p className="text-2xl font-semibold text-emerald-600 mt-1">{statusCounts.auditado}</p>
                        </div>
                        <div className="p-2 bg-emerald-100 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                        </div>
                    </div>
                </button>

                <button
                    onClick={() => setFilter('rejeitado')}
                    className={cn(
                        "card p-4 text-left transition-all",
                        filter === 'rejeitado' && "ring-2 ring-rose-500"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rejeitados</p>
                            <p className="text-2xl font-semibold text-rose-600 mt-1">{statusCounts.rejeitado}</p>
                        </div>
                        <div className="p-2 bg-rose-100 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-rose-600" />
                        </div>
                    </div>
                </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <div className="flex gap-2">
                    {(['todos', 'pendente', 'auditado', 'suspeito', 'alerta', 'rejeitado'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize",
                                filter === f
                                    ? "bg-gray-900 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <span className="ml-auto text-sm text-gray-500">
                    Total: <span className="font-semibold text-gray-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
                    </span>
                </span>
            </div>

            {/* Expenses Table */}
            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th>Data</th>
                            <th className="text-right">Valor</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTransactions.map((tx, index) => {
                            const statusConfig = getStatusConfig(tx.auditStatus)
                            return (
                                <tr
                                    key={tx.id}
                                    className="animate-fade-in"
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-gray-100 rounded-lg">
                                                <Building2 className="h-4 w-4 text-gray-600" />
                                            </div>
                                            <span className="font-medium text-gray-900">{tx.description}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge badge-info">{tx.category}</span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1.5 text-gray-500">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {new Date(tx.date).toLocaleDateString('pt-BR')}
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <span className="font-semibold text-rose-600">
                                            - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                            statusConfig.classes
                                        )}>
                                            {statusConfig.icon}
                                            <span className="capitalize">{tx.auditStatus}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => onAuditClick(tx)}
                                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                        >
                                            <Search className="h-4 w-4" />
                                            Auditar
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                {filteredTransactions.length === 0 && (
                    <div className="py-12 text-center text-gray-500">
                        Nenhuma despesa encontrada com este filtro.
                    </div>
                )}
            </div>
        </div>
    )
}
