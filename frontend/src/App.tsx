import { useState } from 'react'
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
import { FileText, Upload, GitMerge, LayoutDashboard, Zap, TrendingDown, LogOut, BarChart3, ShieldCheck, Wallet, Landmark, Loader2 } from 'lucide-react'
import { cn } from './lib/utils'
import { useAuth } from './contexts/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { MasterDashboard } from './features/dashboard/MasterDashboard'

const queryClient = new QueryClient()

type Tab = 'dashboard' | 'statements' | 'receipts' | 'reconciliation' | 'open-finance' | 'expenses'

function App() {
    const { user, logout, isAuthenticated, loading } = useAuth()
    const [activeTab, setActiveTab] = useState<string>('dashboard')

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
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
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                                    <Zap className="h-4 w-4 text-white" />
                                </div>
                                <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
                                    Audi Home
                                </h1>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-end">
                                    <span className="text-sm font-medium text-gray-900">{user?.name}</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-gray-500">
                                                {user?.role === 'master' ? 'Gestão Global' : 'Unidade Ativa'}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-600 font-bold uppercase">
                                                {user?.role}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={logout}
                                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 hover:text-red-600 rounded-lg transition-all"
                                        title="Encerrar sessão"
                                    >
                                        <LogOut className="h-4 w-4" />
                                        <span>Sair</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Navigation Tabs */}
                <nav className="bg-white border-b border-gray-200 sticky top-16 z-40">
                    <div className="max-w-7xl mx-auto px-6 lg:px-8">
                        <div className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
                            {tabs.map((tab) => {
                                const Icon = tab.icon
                                const isActive = activeTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                            isActive
                                                ? "border-blue-600 text-blue-600"
                                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {tab.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </nav>

                {/* Content */}
                <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
                    {activeTab === 'dashboard' && (
                        user?.role === 'master' ? <MasterDashboard /> : <Dashboard />
                    )}

                    {activeTab === 'budget' && <BudgetManager />}

                    {activeTab === 'revenue' && <RevenueAudit />}

                    {activeTab === 'compliance' && <ComplianceReport />}

                    {activeTab === 'reserve' && <ReserveFund />}

                    {activeTab === 'statements' && (
                        <div className="space-y-10">
                            <TransactionHistory />

                            <div className="pt-8 border-t border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900 mb-2">Importação de Extrato</h2>
                                <StatementUpload />
                            </div>
                        </div>
                    )}

                    {activeTab === 'receipts' && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-6">Enviar Comprovante Fiscal</h2>
                            <ReceiptUpload />
                        </div>
                    )}

                    {activeTab === 'expenses' && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-6">Auditoria de Despesas</h2>
                            <ExpenseAudit />
                        </div>
                    )}

                    {activeTab === 'reconciliation' && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-6">Reconciliação (Comprovante x Banco)</h2>
                            <ReconciliationQueue />
                        </div>
                    )}
                </main>
            </div>
        </QueryClientProvider>
    )
}

export default App
