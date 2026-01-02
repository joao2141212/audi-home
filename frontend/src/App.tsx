import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Dashboard } from './features/dashboard/Dashboard'
import { StatementUpload } from './features/statements/StatementUpload'
import { TransactionHistory } from './features/statements/TransactionHistory'
import { ReceiptUpload } from './features/receipts/ReceiptUpload'
import { ReconciliationQueue } from './features/reconciliation/ReconciliationQueue'
import { OpenFinanceConnect } from './features/open-finance/OpenFinanceConnect'
import { ExpenseAudit } from './features/audit/ExpenseAudit'
import { FileText, Upload, GitMerge, LayoutDashboard, Zap, TrendingDown } from 'lucide-react'
import { cn } from './lib/utils'

const queryClient = new QueryClient()

type Tab = 'dashboard' | 'statements' | 'receipts' | 'reconciliation' | 'open-finance' | 'expenses'

function App() {
    const [activeTab, setActiveTab] = useState<Tab>('dashboard')

    const tabs = [
        { id: 'dashboard' as Tab, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'open-finance' as Tab, label: 'Open Finance', icon: Zap },
        { id: 'statements' as Tab, label: 'Extratos', icon: FileText },
        { id: 'receipts' as Tab, label: 'Comprovantes', icon: Upload },
        { id: 'expenses' as Tab, label: 'Despesas', icon: TrendingDown },
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
                                    Auditoria Financeira
                                </h1>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                    Condomínio Solar
                                </span>
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
                    {activeTab === 'dashboard' && <Dashboard />}

                    {activeTab === 'open-finance' && <OpenFinanceConnect />}

                    {activeTab === 'statements' && (
                        <div className="space-y-10">
                            <TransactionHistory />

                            <div className="pt-8 border-t border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900 mb-2">Importação Manual</h2>
                                <p className="text-sm text-gray-500 mb-6">
                                    Use esta opção caso não possua Open Finance habilitado para este banco.
                                </p>
                                <StatementUpload />
                            </div>
                        </div>
                    )}

                    {activeTab === 'receipts' && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-6">Enviar Comprovante</h2>
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
                            <h2 className="text-lg font-semibold text-gray-900 mb-6">Reconciliação Manual</h2>
                            <ReconciliationQueue />
                        </div>
                    )}
                </main>
            </div>
        </QueryClientProvider>
    )
}

export default App
