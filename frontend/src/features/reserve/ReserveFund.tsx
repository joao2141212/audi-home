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
    tipo: 'DEPOSITO' | 'SAQUE' | 'RENDIMENTO' | 'APORTE'
    valor: number
    data_movimentacao: string
    descricao: string
}

export function ReserveFund() {
    const { user } = useAuth()
    const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
    const [config, setConfig] = useState({ valor_mensal_programado: 0, saldo_inicial: 0 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState({
        tipo: 'DEPOSITO' as 'DEPOSITO' | 'SAQUE' | 'RENDIMENTO',
        valor: '',
        data_movimentacao: new Date().toISOString().slice(0, 10),
        descricao: '',
    })

    const fetchData = async () => {
        if (!user?.condominio_id) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const mData = await api.getReserveMovimentacoes(user.condominio_id)
            const cData = await api.getReserveConfig(user.condominio_id)
            setMovimentacoes((mData || []).map((item: Movimentacao) => ({
                ...item,
                tipo: String(item.tipo).toUpperCase() as Movimentacao['tipo'],
            })))
            setConfig(cData || { valor_mensal_programado: 0, saldo_inicial: 0 })
        } catch (err) {
            const errorClass = String(err instanceof Error ? err.message : err).split(/\s|:/)[0] || 'RESERVE_LOAD_FAILED'
            console.error(JSON.stringify({ fn: 'ReserveFund.fetchData', status: 'error', error_class: errorClass }))
            setError('Não foi possível carregar o fundo de reserva. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [user?.condominio_id])

    const handleSave = async () => {
        if (!user?.condominio_id) return
        const valor = Number(form.valor)
        if (!form.descricao.trim() || !Number.isFinite(valor) || valor <= 0 || !form.data_movimentacao) {
            setFormError('Preencha descrição, valor maior que zero e data.')
            return
        }

        setSaving(true)
        setFormError(null)
        try {
            await api.saveReserveMovimentacao({
                condominio_id: user.condominio_id,
                tipo: form.tipo,
                valor,
                data_movimentacao: form.data_movimentacao,
                descricao: form.descricao.trim(),
            })
            setForm({
                tipo: 'DEPOSITO',
                valor: '',
                data_movimentacao: new Date().toISOString().slice(0, 10),
                descricao: '',
            })
            setShowForm(false)
            await fetchData()
        } catch (err) {
            console.error(JSON.stringify({ fn: 'ReserveFund.handleSave', status: 'error', error: err }))
            setFormError('Não foi possível salvar a movimentação. Tente novamente.')
        } finally {
            setSaving(false)
        }
    }

    const totalEntradas = movimentacoes
        .filter(m => m.tipo === 'DEPOSITO' || m.tipo === 'RENDIMENTO' || m.tipo === 'APORTE')
        .reduce((sum, m) => sum + (Number(m.valor) || 0), 0)

    const totalSaidas = movimentacoes
        .filter(m => m.tipo === 'SAQUE')
        .reduce((sum, m) => sum + (Number(m.valor) || 0), 0)

    const currentMonth = new Date().toISOString().slice(0, 7)
    const rendimentoMes = movimentacoes
        .filter(m => m.tipo === 'RENDIMENTO' && String(m.data_movimentacao).startsWith(currentMonth))
        .reduce((sum, m) => sum + (Number(m.valor) || 0), 0)

    const saldoAtual = config.saldo_inicial + totalEntradas - totalSaidas

    if (loading) return <div className="p-8 text-center text-gray-500">Calculando saldo do fundo de reserva...</div>

    if (error) {
        return (
            <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
                <AlertTriangle className="h-10 w-10 text-rose-500" />
                <div>
                    <h2 className="text-lg font-bold text-rose-900">Fundo de reserva indisponível</h2>
                    <p className="mt-1 text-sm text-rose-700">{error}</p>
                </div>
                <button type="button" onClick={fetchData} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700">
                    Tentar novamente
                </button>
            </div>
        )
    }

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
                    <button className="btn btn-primary flex items-center gap-2" onClick={() => { setFormError(null); setShowForm(true) }}>
                        <Plus className="h-4 w-4" />
                        Nova Movimentação
                    </button>
                </div>
            </div>

            {showForm && (
                <div role="dialog" aria-modal="true" aria-labelledby="reserve-form-title" className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 id="reserve-form-title" className="font-bold text-gray-900">Nova movimentação</h3>
                        <button className="text-gray-500" onClick={() => setShowForm(false)} aria-label="Fechar formulário">Fechar</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <label className="text-sm font-semibold text-gray-700">
                            Tipo
                            <select className="input mt-1 w-full" value={form.tipo} onChange={e => setForm(prev => ({ ...prev, tipo: e.target.value as typeof prev.tipo }))}>
                                <option value="DEPOSITO">Depósito</option>
                                <option value="SAQUE">Saque</option>
                                <option value="RENDIMENTO">Rendimento</option>
                            </select>
                        </label>
                        <label className="text-sm font-semibold text-gray-700">
                            Valor
                            <input className="input mt-1 w-full" type="number" min="0.01" step="0.01" value={form.valor} onChange={e => setForm(prev => ({ ...prev, valor: e.target.value }))} />
                        </label>
                        <label className="text-sm font-semibold text-gray-700">
                            Data
                            <input className="input mt-1 w-full" type="date" value={form.data_movimentacao} onChange={e => setForm(prev => ({ ...prev, data_movimentacao: e.target.value }))} />
                        </label>
                        <label className="text-sm font-semibold text-gray-700">
                            Descrição
                            <input className="input mt-1 w-full" value={form.descricao} onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))} />
                        </label>
                    </div>
                    {formError && <p role="alert" className="mt-3 text-sm text-rose-600">{formError}</p>}
                    <div className="flex justify-end gap-2 mt-4">
                        <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Salvando...' : 'Salvar movimentação'}</button>
                    </div>
                </div>
            )}

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
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rendimentoMes)}
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
                                                m.tipo === 'DEPOSITO' || m.tipo === 'APORTE' ? "bg-blue-50 text-blue-600" :
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
                        Os rendimentos exibidos correspondem às movimentações classificadas como rendimento no período carregado. Verifique a documentação financeira antes de tomar decisões de alocação.
                    </p>
                </div>
            </div>
        </div>
    )
}
import { AlertTriangle } from 'lucide-react'
