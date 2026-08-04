import { useState, useEffect, type ReactNode } from 'react'
import { useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '../../lib/utils'
import { RefreshCw, TrendingUp, TrendingDown, Wallet, AlertTriangle, CheckCircle, Shield, FileWarning, GitMerge, ClipboardCheck } from 'lucide-react'
import { SkeletonDashboard } from '../../components/ui/Skeleton'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface SaudeAuditoria {
    total_comprovantes: number
    pendentes: number
    suspeitos: number
    alertas_status: number
    auditados: number
    sem_vinculo_banco: number
    txs_nao_conciliadas: number
}

interface DashboardData {
    orcamento_anual: number
    orcamento_trend: string
    despesas_totais: number
    despesas_trend: string
    fundo_reserva: number
    fundo_trend: string
    grafico_dados: { name: string; receitas: number; despesas: number }[]
    alertas: { title: string; description: string; severity: string; created_at: string }[]
    saude: SaudeAuditoria
    ultima_atualizacao: string
}

const emptySaude: SaudeAuditoria = {
    total_comprovantes: 0,
    pendentes: 0,
    suspeitos: 0,
    alertas_status: 0,
    auditados: 0,
    sem_vinculo_banco: 0,
    txs_nao_conciliadas: 0,
}

const fallbackData: DashboardData = {
    orcamento_anual: 0,
    orcamento_trend: '+0%',
    despesas_totais: 0,
    despesas_trend: '+0%',
    fundo_reserva: 0,
    fundo_trend: '+0%',
    grafico_dados: [],
    alertas: [],
    saude: emptySaude,
    ultima_atualizacao: new Date().toISOString()
}

export function Dashboard() {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [data, setData] = useState<DashboardData>(fallbackData)
    const [chartReady, setChartReady] = useState(false)
    const chartWrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const wrapper = chartWrapperRef.current
        if (!wrapper || typeof ResizeObserver === 'undefined') return

        const updateChartVisibility = () => {
            const { width, height } = wrapper.getBoundingClientRect()
            setChartReady(width > 0 && height > 0)
        }

        updateChartVisibility()
        const observer = new ResizeObserver(updateChartVisibility)
        observer.observe(wrapper)
        return () => observer.disconnect()
    }, [])

    const fetchDashboardData = async () => {
        if (!user?.condominio_id) {
            setLoading(false)
            return
        }

        try {
            setRefreshing(true)
            setError(null)

            // 1. Buscar Transações
            const { data: txs, error: txError } = await supabase
                .from('transacoes_bancarias')
                .select('*')
                .eq('condominio_id', user.condominio_id)

            if (txError) throw txError

            // 2. Buscar Config de Reserva
            const { data: reserve } = await supabase
                .from('reserva_config')
                .select('*')
                .eq('condominio_id', user.condominio_id)
                .single()

            const { data: budgetRows, error: budgetError } = await supabase
                .from('orcamento_anual')
                .select('valor_previsto')
                .eq('condominio_id', user.condominio_id)

            if (budgetError) throw budgetError

            const { data: reserveMovements, error: reserveMovementsError } = await supabase
                .from('reserva_movimentacoes')
                .select('tipo, valor')
                .eq('condominio_id', user.condominio_id)

            if (reserveMovementsError) throw reserveMovementsError

            // 3. Processar Totais
            const receitas = txs?.filter(t => t.type === 'CREDIT').reduce((s, t) => s + (t.valor || 0), 0) || 0
            const despesas = txs?.filter(t => t.type === 'DEBIT').reduce((s, t) => s + (t.valor || 0), 0) || 0
            const orcamentoAnual = (budgetRows || []).reduce((sum, row) => sum + (Number(row.valor_previsto) || 0), 0)
            const saldoInicialReserva = Number(reserve?.saldo_inicial) || 0
            const saldoReserva = saldoInicialReserva + (reserveMovements || []).reduce((sum, movement) => {
                const valor = Number(movement.valor) || 0
                return sum + (String(movement.tipo || '').toUpperCase() === 'SAQUE' ? -valor : valor)
            }, 0)

            // 4. Comprovantes (radar + saúde de auditoria)
            const { data: comps } = await supabase
                .from('comprovantes')
                .select('id, valor, status_auditoria, transacao_id, created_at')
                .eq('condominio_id', user.condominio_id)

            const list = comps || []
            const saude: SaudeAuditoria = {
                total_comprovantes: list.length,
                pendentes: list.filter(c => c.status_auditoria === 'pendente').length,
                suspeitos: list.filter(c => c.status_auditoria === 'suspeito').length,
                alertas_status: list.filter(c => c.status_auditoria === 'alerta').length,
                auditados: list.filter(c => c.status_auditoria === 'auditado').length,
                sem_vinculo_banco: list.filter(c => !c.transacao_id).length,
                txs_nao_conciliadas: txs?.filter(t => !t.conciliado).length || 0,
            }

            const alerts = list
                .filter(c => c.status_auditoria === 'pendente' || c.status_auditoria === 'suspeito' || c.status_auditoria === 'alerta')
                .slice(0, 5)

            setData({
                orcamento_anual: orcamentoAnual,
                orcamento_trend: '+0.0%',
                despesas_totais: despesas,
                despesas_trend: '+0.0%',
                fundo_reserva: saldoReserva,
                fundo_trend: '+0.0%',
                grafico_dados: [
                    { name: 'Mês Atual', receitas, despesas }
                ],
                alertas: alerts.map(a => ({
                    title: a.status_auditoria === 'suspeito' ? 'Comprovante suspeito' : a.status_auditoria === 'alerta' ? 'Comprovante com alerta' : 'Pendente de revisão',
                    description: `R$ ${a.valor ?? '—'} · status ${a.status_auditoria}`,
                    severity: a.status_auditoria === 'suspeito' ? 'high' : 'medium',
                    created_at: a.created_at
                })),
                saude,
                ultima_atualizacao: new Date().toISOString()
            })

        } catch (err) {
            const errorClass = String(err instanceof Error ? err.message : err).split(/\s|:/)[0] || 'DASHBOARD_LOAD_FAILED'
            console.error(JSON.stringify({ fn: 'Dashboard.fetchDashboardData', status: 'error', error_class: errorClass }))
            setError('Não foi possível carregar os dados do Dashboard. Tente novamente.')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchDashboardData()
    }, [user])

    const formatCurrency = (value: number): string => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    if (loading) return <SkeletonDashboard />

    if (error) {
        return (
            <div className="min-h-[360px] flex flex-col items-center justify-center gap-4 rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
                <AlertTriangle className="h-10 w-10 text-rose-500" />
                <div>
                    <h2 className="text-lg font-bold text-rose-900">Dashboard indisponível</h2>
                    <p className="mt-1 text-sm text-rose-700">{error}</p>
                </div>
                <button
                    type="button"
                    onClick={fetchDashboardData}
                    disabled={refreshing}
                    className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                    Tentar novamente
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                        Gestão da Unidade
                    </h1>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <p className="text-sm font-semibold text-slate-500 flex items-center gap-1.5 shadow-sm border border-slate-100 rounded-full px-3 py-0.5 w-fit">
                            Live Cloud Data
                            <span className="text-slate-300 mx-1">|</span>
                            {new Date(data.ultima_atualizacao).toLocaleTimeString('pt-BR')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={fetchDashboardData}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md hover:bg-white transition-all active:scale-95 text-slate-600 font-semibold text-sm"
                >
                    <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-indigo-600")} />
                    Atualizar Agora
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                    title="Orçamento Anual"
                    value={formatCurrency(data.orcamento_anual)} 
                    icon={<Wallet className="h-6 w-6" />} 
                    color="indigo" 
                />
                <StatCard 
                    title="Despesas Realizadas" 
                    value={formatCurrency(data.despesas_totais)} 
                    icon={<TrendingDown className="h-6 w-6" />} 
                    color="rose" 
                    negative 
                />
                <StatCard 
                    title="Fundo de Reserva" 
                    value={formatCurrency(data.fundo_reserva)} 
                    icon={<TrendingUp className="h-6 w-6" />} 
                    color="emerald" 
                />
            </div>

            {/* Saúde de auditoria — MVP pasta digital (domínio Perplexity) */}
            <section className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <Shield className="h-5 w-5 text-indigo-600" />
                            Saúde de auditoria
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Completude da pasta: comprovantes, revisão e vínculo com extrato
                        </p>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full">
                        {data.saude.total_comprovantes} docs
                    </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <HealthChip
                        label="Suspeitos"
                        value={data.saude.suspeitos}
                        icon={<FileWarning className="h-4 w-4" />}
                        tone={data.saude.suspeitos > 0 ? 'danger' : 'ok'}
                    />
                    <HealthChip
                        label="Alertas"
                        value={data.saude.alertas_status}
                        icon={<AlertTriangle className="h-4 w-4" />}
                        tone={data.saude.alertas_status > 0 ? 'warn' : 'ok'}
                    />
                    <HealthChip
                        label="Pendentes"
                        value={data.saude.pendentes}
                        icon={<ClipboardCheck className="h-4 w-4" />}
                        tone={data.saude.pendentes > 0 ? 'warn' : 'ok'}
                    />
                    <HealthChip
                        label="Auditados"
                        value={data.saude.auditados}
                        icon={<CheckCircle className="h-4 w-4" />}
                        tone="ok"
                    />
                    <HealthChip
                        label="Sem vínculo banco"
                        value={data.saude.sem_vinculo_banco}
                        icon={<GitMerge className="h-4 w-4" />}
                        tone={data.saude.sem_vinculo_banco > 0 ? 'warn' : 'ok'}
                    />
                    <HealthChip
                        label="Txs abertas"
                        value={data.saude.txs_nao_conciliadas}
                        icon={<TrendingDown className="h-4 w-4" />}
                        tone={data.saude.txs_nao_conciliadas > 0 ? 'muted' : 'ok'}
                    />
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Gráfico */}
                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Fluxo de Caixa (Cloud)</h2>
                            <p className="text-sm text-slate-500">Métricas financeiras consolidadas ao vivo</p>
                        </div>
                    </div>
                    
                        <div ref={chartWrapperRef} className="h-[280px] w-full" style={{ minHeight: 280, minWidth: 1 }}>
                            {chartReady && <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={280}>
                            <BarChart data={data.grafico_dados} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }} 
                                    dy={10} 
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }} 
                                    tickFormatter={(val) => `R$ ${val/1000}k`}
                                />
                                <Tooltip 
                                    cursor={{ fill: '#F8FAFC' }}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                    formatter={(value: number) => [formatCurrency(value), '']}
                                />
                                <Bar dataKey="receitas" name="Entradas" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={24} />
                                <Bar dataKey="despesas" name="Saídas" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={24} />
                            </BarChart>
                            </ResponsiveContainer>}
                    </div>
                </div>

                {/* Alertas */}
                <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-indigo-950 border border-slate-800 rounded-3xl p-8 shadow-xl text-white">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">Radar de Auditoria</h2>
                            <p className="text-sm text-slate-400">Notificações e possíveis inconsistências</p>
                        </div>
                        <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                            <AlertTriangle className="h-5 w-5 text-indigo-300" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {data.alertas.length > 0 ? data.alertas.map((a, i) => (
                            <div key={i} className="group p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-md flex items-start gap-4">
                                <div className={cn(
                                    "p-2.5 rounded-xl mt-0.5",
                                    a.severity === 'high' ? "bg-rose-500/20 text-rose-400" : "bg-indigo-500/20 text-indigo-400"
                                )}>
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-white mb-0.5 group-hover:text-amber-300 transition-colors">{a.title}</p>
                                    <p className="text-sm text-slate-400">{a.description}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center p-6 bg-white/5 border border-white/10 rounded-2xl border-dashed">
                                <div className="p-4 bg-emerald-500/20 rounded-full mb-4">
                                    <CheckCircle className="h-8 w-8 text-emerald-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">Tudo nos conformes</h3>
                                <p className="text-slate-400 text-sm">Nenhuma divergência detectada pelo nosso motor de auditoria hoje.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ title, value, trend, icon, color, negative }: any) {
    const colorStyles: any = {
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        rose: 'bg-rose-50 text-rose-600 border-rose-100'
    }
    
    return (
        <div className="group bg-white p-6 md:p-8 rounded-[2rem] shadow-sm hover:shadow-lg border border-slate-200 flex flex-col gap-6 transition-all duration-300">
            <div className="flex justify-between items-start">
                <div className={cn("p-4 rounded-2xl shadow-sm border", colorStyles[color])}>
                    {icon}
                </div>
                {trend && <div className={cn(
                    "flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full border shadow-sm", 
                    negative ? "bg-rose-50/50 text-rose-600 border-rose-100" : "bg-emerald-50/50 text-emerald-600 border-emerald-100"
                )}>
                    {trend}
                </div>}
            </div>
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
                <p className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight group-hover:scale-[1.02] transform transition-transform origin-left">{value}</p>
            </div>
        </div>
    )
}

function HealthChip({
    label,
    value,
    icon,
    tone,
}: {
    label: string
    value: number
    icon: ReactNode
    tone: 'ok' | 'warn' | 'danger' | 'muted'
}) {
    const tones = {
        ok: 'bg-emerald-50 text-emerald-800 border-emerald-100',
        warn: 'bg-amber-50 text-amber-900 border-amber-100',
        danger: 'bg-rose-50 text-rose-900 border-rose-100',
        muted: 'bg-slate-50 text-slate-700 border-slate-100',
    }
    return (
        <div className={cn('rounded-2xl border px-3 py-3 flex flex-col gap-2', tones[tone])}>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide opacity-80">
                {icon}
                {label}
            </div>
            <p className="text-2xl font-black tabular-nums leading-none">{value}</p>
        </div>
    )
}
