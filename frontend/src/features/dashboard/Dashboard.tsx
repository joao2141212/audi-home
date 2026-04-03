import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '../../lib/utils'
import { RefreshCw, TrendingUp, TrendingDown, Wallet, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { SkeletonDashboard } from '../../components/ui/Skeleton'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface DashboardData {
    orcamento_anual: number
    orcamento_trend: string
    despesas_totais: number
    despesas_trend: string
    fundo_reserva: number
    fundo_trend: string
    grafico_dados: { name: string; receitas: number; despesas: number }[]
    alertas: { title: string; description: string; severity: string; created_at: string }[]
    ultima_atualizacao: string
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
    ultima_atualizacao: new Date().toISOString()
}

export function Dashboard() {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [data, setData] = useState<DashboardData>(fallbackData)

    const fetchDashboardData = async () => {
        if (!user?.condominio_id) return

        try {
            setRefreshing(true)

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

            // 3. Processar Totais
            const receitas = txs?.filter(t => t.type === 'CREDIT').reduce((s, t) => s + (t.valor || 0), 0) || 0
            const despesas = txs?.filter(t => t.type === 'DEBIT').reduce((s, t) => s + (t.valor || 0), 0) || 0

            // 4. Buscar Alertas
            const { data: alerts } = await supabase
                .from('comprovantes')
                .select('*')
                .eq('condominio_id', user.condominio_id)
                .or('status_auditoria.eq.pendente,status_auditoria.eq.suspeito')
                .limit(5)

            setData({
                orcamento_anual: 0,
                orcamento_trend: '+0.0%',
                despesas_totais: despesas,
                despesas_trend: '+0.0%',
                fundo_reserva: reserve?.saldo_inicial || 0,
                fundo_trend: '+0.0%',
                grafico_dados: [
                    { name: 'Mês Atual', receitas, despesas }
                ],
                alertas: alerts?.map(a => ({
                    title: 'Auditoria Exigida',
                    description: `Transação suspeita de R$ ${a.valor}`,
                    severity: a.status_auditoria === 'suspeito' ? 'high' : 'medium',
                    created_at: a.data_upload
                })) || [],
                ultima_atualizacao: new Date().toISOString()
            })

        } catch (err) {
            console.error('Erro ao buscar dashboard:', err)
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
                    title="Orçamento Mensal" 
                    value={formatCurrency(data.orcamento_anual)} 
                    trend="+12%" 
                    icon={<Wallet className="h-6 w-6" />} 
                    color="indigo" 
                />
                <StatCard 
                    title="Despesas Realizadas" 
                    value={formatCurrency(data.despesas_totais)} 
                    trend="+2.1%" 
                    icon={<TrendingDown className="h-6 w-6" />} 
                    color="rose" 
                    negative 
                />
                <StatCard 
                    title="Fundo de Reserva" 
                    value={formatCurrency(data.fundo_reserva)} 
                    trend="+5.5%" 
                    icon={<TrendingUp className="h-6 w-6" />} 
                    color="emerald" 
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Gráfico */}
                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Fluxo de Caixa (Cloud)</h2>
                            <p className="text-sm text-slate-500">Métricas financeiras consolidadas ao vivo</p>
                        </div>
                    </div>
                    
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
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
                        </ResponsiveContainer>
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
                <div className={cn(
                    "flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full border shadow-sm", 
                    negative ? "bg-rose-50/50 text-rose-600 border-rose-100" : "bg-emerald-50/50 text-emerald-600 border-emerald-100"
                )}>
                    {trend}
                </div>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
                <p className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight group-hover:scale-[1.02] transform transition-transform origin-left">{value}</p>
            </div>
        </div>
    )
}
