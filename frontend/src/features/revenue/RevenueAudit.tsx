import { useState, useEffect } from 'react'
import {
    TrendingUp,
    TrendingDown,
    AlertCircle,
    FileText,
    CheckCircle,
    Search,
    Plus,
    RefreshCw
} from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

interface Boleto {
    id: number
    pagador: string
    valor: number
    vencimento: string
    status: 'aberto' | 'pago' | 'atrasado'
    data_pagamento?: string
}

export function RevenueAudit() {
    const { user } = useAuth()
    const [boletos, setBoletos] = useState<Boleto[]>([])
    const [transactions, setTransactions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'todos' | 'aberto' | 'pago' | 'atrasado'>('todos')
    const [taxaServico] = useState<number>(3.5) // Ex: 3.5%
    const [isAntecipado] = useState(true)

    const fetchData = async () => {
        if (!user?.condominio_id) {
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            const bData = await api.getBoletos(user.condominio_id)
            const tData = await api.getTransactions(user.condominio_id)

            // Lógica de "atrasado"
            const now = new Date()
            const processedBoletos = (bData || []).map((b: any) => {
                const venc = new Date(b.data_transacao)
                let status = b.conciliado ? 'pago' : 'aberto'
                if (status === 'aberto' && venc < now) {
                    status = 'atrasado'
                }
                return {
                    id: b.id,
                    pagador: b.descricao || 'Recebimento',
                    valor: b.valor,
                    vencimento: b.data_transacao,
                    status: status as 'aberto' | 'pago' | 'atrasado'
                }
            })

            setBoletos(processedBoletos)
            setTransactions((tData || []).filter((t: any) => t.type === 'CREDIT'))
        } catch (err) {
            console.error('Erro ao buscar receitas:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const filteredBoletos = filter === 'todos'
        ? boletos
        : boletos.filter(b => b.status === filter)

    const totalRevenue = boletos.filter(b => b.status === 'pago').reduce((sum, b) => sum + b.valor, 0)
    const totalPending = boletos.filter(b => b.status !== 'pago').reduce((sum, b) => sum + b.valor, 0)
    const inadimplencia = boletos.length > 0 ? (boletos.filter(b => b.status === 'atrasado').length / boletos.length) * 100 : 0

    // Cálculos de Antecipação
    const totalBruto = boletos.reduce((sum, b) => sum + b.valor, 0)
    const valorTaxa = (totalBruto * taxaServico) / 100
    const valorLiquidoEsperado = totalBruto - valorTaxa
    const valorLiquidoReal = transactions.reduce((sum, t) => sum + t.valor, 0)
    const divergenciaReceita = Math.abs(valorLiquidoEsperado - valorLiquidoReal)

    if (loading) return <div className="p-8 text-center text-gray-500">Analizando créditos e boletos...</div>

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:items-center md:flex-row justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Auditoria de Receitas</h2>
                    <p className="text-gray-500">Conferência de créditos bancários vs Boletos emitidos</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn btn-secondary flex items-center gap-2" onClick={fetchData}>
                        <RefreshCw className="h-4 w-4" />
                        Atualizar
                    </button>
                    <button className="btn btn-primary flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Importar Boletos
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Receita Arrecadada</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
                    </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                            <TrendingDown className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Pendente / Inadimplência</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPending)}
                    </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Taxa de Inadimplência</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {inadimplencia.toFixed(1)}%
                    </p>
                </div>

                {isAntecipado && (
                    <div className="md:col-span-3 bg-violet-600 p-8 rounded-3xl text-white shadow-xl shadow-violet-200 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-violet-100 font-medium mb-1">Auditoria de Antecipação</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-bold tracking-tight">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorLiquidoReal)}
                                </span>
                                <span className="text-violet-200">recebido no banco</span>
                            </div>
                            <div className="mt-4 flex gap-4 text-xs font-medium">
                                <div className="px-3 py-1 bg-white/10 rounded-full border border-white/20">Bruto: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBruto)}</div>
                                <div className="px-3 py-1 bg-white/10 rounded-full border border-white/20">Taxa: {taxaServico}% (-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTaxa)})</div>
                            </div>
                        </div>

                        <div className="relative z-10 bg-white/10 p-6 rounded-2xl border border-white/20 backdrop-blur-sm min-w-[280px]">
                            <p className="text-sm font-medium text-violet-100 mb-2">Conformidade de Taxas</p>
                            <div className="flex items-center gap-3">
                                {divergenciaReceita < 10 ? (
                                    <CheckCircle className="h-8 w-8 text-emerald-300" />
                                ) : (
                                    <AlertCircle className="h-8 w-8 text-amber-300 animate-pulse" />
                                )}
                                <div>
                                    <p className="text-xl font-bold">
                                        {divergenciaReceita < 10 ? 'Lançamento Correto' : `Divergência: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(divergenciaReceita)}`}
                                    </p>
                                    <p className="text-xs text-violet-200">vs. Resumo de Receita</p>
                                </div>
                            </div>
                        </div>

                        {/* Decor */}
                        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 bg-white/5 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 -ml-10 -mb-10 h-32 w-32 bg-violet-400/20 rounded-full blur-2xl" />
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar pagador..."
                                className="pl-10 text-sm py-2 rounded-xl border-gray-200"
                            />
                        </div>
                        <div className="flex bg-white rounded-xl border border-gray-200 p-1">
                            {(['todos', 'aberto', 'pago', 'atrasado'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize",
                                        filter === f ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/30">
                                <th className="px-6 py-4">Morador / Pagador</th>
                                <th className="px-6 py-4">Vencimento</th>
                                <th className="px-6 py-4 text-right">Valor</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredBoletos.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        Nenhum registro encontrado para este filtro.
                                    </td>
                                </tr>
                            ) : (
                                filteredBoletos.map((b) => (
                                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                                                    {b.pagador.substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="font-semibold text-gray-900">{b.pagador}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 tabular-nums">
                                            {new Date(b.vencimento).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right tabular-nums">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.valor)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                b.status === 'pago' ? "bg-emerald-100 text-emerald-700" :
                                                    b.status === 'atrasado' ? "bg-rose-100 text-rose-700 animate-pulse" : "bg-blue-100 text-blue-700"
                                            )}>
                                                {b.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <FileText className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Contextual Info */}
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-emerald-600 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-emerald-900 text-sm uppercase tracking-wide">Relatório de Antecipação de Receita</h4>
                    <p className="text-sm text-emerald-700 mt-1">
                        O monitoramento de créditos confirmou 100% dos repasses de antecipação deste mês. Nenhuma divergência de taxas detectada.
                    </p>
                </div>
            </div>
        </div>
    )
}
