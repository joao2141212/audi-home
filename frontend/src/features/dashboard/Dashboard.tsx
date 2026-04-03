import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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

            // 1. Buscar Transações para o gráfico e totais
            const { data: txs, error: txError } = await supabase
                .from('transacoes_bancarias')
                .select('*')
                .eq('condominio_id', user.condominio_id)

            if (txError) throw txError

            // 2. Buscar Config de Reserva
            const { data: reserve, error: resError } = await supabase
                .from('reserva_config')
                .select('*')
                .eq('condominio_id', user.condominio_id)
                .single()

            // 3. Processar Totais
            const receitas = txs?.filter(t => t.type === 'CREDIT').reduce((s, t) => s + (t.valor || 0), 0) || 0
            const despesas = txs?.filter(t => t.type === 'DEBIT').reduce((s, t) => s + (t.valor || 0), 0) || 0

            // 4. Buscar Alertas (Comprovantes pendentes ou suspeitos)
            const { data: alerts } = await supabase
                .from('comprovantes')
                .select('*')
                .eq('condominio_id', user.condominio_id)
                .or('status_auditoria.eq.pendente,status_auditoria.eq.suspeito')
                .limit(5)

            setData({
                orcamento_anual: 0, // Implementar tabela de orçamento depois
                orcamento_trend: '+0%',
                despesas_totais: despesas,
                despesas_trend: '+0%',
                fundo_reserva: reserve?.saldo_inicial || 0,
                fundo_trend: '+0%',
                grafico_dados: [
                    { name: 'Atual', receitas, despesas }
                ],
                alertas: alerts?.map(a => ({
                    title: 'Auditoria Pendente',
                    description: `Comprovante de R$ ${a.valor} aguardando análise`,
                    severity: a.status_auditoria === 'suspeito' ? 'high' : 'medium',
                    created_at: a.data_upload
                })) || [],
                ultima_atualizacao: new Date().toISOString()
            })

        } catch (err) {
            console.error('Erro ao buscar dashboard do Supabase:', err)
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

    if (loading) return <div className="p-8"><SkeletonDashboard /></div>

    return (
        <div className="p-8 space-y-8 animate-fade-in shadow-2xl rounded-3xl bg-white/50 backdrop-blur-sm border border-white">
            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        Gestão da Unidade
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-2 font-medium">
                        <Clock className="h-4 w-4 text-blue-500" />
                        Live Cloud Data • {new Date(data.ultima_atualizacao).toLocaleString('pt-BR')}
                    </p>
                </div>
                <button
                    onClick={fetchDashboardData}
                    disabled={refreshing}
                    className="p-3 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all active:scale-95 text-gray-600"
                >
                    <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin text-blue-600")} />
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <StatCard title="Saldo Atual" value={formatCurrency(data.orcamento_anual)} trend="+0%" icon={<Wallet />} color="blue" />
                <StatCard title="Saídas (Mês)" value={formatCurrency(data.despesas_totais)} trend="+0%" icon={<TrendingDown />} color="red" negative />
                <StatCard title="Fundo de Reserva" value={formatCurrency(data.fundo_reserva)} trend="+0%" icon={<TrendingUp />} color="green" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3 card rounded-3xl border-none shadow-xl bg-white p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-6">Fluxo de Caixa (Cloud)</h2>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.grafico_dados}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} />
                                <Bar dataKey="receitas" fill="#4F46E5" radius={[6, 6, 0, 0]} barSize={40} />
                                <Bar dataKey="despesas" fill="#EF4444" radius={[6, 6, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="lg:col-span-2 card rounded-3xl border-none shadow-xl bg-white p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-6">Alertas da Auditoria</h2>
                    <div className="space-y-4">
                        {data.alertas.length > 0 ? data.alertas.map((a, i) => (
                            <div key={i} className={cn("p-4 rounded-2xl border flex gap-3", a.severity === 'high' ? "bg-red-50 border-red-100" : "bg-blue-50 border-blue-100")}>
                                <AlertTriangle className={cn("h-5 w-5", a.severity === 'high' ? "text-red-500" : "text-blue-500")} />
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{a.title}</p>
                                    <p className="text-xs text-gray-600">{a.description}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-10">
                                <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">Nenhuma divergência detectada</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ title, value, trend, icon, color, negative }: any) {
    const colors: any = {
        blue: 'bg-blue-600 text-white',
        green: 'bg-green-500 text-white',
        red: 'bg-red-500 text-white'
    }
    return (
        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-gray-50 flex flex-col gap-4 hover:translate-y-[-4px] transition-transform">
            <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{title}</p>
                <div className={cn("p-3 rounded-2xl shadow-lg", colors[color])}>{icon}</div>
            </div>
            <p className="text-3xl font-black text-gray-900">{value}</p>
            <span className={cn("text-xs font-bold px-3 py-1 rounded-full w-fit", negative ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600")}>{trend}</span>
        </div>
    )
}
