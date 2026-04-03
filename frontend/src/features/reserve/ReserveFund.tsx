import { useState, useEffect } from 'react'
import {
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    TrendingUp,
    Calendar,
    Settings,
    Plus,
    RefreshCw,
    PieChart
} from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

interface Movimentacao {
    id: number
    tipo: 'DEPOSITO' | 'SAQUE' | 'RENDIMENTO'
    valor: number
    data_movimentacao: string
    descricao: string
}

export function ReserveFund() {
    const { user } = useAuth()
    const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
    const [config, setConfig] = useState({ valor_mensal_programado: 0, saldo_inicial: 0 })
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        if (!user?.condominio_id) {
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            const mData = await api.getReserveMovimentacoes(user.condominio_id)
            const cData = await api.getReserveConfig(user.condominio_id)
            setMovimentacoes(mData || [])
            setConfig(cData || { valor_mensal_programado: 0, saldo_inicial: 0 })
        } catch (err) {
            console.error('Erro ao buscar fundo de reserva:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [user?.condominio_id])

    const totalEntradas = movimentacoes
        .filter(m => m.tipo === 'DEPOSITO' || m.tipo === 'RENDIMENTO')
        .reduce((sum, m) => sum + m.valor, 0)

    const totalSaidas = movimentacoes
        .filter(m => m.tipo === 'SAQUE')
        .reduce((sum, m) => sum + m.valor, 0)

    const saldoAtual = config.saldo_inicial + totalEntradas - totalSaidas

    if (loading) return <div className="p-8 text-center text-gray-500">Calculando saldo do fundo de reserva...</div>

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Fundo de Reserva</h2>
                    <p className="text-gray-500">Gestão e auditoria de recursos de longo prazo</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn btn-secondary flex items-center gap-2" onClick={fetchData}>
                        <RefreshCw className="h-4 w-4" />
                        Sincronizar
                    </button>
                    <button className="btn btn-primary flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Nova Movimentação
                    </button>
                </div>
            </div>

            {/* Balanço Geral */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl text-white shadow-xl shadow-blue-200">
                    <div className="flex items-center gap-3 opacity-80 mb-4">
                        <Wallet className="h-5 w-5" />
                        <span className="text-sm font-medium uppercase tracking-wider">Saldo Total Acumulado</span>
                    </div>
                    <p className="text-4xl font-bold tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoAtual)}
                    </p>
                    <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                        <div>
                            <span className="text-xs opacity-60 block uppercase font-bold mb-1">Rendimento do Mês</span>
                            <span className="text-lg font-bold flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-400" />
                                + R$ 450,20
                            </span>
                        </div>
                        <div>
                            <span className="text-xs opacity-60 block uppercase font-bold mb-1">Meta Mensal</span>
                            <span className="text-lg font-bold">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(config.valor_mensal_programado)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                            <ArrowUpRight className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-bold text-gray-500 uppercase">Total Entradas</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas)}
                    </p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                            <ArrowDownRight className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-bold text-gray-500 uppercase">Total Saídas</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums text-rose-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaidas)}
                    </p>
                </div>
            </div>

            {/* Movimentações */}
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-gray-400" />
                        Histórico de Movimentações (Auditado)
                    </h3>
                    <button className="text-gray-400 hover:text-gray-600 p-2 rounded-lg transition-colors">
                        <Settings className="h-4 w-4" />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                <th className="px-6 py-4">Data</th>
                                <th className="px-6 py-4">Descrição</th>
                                <th className="px-6 py-4 text-right">Valor</th>
                                <th className="px-6 py-4 text-center">Tipo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {movimentacoes.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                        Nenhuma movimentação registrada no fundo de reserva.
                                    </td>
                                </tr>
                            ) : (
                                movimentacoes.map((m) => (
                                    <tr key={m.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-6 py-4 text-sm text-gray-500 tabular-nums">
                                            {new Date(m.data_movimentacao).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-medium text-gray-900">{m.descricao}</span>
                                        </td>
                                        <td className={cn(
                                            "px-6 py-4 text-sm font-bold text-right tabular-nums",
                                            m.tipo === 'SAQUE' ? "text-rose-600" : "text-emerald-600"
                                        )}>
                                            {m.tipo === 'SAQUE' ? '-' : '+'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.valor)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                m.tipo === 'DEPOSITO' ? "bg-blue-50 text-blue-600" :
                                                    m.tipo === 'RENDIMENTO' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                                            )}>
                                                {m.tipo}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex items-start gap-4">
                <PieChart className="h-6 w-6 text-amber-600 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-amber-900 text-sm uppercase tracking-wide">Relatório de Rendimentos Financeiros</h4>
                    <p className="text-sm text-amber-700 mt-1">
                        A rentabilidade do fundo neste mês foi de 0.85% (SELIC + CDI). Recomendamos verificar a alocação em fundos de liquidez diária para garantir disponibilidade imediata se necessário.
                    </p>
                </div>
            </div>
        </div>
    )
}
