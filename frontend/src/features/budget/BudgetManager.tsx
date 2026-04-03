import { useState, useEffect } from 'react'
import {
    Plus,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    DollarSign,
    Building
} from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

interface BudgetItem {
    id?: number
    categoria: string
    valor_planejado: number
    valor_real?: number
}

export function BudgetManager() {
    const { user } = useAuth()
    const [budget, setBudget] = useState<BudgetItem[]>([])
    const [loading, setLoading] = useState(true)
    const [newCategory, setNewCategory] = useState('')
    const [newValue, setNewValue] = useState('')

    const fetchData = async () => {
        if (!user?.condominio_id) {
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            // Pega o orçamento planejado
            const budgetData = await api.getBudget(user.condominio_id)
            // Pega os gastos reais (agrupados por categoria no dashboard ou similar)
            // Por simplicidade neste MVP, vamos simular o cruzamento
            // Em uma versão avançada, o backend retornaria o orçado x realizado
            const expensesData = await api.getExpenses(user.condominio_id)

            const expensesByCategory = (expensesData || []).reduce((acc: any, curr: any) => {
                const cat = curr.categoria || 'Outros'
                acc[cat] = (acc[cat] || 0) + curr.valor
                return acc
            }, {})

            const combined = (budgetData || []).map((b: any) => ({
                ...b,
                valor_real: expensesByCategory[b.categoria] || 0
            }))

            setBudget(combined)
        } catch (err) {
            console.error('Erro ao buscar orçamento:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [user?.condominio_id])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newCategory || !newValue || !user?.condominio_id) return

        try {
            await api.saveBudget({
                condominio_id: user.condominio_id,
                categoria: newCategory,
                valor_previsto: parseFloat(newValue),
                ano: 2026
            })
            setNewCategory('')
            setNewValue('')
            fetchData()
        } catch (err) {
            alert('Erro ao salvar orçamento')
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando orçamento...</div>

    const totalPlanned = budget.reduce((sum, item) => sum + item.valor_planejado, 0)
    const totalReal = budget.reduce((sum, item) => sum + (item.valor_real || 0), 0)

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Orçamento Anual (Aprovado em Assembleia)</h2>
                    <p className="text-gray-500">Controle de cumprimento de metas financeiras</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-xs text-gray-500 block">Total Planejado</span>
                        <span className="text-lg font-bold text-gray-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPlanned)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Category Form */}
                <div className="lg:col-span-1">
                    <div className="card sticky top-36">
                        <div className="card-header border-b-0">
                            <h3 className="font-semibold text-gray-900">Nova Categoria</h3>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleAdd} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Categoria</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Manutenção, Limpeza..."
                                        className="w-full"
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Valor Mensal Previsto</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="number"
                                            placeholder="0,00"
                                            className="w-full pl-10"
                                            value={newValue}
                                            onChange={(e) => setNewValue(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                                <button type="submit" className="w-full btn btn-primary flex items-center justify-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Adicionar ao Plano
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Budget List */}
                <div className="lg:col-span-2 space-y-4">
                    {budget.length === 0 ? (
                        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
                            <Building className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                            <h4 className="text-lg font-medium text-gray-900">Nenhum orçamento definido</h4>
                            <p className="text-gray-500 max-w-sm mx-auto mt-2 text-sm">
                                Para começar a auditoria de orçados x realizados, adicione as categorias aprovadas na última assembleia.
                            </p>
                        </div>
                    ) : (
                        budget.map((item) => {
                            const diff = (item.valor_real || 0) - item.valor_planejado
                            const isOver = diff > 0
                            const percent = Math.min(((item.valor_real || 0) / item.valor_planejado) * 100, 100)

                            return (
                                <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm group hover:border-blue-200 transition-all">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                isOver ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                                            )}>
                                                {isOver ? <TrendingUp className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 text-lg uppercase tracking-tight">{item.categoria}</h4>
                                                <p className="text-sm text-gray-500">Mês de Referência: Janeiro/2026</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={cn(
                                                "text-sm font-bold",
                                                isOver ? "text-rose-600" : "text-emerald-600"
                                            )}>
                                                {isOver ? '+' : ''} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff)}
                                            </span>
                                            <p className="text-xs text-gray-400 capitalize">{isOver ? 'Excesso detected' : 'Dentro do plano'}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                            <span className="text-xs text-gray-500 block mb-1">Planejado</span>
                                            <span className="text-lg font-bold text-gray-900 tabular-nums">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_planejado)}
                                            </span>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                            <span className="text-xs text-gray-500 block mb-1">Gasto Real</span>
                                            <span className={cn(
                                                "text-lg font-bold tabular-nums",
                                                isOver ? "text-rose-600" : "text-emerald-600"
                                            )}>
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_real || 0)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold text-gray-500">
                                            <span>Execução Orçamentária</span>
                                            <span>{Math.round(((item.valor_real || 0) / item.valor_planejado) * 100)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full transition-all duration-1000",
                                                    isOver ? "bg-rose-500" : "bg-emerald-500"
                                                )}
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Warning Section */}
            {totalReal > totalPlanned && (
                <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl flex items-start gap-4">
                    <AlertTriangle className="h-6 w-6 text-rose-600 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-rose-900 uppercase text-sm tracking-wide">Alerta de Déficit Estimado</h4>
                        <p className="text-sm text-rose-700 mt-1">
                            O condomínio está operando acima do orçamento aprovado em assembleia geral por R$ {new Intl.NumberFormat('pt-BR').format(totalReal - totalPlanned)}.
                            Isto pode afetar o Fundo de Reserva se não houver remanejamento de verbas.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
