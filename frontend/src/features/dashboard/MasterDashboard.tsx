import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLogs } from '../../contexts/AuthContext'
import {
    Landmark, TrendingUp, TrendingDown, Building2, ShieldAlert,
    ShieldCheck, RefreshCw, AlertTriangle, Users, FileText, Loader2
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface CondoRow {
    condominio_id: string
    condominio_nome: string
    total_receitas: number
    total_despesas: number
    comprovantes_pendentes: number
    comprovantes_suspeitos: number
}

export function MasterDashboard() {
    const { user } = useAuth()
    const [records, setRecords] = useState<CondoRow[]>([])
    const [loading, setLoading] = useState(true)
    const [logs, setLogs] = useState<any[]>([])
    const [showLogs, setShowLogs] = useState(false)

    // Security gate — only master can see this
    if (user?.role !== 'master') {
        return (
            <div className="p-12 text-center text-rose-600 font-bold">
                ⛔ Acesso restrito — perfil Master obrigatório.
            </div>
        )
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('view_macro_financeira')
                .select('*')

            if (error) throw error
            setRecords((data || []) as CondoRow[])
        } catch (err: any) {
            console.error('[Master] Erro ao buscar macro view:', err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        setLogs(getLogs())
    }, [])

    const totals = records.reduce((acc, curr) => ({
        receitas: acc.receitas + (Number(curr.total_receitas) || 0),
        despesas: acc.despesas + (Number(curr.total_despesas) || 0),
        pendentes: acc.pendentes + (Number(curr.comprovantes_pendentes) || 0),
        suspeitos: acc.suspeitos + (Number(curr.comprovantes_suspeitos) || 0),
        condominios: acc.condominios + 1
    }), { receitas: 0, despesas: 0, pendentes: 0, suspeitos: 0, condominios: 0 })

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
                <p className="text-slate-400 font-medium">Carregando visão global...</p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-full tracking-widest">
                            Master
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Acesso Irrestrito</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900">Central de Controle</h1>
                    <p className="text-slate-500 text-sm mt-1">Visão global — todos os condomínios da plataforma</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { setLogs(getLogs()); setShowLogs(v => !v) }}
                        className={cn("px-4 py-2 text-xs font-bold rounded-xl border transition-colors",
                            showLogs ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                        )}
                    >
                        {showLogs ? 'Ocultar Logs' : '🔍 Debug Logs'}
                    </button>
                    <button onClick={fetchData} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        <RefreshCw className="h-4 w-4 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Debug Log Panel */}
            {showLogs && (
                <div className="bg-slate-900 rounded-2xl p-5 space-y-1 max-h-64 overflow-y-auto">
                    <p className="text-slate-400 text-[10px] uppercase font-black mb-3">Debug Log — Últimos {logs.length} eventos</p>
                    {logs.length === 0 && <p className="text-slate-500 text-xs">Nenhum log registrado ainda.</p>}
                    {logs.map((l, i) => (
                        <div key={i} className={cn("flex gap-3 text-xs font-mono",
                            l.level === 'error' ? 'text-rose-400' :
                            l.level === 'warn' ? 'text-amber-400' : 'text-emerald-400'
                        )}>
                            <span className="text-slate-500 shrink-0">
                                {new Date(l.ts).toLocaleTimeString('pt-BR')}
                            </span>
                            <span className="text-slate-300">[{l.level.toUpperCase()}]</span>
                            <span>{l.msg}</span>
                            {l.data && <span className="text-slate-500 truncate max-w-xs">{JSON.stringify(l.data)}</span>}
                        </div>
                    ))}
                </div>
            )}

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: 'Condomínios', value: totals.condominios, icon: Building2, color: 'blue' },
                    { label: 'Receita Total', value: fmt(totals.receitas), icon: TrendingUp, color: 'emerald' },
                    { label: 'Despesa Total', value: fmt(totals.despesas), icon: TrendingDown, color: 'rose' },
                    { label: 'NFs Pendentes', value: totals.pendentes, icon: FileText, color: 'amber' },
                    { label: 'NFs Suspeitas', value: totals.suspeitos, icon: ShieldAlert, color: 'rose' },
                ].map((kpi) => {
                    const Icon = kpi.icon
                    const colorMap: any = {
                        blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600',
                        rose: 'bg-rose-50 text-rose-600', amber: 'bg-amber-50 text-amber-600'
                    }
                    return (
                        <div key={kpi.label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", colorMap[kpi.color])}>
                                <Icon className="h-5 w-5" />
                            </div>
                            <p className="text-xs text-slate-500 font-medium">{kpi.label}</p>
                            <p className="text-xl font-black text-slate-900 mt-0.5">{kpi.value}</p>
                        </div>
                    )
                })}
            </div>

            {/* Fraud Alert Banner */}
            {totals.suspeitos > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-4">
                    <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold text-rose-900">
                            {totals.suspeitos} comprovante{totals.suspeitos > 1 ? 's' : ''} suspeito{totals.suspeitos > 1 ? 's' : ''} detectado{totals.suspeitos > 1 ? 's' : ''}
                        </p>
                        <p className="text-sm text-rose-700 mt-1">
                            Revise os itens marcados como suspeitos abaixo. Podem indicar CNPJs inválidos, CNAEs incompatíveis ou documentos duplicados.
                        </p>
                    </div>
                </div>
            )}

            {/* Condo Performance Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h2 className="font-bold text-slate-900">Performance por Condomínio</h2>
                    <span className="text-xs text-slate-400 font-medium">{records.length} unidades ativas</span>
                </div>
                {records.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">Nenhum condomínio com dados ainda</p>
                        <p className="text-sm mt-1">Os dados aparecem quando extratos e comprovantes são importados</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                    <th className="px-6 py-4">Condomínio</th>
                                    <th className="px-6 py-4 text-right">Receitas</th>
                                    <th className="px-6 py-4 text-right">Despesas</th>
                                    <th className="px-6 py-4 text-right">Saldo</th>
                                    <th className="px-6 py-4 text-center">NFs Suspeitas</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {records.map((rec) => {
                                    const saldo = (Number(rec.total_receitas) || 0) - (Number(rec.total_despesas) || 0)
                                    const hasSuspect = (Number(rec.comprovantes_suspeitos) || 0) > 0
                                    return (
                                        <tr key={rec.condominio_id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                                                        <Building2 className="h-4 w-4 text-indigo-600" />
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-900">{rec.condominio_nome}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-right font-semibold text-emerald-600">
                                                {fmt(Number(rec.total_receitas) || 0)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-right font-semibold text-rose-600">
                                                {fmt(Number(rec.total_despesas) || 0)}
                                            </td>
                                            <td className={cn("px-6 py-4 text-sm text-right font-black",
                                                saldo >= 0 ? "text-emerald-600" : "text-rose-600"
                                            )}>
                                                {fmt(saldo)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {hasSuspect ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
                                                        <ShieldAlert className="h-3 w-3" />
                                                        {rec.comprovantes_suspeitos}
                                                    </span>
                                                ) : (
                                                    <ShieldCheck className="h-4 w-4 text-emerald-500 mx-auto" />
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn("px-2 py-1 rounded-full text-[10px] font-black uppercase",
                                                    hasSuspect ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                                                )}>
                                                    {hasSuspect ? 'Revisar' : 'OK'}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
