import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { cn } from '../../lib/utils'
import { RefreshCw, TrendingUp, TrendingDown, Wallet, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { SkeletonDashboard } from '../../components/ui/Skeleton'

const API_URL = 'http://localhost:8000'

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

// Dados de fallback para a Demo (Netlify) caso a API física não responda
const fallbackData: DashboardData = {
    orcamento_anual: 156000.0,
    orcamento_trend: '+2.5%',
    despesas_totais: 12450.80,
    despesas_trend: '-1.2%',
    fundo_reserva: 48500.0,
    fundo_trend: '+3.8%',
    grafico_dados: [
        { name: 'Jul', receitas: 25000, despesas: 22000 },
        { name: 'Ago', receitas: 26000, despesas: 21000 },
        { name: 'Set', receitas: 24000, despesas: 23000 },
        { name: 'Out', receitas: 27000, despesas: 20000 },
        { name: 'Nov', receitas: 25500, despesas: 24500 },
        { name: 'Dez', receitas: 28000, despesas: 21500 },
    ],
    alertas: [
        { title: 'Pagamento Confirmado', description: 'Unidade 101 - Taxa condominial Dezembro', severity: 'low', created_at: new Date().toISOString() },
        { title: 'Manutenção Elevador', description: 'NF pendente de auditoria para validação', severity: 'high', created_at: new Date().toISOString() },
        { title: 'Inadimplência Detectada', description: '2 unidades com atraso superior a 30 dias', severity: 'medium', created_at: new Date().toISOString() },
    ],
    ultima_atualizacao: new Date().toISOString()
}

export function Dashboard() {
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [data, setData] = useState<DashboardData>(fallbackData)

    const condominioId = '00000000-0000-0000-0000-000000000001'

    const fetchDashboardData = async () => {
        try {
            setRefreshing(true)
            const response = await fetch(`${API_URL}/api/v1/dashboard/summary?condominio_id=${condominioId}`)
            if (response.ok) {
                const result = await response.json()
                setData(result)
            }
        } catch (err) {
            // Use fallback data silently
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        // Simulate minimum loading time for polish
        const timer = setTimeout(() => {
            fetchDashboardData()
        }, 800)
        return () => clearTimeout(timer)
    }, [])

    const formatCurrency = (value: number): string => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value)
    }

    if (loading) {
        return (
            <div className="p-8">
                <SkeletonDashboard />
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8 animate-fade-in">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                        Visão Geral
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        Atualizado em {new Date(data.ultima_atualizacao).toLocaleString('pt-BR')}
                    </p>
                </div>
                <button
                    onClick={fetchDashboardData}
                    disabled={refreshing}
                    className="btn btn-secondary"
                >
                    <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                    {refreshing ? 'Atualizando...' : 'Atualizar'}
                </button>
            </header>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Orçamento Anual"
                    value={formatCurrency(data.orcamento_anual)}
                    trend={data.orcamento_trend}
                    icon={<Wallet className="h-5 w-5" />}
                    color="blue"
                />
                <StatCard
                    title="Despesas do Mês"
                    value={formatCurrency(data.despesas_totais)}
                    trend={data.despesas_trend}
                    icon={<TrendingDown className="h-5 w-5" />}
                    color="red"
                    negative
                />
                <StatCard
                    title="Fundo de Reserva"
                    value={formatCurrency(data.fundo_reserva)}
                    trend={data.fundo_trend}
                    icon={<TrendingUp className="h-5 w-5" />}
                    color="green"
                />
            </div>

            {/* Chart + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Chart - 3 cols */}
                <div className="lg:col-span-3 card">
                    <div className="card-header flex items-center justify-between">
                        <h2 className="text-base font-semibold text-gray-900">Receitas vs Despesas</h2>
                        <span className="text-xs text-gray-500">Últimos 6 meses</span>
                    </div>
                    <div className="card-body">
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.grafico_dados} barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                                    />
                                    <Tooltip
                                        formatter={(value: number) => formatCurrency(value)}
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                        }}
                                    />
                                    <Legend
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{ paddingTop: '16px' }}
                                    />
                                    <Bar
                                        dataKey="receitas"
                                        fill="#3b82f6"
                                        name="Receitas"
                                        radius={[4, 4, 0, 0]}
                                    />
                                    <Bar
                                        dataKey="despesas"
                                        fill="#f43f5e"
                                        name="Despesas"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Alerts - 2 cols */}
                <div className="lg:col-span-2 card">
                    <div className="card-header">
                        <h2 className="text-base font-semibold text-gray-900">Alertas de Auditoria</h2>
                    </div>
                    <div className="card-body space-y-3">
                        {data.alertas.map((alerta, index) => (
                            <AlertItem
                                key={index}
                                title={alerta.title}
                                desc={alerta.description}
                                severity={alerta.severity as 'low' | 'medium' | 'high' | 'critical'}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// Stat Card Component
function StatCard({
    title,
    value,
    trend,
    icon,
    color,
    negative
}: {
    title: string
    value: string
    trend: string
    icon: React.ReactNode
    color: 'blue' | 'green' | 'red'
    negative?: boolean
}) {
    const isPositive = trend.startsWith('+')

    const colorClasses = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-emerald-50 text-emerald-600',
        red: 'bg-rose-50 text-rose-600',
    }

    return (
        <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-500">{title}</span>
                <div className={cn("p-2 rounded-lg", colorClasses[color])}>
                    {icon}
                </div>
            </div>
            <div className="flex items-end justify-between">
                <span className="text-2xl font-semibold text-gray-900 tracking-tight">{value}</span>
                <span className={cn(
                    "text-sm font-medium px-2 py-0.5 rounded-full",
                    negative
                        ? "bg-rose-50 text-rose-600"
                        : isPositive
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-gray-100 text-gray-600"
                )}>
                    {trend}
                </span>
            </div>
        </div>
    )
}

// Alert Item Component
function AlertItem({ title, desc, severity }: { title: string; desc: string; severity: 'low' | 'medium' | 'high' | 'critical' }) {
    const config = {
        low: {
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,
            badge: 'bg-emerald-100 text-emerald-700'
        },
        medium: {
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            icon: <Clock className="h-4 w-4 text-amber-500" />,
            badge: 'bg-amber-100 text-amber-700'
        },
        high: {
            bg: 'bg-orange-50',
            border: 'border-orange-100',
            icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
            badge: 'bg-orange-100 text-orange-700'
        },
        critical: {
            bg: 'bg-rose-50',
            border: 'border-rose-100',
            icon: <AlertTriangle className="h-4 w-4 text-rose-500" />,
            badge: 'bg-rose-100 text-rose-700'
        },
    }

    const c = config[severity]

    return (
        <div className={cn("p-3 rounded-lg border flex items-start gap-3", c.bg, c.border)}>
            <div className="mt-0.5">{c.icon}</div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{desc}</p>
            </div>
        </div>
    )
}
