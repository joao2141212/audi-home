import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLogs } from '../../contexts/AuthContext'
import {
    TrendingUp, TrendingDown, Building2, ShieldAlert,
    ShieldCheck, RefreshCw, AlertTriangle, Loader2,
    Zap, Plus, X, Save, Eye, EyeOff,
    UserPlus, CheckCircle2, Crown
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────
interface CondoRow {
    condominio_id: string
    condominio_nome: string
    total_receitas: number
    total_despesas: number
    comprovantes_pendentes: number
    comprovantes_suspeitos: number
}

interface RedFlag {
    condominio_id: string | null
    condominio_nome: string
    flag_tipo: string
    severidade: 'critical' | 'warning'
    valor: number
    unidade: string
    ultimo_evento: string | null
    detalhe: string | null
}

interface ApiUsage {
    condominio_id: string
    condominio_nome: string
    uso_hoje: number
    uso_semana: number
    uso_mes: number
    pct_limite_diario: number
    ultimo_uso: string | null
}

const FLAG_CONFIG: Record<string, { emoji: string; label: string }> = {
    ALTO_VOLUME_SUSPEITOS:   { emoji: '🚨', label: 'Alto volume de suspeitos' },
    SINDICO_APROVANDO_TUDO:  { emoji: '⚠️', label: 'Aprovando 100% sem rejeitar' },
    AUTOTRANSFERENCIA_PIX:   { emoji: '🔴', label: 'Auto-transferência Pix' },
    FORNECEDOR_MULTI_CONDO:  { emoji: '🕵️', label: 'Fornecedor suspeito multi-condo' },
    CODIGO_E2E_INVALIDO:     { emoji: '❌', label: 'Pix com código E2E inválido' },
}

// ── Main Component ────────────────────────────────────────────────────────────
export function MasterDashboard() {
    const { user } = useAuth()
    const [records, setRecords] = useState<CondoRow[]>([])
    const [redFlags, setRedFlags] = useState<RedFlag[]>([])
    const [apiUsage, setApiUsage] = useState<ApiUsage[]>([])
    const [loading, setLoading] = useState(true)
    const [logs, setLogs] = useState<any[]>([])
    const [showLogs, setShowLogs] = useState(false)
    const [activeTab, setActiveTab] = useState<'overview' | 'redflags' | 'api' | 'onboarding'>('overview')

    // Onboarding form state
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [onboardForm, setOnboardForm] = useState({
        nome_condo: '', cnpj_condo: '', email_sindico: '', nome_sindico: '', senha_temp: ''
    })
    const [onboarding, setOnboarding] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [onboardMsg, setOnboardMsg] = useState('')

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [macroRes, flagsRes, apiRes] = await Promise.all([
                supabase.from('view_macro_financeira').select('*'),
                supabase.from('view_red_flags_master').select('*'),
                supabase.from('view_api_usage').select('*'),
            ])
            setRecords((macroRes.data || []) as CondoRow[])
            setRedFlags((flagsRes.data || []) as RedFlag[])
            setApiUsage((apiRes.data || []) as ApiUsage[])
        } catch (err: any) {
            console.error('[Master] fetch error:', err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (user?.role !== 'master') {
            setLoading(false)
            return
        }
        fetchData()
        setLogs(getLogs())
    }, [fetchData, user?.role])

    if (user?.role !== 'master') {
        return (
            <div className="p-12 text-center text-rose-600 font-bold">
                ⛔ Acesso restrito — perfil Master obrigatório.
            </div>
        )
    }

    const totals = records.reduce((acc, curr) => ({
        receitas:    acc.receitas + (Number(curr.total_receitas) || 0),
        despesas:    acc.despesas + (Number(curr.total_despesas) || 0),
        pendentes:   acc.pendentes + (Number(curr.comprovantes_pendentes) || 0),
        suspeitos:   acc.suspeitos + (Number(curr.comprovantes_suspeitos) || 0),
        condominios: acc.condominios + 1
    }), { receitas: 0, despesas: 0, pendentes: 0, suspeitos: 0, condominios: 0 })

    const criticalFlags = redFlags.filter(f => f.severidade === 'critical')
    const totalApiHoje  = apiUsage.reduce((s, a) => s + a.uso_hoje, 0)

    const handleOnboard = async () => {
        setOnboarding('loading')
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-condo`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`
                    },
                    body: JSON.stringify(onboardForm)
                }
            )
            const json = await res.json()
            if (!res.ok || json.error) throw new Error(json.error || 'Erro desconhecido')
            setOnboarding('success')
            setOnboardMsg(json.message)
            setOnboardForm({ nome_condo: '', cnpj_condo: '', email_sindico: '', nome_sindico: '', senha_temp: '' })
            await fetchData()
        } catch (err: any) {
            setOnboarding('error')
            setOnboardMsg(err.message)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
                <p className="text-slate-400 font-medium">Carregando visão global...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-black uppercase rounded-full tracking-widest flex items-center gap-1">
                            <Crown className="h-3 w-3" /> Master
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Acesso Irrestrito</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900">Central de Controle Anti-Fraude</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Visão global — todos os condomínios da plataforma</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowOnboarding(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                        <UserPlus className="h-3.5 w-3.5" />
                        Novo Cliente
                    </button>
                    <button onClick={() => { setLogs(getLogs()); setShowLogs(v => !v) }}
                        className={cn("px-3 py-2 text-xs font-bold rounded-xl border transition-colors",
                            showLogs ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400")}>
                        {showLogs ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={fetchData} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        <RefreshCw className="h-4 w-4 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Debug Log Panel */}
            {showLogs && (
                <div className="bg-slate-900 rounded-2xl p-5 space-y-1 max-h-52 overflow-y-auto">
                    <p className="text-slate-400 text-[10px] uppercase font-black mb-3">Debug Log — {logs.length} eventos</p>
                    {logs.length === 0 && <p className="text-slate-500 text-xs">Nenhum log.</p>}
                    {logs.map((l, i) => (
                        <div key={i} className={cn("flex gap-3 text-xs font-mono",
                            l.level === 'error' ? 'text-rose-400' : l.level === 'warn' ? 'text-amber-400' : 'text-emerald-400')}>
                            <span className="text-slate-500 shrink-0">{new Date(l.ts).toLocaleTimeString('pt-BR')}</span>
                            <span className="text-slate-300">[{l.level?.toUpperCase()}]</span>
                            <span>{l.msg}</span>
                            {l.data && <span className="text-slate-500 truncate max-w-xs">{JSON.stringify(l.data)}</span>}
                        </div>
                    ))}
                </div>
            )}

            {/* Onboarding Modal */}
            {showOnboarding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Novo Cliente</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Cria condomínio + acesso de síndico em 1 clique</p>
                            </div>
                            <button onClick={() => { setShowOnboarding(false); setOnboarding('idle') }}
                                className="p-2 hover:bg-slate-100 rounded-xl"><X className="h-5 w-5" /></button>
                        </div>

                        {onboarding === 'success' ? (
                            <div className="text-center py-6 space-y-3">
                                <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
                                <h4 className="font-black text-slate-900 text-lg">Cliente criado!</h4>
                                <p className="text-slate-500 text-sm">{onboardMsg}</p>
                                <button onClick={() => { setShowOnboarding(false); setOnboarding('idle') }}
                                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700">
                                    Fechar
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { label: 'Nome do condomínio *', key: 'nome_condo', type: 'text', span: 2 },
                                        { label: 'CNPJ (opcional)', key: 'cnpj_condo', type: 'text', span: 2 },
                                        { label: 'Nome do síndico', key: 'nome_sindico', type: 'text', span: 1 },
                                        { label: 'E-mail do síndico *', key: 'email_sindico', type: 'email', span: 1 },
                                        { label: 'Senha temporária *', key: 'senha_temp', type: 'password', span: 2 },
                                    ].map(f => (
                                        <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">{f.label}</label>
                                            <input type={f.type} value={(onboardForm as any)[f.key]}
                                                onChange={e => setOnboardForm(p => ({ ...p, [f.key]: e.target.value }))}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                        </div>
                                    ))}
                                </div>
                                {onboarding === 'error' && (
                                    <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 font-medium">
                                        ❌ {onboardMsg}
                                    </div>
                                )}
                                <div className="flex gap-3 pt-2">
                                    <button onClick={() => { setShowOnboarding(false); setOnboarding('idle') }}
                                        className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">
                                        Cancelar
                                    </button>
                                    <button onClick={handleOnboard} disabled={onboarding === 'loading'}
                                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                        {onboarding === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Criar Cliente
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Critical Alert Banner */}
            {criticalFlags.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-4">
                    <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                    <div>
                        <p className="font-black text-rose-900 text-base">
                            🚨 {criticalFlags.length} red flag{criticalFlags.length > 1 ? 's' : ''} crítico{criticalFlags.length > 1 ? 's' : ''} detectado{criticalFlags.length > 1 ? 's' : ''}
                        </p>
                        <div className="mt-2 space-y-1">
                            {criticalFlags.slice(0, 3).map((f, i) => (
                                <p key={i} className="text-sm text-rose-700">
                                    <span className="font-bold">{f.condominio_nome}</span>
                                    {' — '}{FLAG_CONFIG[f.flag_tipo]?.emoji} {FLAG_CONFIG[f.flag_tipo]?.label}
                                    {' '}({f.valor} {f.unidade})
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                    { label: 'Condomínios', value: totals.condominios, icon: Building2, color: 'text-indigo-600 bg-indigo-50' },
                    { label: 'Receita Total', value: fmt(totals.receitas), icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Despesa Total', value: fmt(totals.despesas), icon: TrendingDown, color: 'text-rose-600 bg-rose-50' },
                    { label: 'NFs Suspeitas', value: totals.suspeitos, icon: ShieldAlert, color: 'text-rose-600 bg-rose-50' },
                    { label: 'Red Flags', value: redFlags.length, icon: AlertTriangle, color: redFlags.length > 0 ? 'text-amber-600 bg-amber-50' : 'text-slate-400 bg-slate-50' },
                    { label: 'API hoje', value: `${totalApiHoje}/500`, icon: Zap, color: totalApiHoje > 400 ? 'text-rose-600 bg-rose-50' : 'text-indigo-600 bg-indigo-50' },
                ].map(kpi => {
                    const Icon = kpi.icon
                    return (
                        <div key={kpi.label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", kpi.color)}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <p className="text-[10px] text-slate-500 font-semibold uppercase">{kpi.label}</p>
                            <p className="text-lg font-black text-slate-900 mt-0.5">{kpi.value}</p>
                        </div>
                    )
                })}
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                {([
                    ['overview',    '🏢 Condomínios'],
                    ['redflags',    `🚨 Red Flags ${redFlags.length > 0 ? `(${redFlags.length})` : ''}`],
                    ['api',         '⚡ Uso de API'],
                    ['onboarding',  '➕ Novo Cliente'],
                ] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setActiveTab(id)}
                        className={cn("px-4 py-2 text-xs font-bold rounded-lg transition-colors",
                            activeTab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <h2 className="font-bold text-slate-900">Performance por Condomínio</h2>
                        <span className="text-xs text-slate-400 font-medium">{records.length} unidades ativas</span>
                    </div>
                    {records.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">Nenhum condomínio com dados ainda</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                    <th className="px-6 py-3">Condomínio</th>
                                    <th className="px-6 py-3 text-right">Receitas</th>
                                    <th className="px-6 py-3 text-right">Despesas</th>
                                    <th className="px-6 py-3 text-right">Saldo</th>
                                    <th className="px-6 py-3 text-center">Suspeitos</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {records.map(rec => {
                                    const saldo = (Number(rec.total_receitas) || 0) - (Number(rec.total_despesas) || 0)
                                    const hasSuspect = (Number(rec.comprovantes_suspeitos) || 0) > 0
                                    const condoFlags = redFlags.filter(f => f.condominio_id === rec.condominio_id)
                                    return (
                                        <tr key={rec.condominio_id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                                                        <Building2 className="h-4 w-4 text-indigo-600" />
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-bold text-slate-900">{rec.condominio_nome}</span>
                                                        {condoFlags.length > 0 && (
                                                            <div className="flex gap-1 mt-0.5">
                                                                {condoFlags.map((f, i) => (
                                                                    <span key={i} className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                                                        {FLAG_CONFIG[f.flag_tipo]?.emoji}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-right font-semibold text-emerald-600">{fmt(Number(rec.total_receitas) || 0)}</td>
                                            <td className="px-6 py-4 text-sm text-right font-semibold text-rose-600">{fmt(Number(rec.total_despesas) || 0)}</td>
                                            <td className={cn("px-6 py-4 text-sm text-right font-black", saldo >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmt(saldo)}</td>
                                            <td className="px-6 py-4 text-center">
                                                {hasSuspect ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
                                                        <ShieldAlert className="h-3 w-3" />{rec.comprovantes_suspeitos}
                                                    </span>
                                                ) : <ShieldCheck className="h-4 w-4 text-emerald-500 mx-auto" />}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn("px-2 py-1 rounded-full text-[10px] font-black uppercase",
                                                    condoFlags.some(f => f.severidade === 'critical') ? "bg-rose-100 text-rose-700" :
                                                    condoFlags.length > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                                                    {condoFlags.some(f => f.severidade === 'critical') ? '🚨 Crítico' :
                                                     condoFlags.length > 0 ? '⚠️ Alerta' : '✅ OK'}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Tab: Red Flags */}
            {activeTab === 'redflags' && (
                <div className="space-y-3">
                    {redFlags.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center">
                            <ShieldCheck className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-slate-900">Nenhum red flag detectado</h3>
                            <p className="text-slate-400 mt-2 text-sm">O sistema está monitorando todos os padrões de fraude em tempo real.</p>
                        </div>
                    ) : redFlags.map((flag, i) => (
                        <div key={i} className={cn("bg-white rounded-2xl border p-5 flex items-start gap-4",
                            flag.severidade === 'critical' ? "border-rose-200 bg-rose-50/50" : "border-amber-200 bg-amber-50/50")}>
                            <span className="text-2xl shrink-0 mt-0.5">{FLAG_CONFIG[flag.flag_tipo]?.emoji || '⚠️'}</span>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase",
                                        flag.severidade === 'critical' ? "bg-rose-200 text-rose-800" : "bg-amber-200 text-amber-800")}>
                                        {flag.severidade === 'critical' ? '🚨 Crítico' : '⚠️ Alerta'}
                                    </span>
                                    <span className="text-xs font-mono text-slate-400">{flag.flag_tipo}</span>
                                </div>
                                <p className="font-black text-slate-900 mt-1.5">{FLAG_CONFIG[flag.flag_tipo]?.label}</p>
                                <p className="text-sm text-slate-600 mt-0.5">
                                    <b>{flag.condominio_nome}</b>
                                    {flag.detalhe && <> — {flag.detalhe}</>}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {flag.valor} {flag.unidade}
                                    {flag.ultimo_evento && ` · Último evento: ${new Date(flag.ultimo_evento).toLocaleDateString('pt-BR')}`}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab: API Usage */}
            {activeTab === 'api' && (
                <div className="space-y-4">
                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
                        <Zap className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-bold text-indigo-900">Limite: 500 chamadas/dia (conta única Gemini)</p>
                            <p className="text-indigo-700 mt-0.5">
                                Hoje: <b>{totalApiHoje}</b>/500 ({Math.round(totalApiHoje/500*100)}% do limite)
                                {totalApiHoje > 400 && <span className="ml-2 text-rose-700 font-black">⚠️ atenção: perto do limite!</span>}
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                                    <th className="px-5 py-3">Condomínio</th>
                                    <th className="px-5 py-3 text-center">Hoje</th>
                                    <th className="px-5 py-3 text-center">Semana</th>
                                    <th className="px-5 py-3 text-center">Mês</th>
                                    <th className="px-5 py-3">% Limite Diário</th>
                                    <th className="px-5 py-3 text-right">Último uso</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {apiUsage.map(a => (
                                    <tr key={a.condominio_id} className="hover:bg-slate-50/50">
                                        <td className="px-5 py-3 text-sm font-semibold text-slate-900">{a.condominio_nome}</td>
                                        <td className="px-5 py-3 text-center text-sm font-black text-indigo-600">{a.uso_hoje}</td>
                                        <td className="px-5 py-3 text-center text-sm text-slate-600">{a.uso_semana}</td>
                                        <td className="px-5 py-3 text-center text-sm text-slate-600">{a.uso_mes}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={cn("h-full rounded-full transition-all",
                                                        (a.pct_limite_diario || 0) > 80 ? "bg-rose-500" :
                                                        (a.pct_limite_diario || 0) > 50 ? "bg-amber-500" : "bg-emerald-500")}
                                                        style={{ width: `${Math.min(a.pct_limite_diario || 0, 100)}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-slate-600 w-10 text-right">{a.pct_limite_diario || 0}%</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-right text-xs text-slate-400">
                                            {a.ultimo_uso ? new Date(a.ultimo_uso).toLocaleDateString('pt-BR') : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab: Onboarding (shortcut) */}
            {activeTab === 'onboarding' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-10 max-w-lg mx-auto space-y-5">
                    <div className="text-center">
                        <UserPlus className="h-12 w-12 text-indigo-500 mx-auto mb-3" />
                        <h3 className="text-xl font-black text-slate-900">Adicionar Novo Cliente</h3>
                        <p className="text-slate-400 text-sm mt-1">Cria condomínio + conta do síndico em um clique</p>
                    </div>
                    {onboarding === 'success' ? (
                        <div className="text-center space-y-3">
                            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                            <p className="font-bold text-slate-900">{onboardMsg}</p>
                            <button onClick={() => setOnboarding('idle')} className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold">
                                Adicionar outro
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {[
                                    { label: 'Nome do condomínio *', key: 'nome_condo', type: 'text' },
                                    { label: 'CNPJ (opcional)', key: 'cnpj_condo', type: 'text' },
                                    { label: 'Nome do síndico', key: 'nome_sindico', type: 'text' },
                                    { label: 'E-mail do síndico *', key: 'email_sindico', type: 'email' },
                                    { label: 'Senha temporária *', key: 'senha_temp', type: 'password' },
                                ].map(f => (
                                    <div key={f.key}>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">{f.label}</label>
                                        <input type={f.type} value={(onboardForm as any)[f.key]}
                                            onChange={e => setOnboardForm(p => ({ ...p, [f.key]: e.target.value }))}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                    </div>
                                ))}
                            </div>
                            {onboarding === 'error' && (
                                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">❌ {onboardMsg}</div>
                            )}
                            <button onClick={handleOnboard} disabled={onboarding === 'loading'}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                {onboarding === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Criar Cliente
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
