import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { cn } from '../../lib/utils'
import { RefreshCw, AlertCircle } from 'lucide-react'

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

// Dados de fallback caso API não responda
// Dados de fallback para a Demo (Netlify) caso a API física não responda
const fallbackData: DashboardData = {
    orcamento_anual: 150000.0,
    orcamento_trend: '+2.5%',
    despesas_totais: 12450.80,
    despesas_trend: '-1.2%',
    fundo_reserva: 45000.0,
    fundo_trend: '+0.5%',
    grafico_dados: [
        { name: 'Jul', receitas: 25000, despesas: 22000 },
        { name: 'Ago', receitas: 26000, despesas: 21000 },
        { name: 'Set', receitas: 24000, despesas: 23000 },
        { name: 'Out', receitas: 27000, despesas: 20000 },
        { name: 'Nov', receitas: 25500, despesas: 24500 },
        { name: 'Dez', receitas: 28000, despesas: 21500 },
    ],
    alertas: [
        { title: 'Conexão Open Finance Ativa', description: 'Dados sendo sincronizados em tempo real.', severity: 'low', created_at: new Date().toISOString() },
        { title: 'Manutenção Elevador', description: 'NF pendente de auditoria para o mês de Dezembro.', severity: 'high', created_at: new Date().toISOString() },
        { title: 'Alerta de Inadimplência', description: '3 unidades com atraso superior a 60 dias.', severity: 'medium', created_at: new Date().toISOString() },
    ],
    ultima_atualizacao: new Date().toISOString()
}

export function Dashboard() {
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [data, setData] = useState<DashboardData>(fallbackData)
    const [error, setError] = useState<string | null>(null)
    const [isApiConnected, setIsApiConnected] = useState(false)

    const condominioId = '00000000-0000-0000-0000-000000000001' // Em produção vem do auth

    const fetchDashboardData = async () => {
        try {
            setRefreshing(true)
            setError(null)

            const response = await fetch(`${API_URL}/api/v1/dashboard/summary?condominio_id=${condominioId}`)

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`)
            }

            const result = await response.json()
            setData(result)
            setIsApiConnected(true)
        } catch (err) {
            console.error('Erro ao carregar dashboard:', err)
            setError('Não foi possível conectar à API')
            setIsApiConnected(false)
            // Mantém dados anteriores ou usa fallback
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchDashboardData()

        // Auto-refresh a cada 5 minutos
        const interval = setInterval(fetchDashboardData, 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    const formatCurrency = (value: number): string => {
        if (value >= 1000000) {
            return `R$ ${(value / 1000000).toFixed(1)}M`
        } else if (value >= 1000) {
            return `R$ ${(value / 1000).toFixed(0)}k`
        }
        return `R$ ${value.toFixed(2)}`
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600">Carregando dashboard...</span>
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Auditoria Financeira</h1>
                    {isApiConnected && (
                        <p className="text-sm text-gray-500 mt-1">
                            Última atualização: {new Date(data.ultima_atualizacao).toLocaleString('pt-BR')}
                        </p>
                    )}
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={fetchDashboardData}
                        disabled={refreshing}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition flex items-center gap-2"
                    >
                        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                        {refreshing ? 'Atualizando...' : 'Atualizar'}
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
                        Importar Orçamento
                    </button>
                    <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition">
                        Validar Pagamentos
                    </button>
                </div>
            </header>

            {error && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <span className="text-yellow-800">{error} - Exibindo dados em cache</span>
                </div>
            )}

            {!isApiConnected && !error && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600" />
                    <span className="text-blue-800">
                        Nenhuma conta bancária conectada. Vá em "Open Finance" para conectar.
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card
                    title="Orçamento Anual"
                    value={formatCurrency(data.orcamento_anual)}
                    trend={data.orcamento_trend}
                />
                <Card
                    title="Despesas Totais"
                    value={formatCurrency(data.despesas_totais)}
                    trend={data.despesas_trend}
                    negative
                />
                <Card
                    title="Fundo de Reserva"
                    value={formatCurrency(data.fundo_reserva)}
                    trend={data.fundo_trend}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-semibold mb-4">Receitas vs Despesas</h2>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.grafico_dados}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip
                                    formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
                                />
                                <Legend />
                                <Bar dataKey="receitas" fill="#3b82f6" name="Receitas" />
                                <Bar dataKey="despesas" fill="#ef4444" name="Despesas" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-semibold mb-4">Alertas de Auditoria</h2>
                    <div className="space-y-4">
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

function Card({ title, value, trend, negative }: { title: string, value: string, trend: string, negative?: boolean }) {
    const isPositive = trend.startsWith('+')
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500">{title}</h3>
            <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">{value}</span>
                <span className={cn(
                    "text-sm font-medium",
                    negative ? "text-red-600" : (isPositive ? "text-green-600" : "text-gray-500")
                )}>
                    {trend}
                </span>
            </div>
        </div>
    )
}

function AlertItem({ title, desc, severity }: { title: string, desc: string, severity: 'low' | 'medium' | 'high' | 'critical' }) {
    const colors = {
        low: 'bg-blue-50 text-blue-700 border-blue-100',
        medium: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        high: 'bg-orange-50 text-orange-700 border-orange-100',
        critical: 'bg-red-50 text-red-700 border-red-100',
    }

    return (
        <div className={cn("p-4 rounded-lg border flex justify-between items-start", colors[severity])}>
            <div>
                <h4 className="font-semibold">{title}</h4>
                <p className="text-sm opacity-90">{desc}</p>
            </div>
            <span className="text-xs font-bold uppercase px-2 py-1 bg-white/50 rounded">
                {severity}
            </span>
        </div>
    )
}
