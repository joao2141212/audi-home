import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Dashboard } from './features/dashboard/Dashboard'
import { StatementUpload } from './features/statements/StatementUpload'
import { TransactionHistory } from './features/statements/TransactionHistory'
import { ReceiptUpload } from './features/receipts/ReceiptUpload'
import { ReconciliationQueue } from './features/reconciliation/ReconciliationQueue'
import { ExpenseAudit } from './features/audit/ExpenseAudit'
import { BudgetManager } from './features/budget/BudgetManager'
import { RevenueAudit } from './features/revenue/RevenueAudit'
import { ComplianceReport } from './features/reports/ComplianceReport'
import { ReserveFund } from './features/reserve/ReserveFund'
import { Upload, GitMerge, LayoutDashboard, Zap, TrendingDown, LogOut, BarChart3, ShieldCheck, Wallet, Landmark, Loader2, Menu, Building2, Shield } from 'lucide-react'
import { cn } from './lib/utils'
import { useAuth } from './contexts/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { MasterDashboard } from './features/dashboard/MasterDashboard'
import { supabase } from './lib/supabase'
import { getLogs } from './contexts/AuthContext'

const queryClient = new QueryClient()

type Tab = 'dashboard' | 'budget' | 'statements' | 'receipts' | 'revenue' | 'expenses' | 'compliance' | 'reserve' | 'reconciliation'

export default function App() {
    const { user, logout, isAuthenticated, loading, authError } = useAuth()
    const [activeTab, setActiveTab] = useState<Tab>('dashboard')
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [condominioNome, setCondominioNome] = useState<string | null>(null)

    useEffect(() => {
        if (user?.condominio_id) {
            supabase
                .from('condominios')
                .select('nome')
                .eq('id', user.condominio_id)
                .single()
                .then(({ data }) => setCondominioNome(data?.nome || null))
        }
    }, [user?.condominio_id])

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
                <p className="text-sm text-slate-400 font-medium">Verificando autenticação...</p>
            </div>
        )
    }

    if (authError) {
        const logs = getLogs().slice(0, 8)
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
                <div className="max-w-xl w-full bg-white rounded-2xl border border-rose-200 shadow-lg p-8 space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-100 rounded-xl">
                            <Shield className="h-6 w-6 text-rose-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900">Erro de Autenticação</h2>
                            <p className="text-sm text-rose-600">{authError}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono space-y-1 max-h-48 overflow-y-auto">
                        <p className="text-slate-400 text-[10px] uppercase font-bold mb-2">Debug Log (últimos eventos)</p>
                        {logs.map((l, i) => (
                            <div key={i} className={`flex gap-2 ${l.level === 'error' ? 'text-rose-400' : l.level === 'warn' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                <span className="text-slate-500 shrink-0">{new Date(l.ts).toLocaleTimeString('pt-BR')}</span>
                                <span>{l.msg}</span>
                                {l.data && <span className="text-slate-500 truncate">{JSON.stringify(l.data)}</span>}
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                    >
                        Recarregar página
                    </button>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return <LoginPage />
    }

    const tabs = [
        { id: 'dashboard' as Tab, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'budget' as Tab, label: 'Orçamento', icon: BarChart3 },
        { id: 'statements' as Tab, label: 'Extratos', icon: Landmark },
        { id: 'receipts' as Tab, label: 'Upload Comprovantes', icon: Upload },
        { id: 'revenue' as Tab, label: 'Receitas', icon: Zap },
        { id: 'expenses' as Tab, label: 'Despesas', icon: TrendingDown },
        { id: 'compliance' as Tab, label: 'Compliance', icon: ShieldCheck },
        { id: 'reserve' as Tab, label: 'Reserva', icon: Wallet },
        { id: 'reconciliation' as Tab, label: 'Reconciliação', icon: GitMerge },
    ]

    return (
        <QueryClientProvider client={queryClient}>
            <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
                {/* Mobile sidebar overlay */}
                {isSidebarOpen && (
                    <div 
                        className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" 
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                {/* Sidebar Navigation */}
                <nav className={cn(
                    "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl lg:shadow-none",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}>
                    {/* Brand */}
                    <div className="h-20 flex items-center px-6 border-b border-slate-100">
                        <img
                            src="/logo-audicondo.png"
                            alt="AudiCondo"
                            className="h-12 w-auto"
                        />
                    </div>

                    {/* Condo Identity Banner */}
                    {user?.role === 'master' ? (
                        <div className="mx-4 mb-2 mt-2 p-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <Shield className="h-4 w-4 text-indigo-200" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Acesso Master</span>
                            </div>
                            <p className="text-sm font-bold">Visão Global</p>
                            <p className="text-[11px] text-indigo-200 mt-0.5">Todos os condomínios</p>
                        </div>
                    ) : condominioNome ? (
                        <div className="mx-4 mb-2 mt-2 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seu Condomínio</span>
                            </div>
                            <p className="text-sm font-bold text-slate-900 leading-snug">{condominioNome}</p>
                            <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase">Síndico • Ativo</span>
                        </div>
                    ) : null}

                    {/* Nav Links */}
                    <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1 custom-scrollbar">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-4">Menu Principal</div>
                        {tabs.map((tab) => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id)
                                        setIsSidebarOpen(false)
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-2xl transition-all duration-200 group",
                                        isActive
                                            ? "bg-indigo-50 text-indigo-700"
                                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    <Icon className={cn(
                                        "h-5 w-5 transition-colors duration-200",
                                        isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                                    )} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* User Profile / Logout */}
                    <div className="p-4 border-t border-slate-100">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center border-2 border-white shadow-sm">
                                    <span className="text-sm font-bold text-indigo-700">
                                        {user?.nome?.substring(0,2).toUpperCase() || 'AD'}
                                    </span>
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-sm font-bold text-slate-900 truncate">
                                        {user?.nome || 'Usuário'}
                                    </span>
                                    <span className="text-xs font-medium text-slate-500 truncate">
                                        {user?.role === 'master' ? 'Gestão Global' : 'Síndico'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                Desconectar
                            </button>
                        </div>
                    </div>
                </nav>

                {/* Main Content Area */}
                <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50/50">
                    {/* Mobile Header (Only visible on small screens) */}
                    <div className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-30">
                        <div className="flex items-center gap-2">
                            <img src="/logo-audicondo.png" alt="AudiCondo" className="h-8 w-auto" />
                        </div>
                        <button 
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                    </div>

                    {/* Scrollable Content View */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:px-12 scroll-smooth">
                        <div className="max-w-6xl mx-auto space-y-8">
                            {/* Use CSS visibility instead of conditional rendering to prevent remounting */}
                            <div className={activeTab === 'dashboard' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                {user?.role === 'master' ? <MasterDashboard /> : <Dashboard />}
                            </div>
                            <div className={activeTab === 'budget' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <BudgetManager />
                            </div>
                            <div className={activeTab === 'revenue' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <RevenueAudit />
                            </div>
                            <div className={activeTab === 'compliance' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <ComplianceReport />
                            </div>
                            <div className={activeTab === 'reserve' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <ReserveFund />
                            </div>
                            <div className={activeTab === 'statements' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <div className="space-y-10">
                                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
                                        <div>
                                            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Histórico de Transações</h2>
                                            <p className="text-slate-500 mt-1">Acompanhe e filtre os lançamentos bancários.</p>
                                        </div>
                                        <TransactionHistory />
                                    </div>
                                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
                                        <div>
                                            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Importação de Extrato</h2>
                                            <p className="text-slate-500 mt-1">Faça upload de arquivos OFX ou remessas.</p>
                                        </div>
                                        <StatementUpload />
                                    </div>
                                </div>
                            </div>
                            <div className={activeTab === 'receipts' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Auditoria Fiscal Inteligente</h2>
                                        <p className="text-slate-500 mt-1">Faça upload de Notas Fiscais para validação contra RFB.</p>
                                    </div>
                                    <ReceiptUpload />
                                </div>
                            </div>
                            <div className={activeTab === 'expenses' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                                    <div className="mb-6">
                                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Auditoria de Despesas</h2>
                                        <p className="text-slate-500 mt-1">Gestão inteligente de conformidade de saídas.</p>
                                    </div>
                                    <ExpenseAudit />
                                </div>
                            </div>
                            <div className={activeTab === 'reconciliation' ? 'block animate-in fade-in duration-300' : 'hidden'}>
                                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                                    <div className="mb-6">
                                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Central de Reconciliação</h2>
                                        <p className="text-slate-500 mt-1">Vincule os extratos processados às despesas auditadas.</p>
                                    </div>
                                    <ReconciliationQueue />
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </QueryClientProvider>
    )
}

