import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Landmark, TrendingUp, TrendingDown, Building2, LayoutDashboard, Loader2 } from 'lucide-react'

export function MasterDashboard() {
    const { data: records, isLoading } = useQuery({
        queryKey: ['macro-vision'],
        queryFn: () => api.getMacroVision()
    })

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                <p className="text-gray-500 font-medium">Carregando visão macro...</p>
            </div>
        )
    }

    const totals = records?.reduce((acc, curr) => ({
        receitas: acc.receitas + (curr.total_receitas || 0),
        despesas: acc.despesas + (curr.total_despesas || 0),
        transacoes: acc.transacoes + (curr.total_transacoes || 0),
        condominios: acc.condominios + 1
    }), { receitas: 0, despesas: 0, transacoes: 0, condominios: 0 })

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Visão Macro Administrador</h1>
                    <p className="text-gray-500">Monitoramento global de todas as unidades e administradoras</p>
                </div>
            </div>

            {/* Global Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                            <Building2 className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Condomínios</p>
                            <p className="text-xl font-bold text-gray-900">{totals?.condominios}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                            <TrendingUp className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Receita Total</p>
                            <p className="text-xl font-bold text-green-600">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals?.receitas || 0)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
                            <TrendingDown className="h-6 w-6 text-red-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Despesa Total</p>
                            <p className="text-xl font-bold text-red-600">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals?.despesas || 0)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <Landmark className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Transações</p>
                            <p className="text-xl font-bold text-gray-900">{totals?.transacoes}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* List of Units */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h2 className="font-semibold text-gray-900">Performance por Condomínio</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                <th className="px-6 py-4">Administradora</th>
                                <th className="px-6 py-4">Condomínio</th>
                                <th className="px-6 py-4 text-right">Receitas</th>
                                <th className="px-6 py-4 text-right">Despesas</th>
                                <th className="px-6 py-4 text-right">Saldo</th>
                                <th className="px-6 py-4 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {records?.map((rec, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600">{rec.administradora}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{rec.condominio}</td>
                                    <td className="px-6 py-4 text-sm text-right text-green-600">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rec.total_receitas || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-red-600">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rec.total_despesas || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((rec.total_receitas || 0) - (rec.total_despesas || 0))}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-1 rounded-full text-[10px] bg-green-100 text-green-600 font-bold">ATIVO</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
