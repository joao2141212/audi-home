import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Dashboard } from './features/dashboard/Dashboard'
import { StatementUpload } from './features/statements/StatementUpload'
import { ReceiptUpload } from './features/receipts/ReceiptUpload'
import { ReconciliationQueue } from './features/reconciliation/ReconciliationQueue'
import { OpenFinanceConnect } from './features/open-finance/OpenFinanceConnect'
import { ExpenseAudit } from './features/audit/ExpenseAudit'
import { TransactionHistory } from './features/statements/TransactionHistory'
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
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                            <h1 className="text-2xl font-bold text-gray-900">Auditoria Financeira</h1>
                        </div>
                    </div>
                </header>

                {/* Tabs */}
                <div className="bg-white border-b border-gray-200">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <nav className="flex space-x-8">
                            {tabs.map((tab) => {
                                const Icon = tab.icon
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            "flex items-center gap-2 px-1 py-4 border-b-2 font-medium text-sm transition-colors",
                                            activeTab === tab.id
                                                ? "border-blue-500 text-blue-600"
                                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                        {tab.label}
                                    </button>
                                )
                            })}
                        </nav>
                    </div>
                </div>

                {/* Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {activeTab === 'dashboard' && <Dashboard />}
                    {activeTab === 'open-finance' && (
                        <div>
                            <OpenFinanceConnect />
                        </div>
                    )}
                    {activeTab === 'statements' && (
                        <div className="space-y-8">
                            <div>
                                <h2 className="text-2xl font-bold mb-6">Extrato Bancário Digital</h2>
                                <TransactionHistory />
                            </div>

                            <div className="pt-8 border-t border-gray-200">
                                <h2 className="text-xl font-bold mb-4 text-gray-700">Importação Manual</h2>
                                <p className="text-sm text-gray-500 mb-6 font-medium">Use esta opção caso não possua Open Finance habilitado para este banco.</p>
                                <StatementUpload />
                            </div>
                        </div>
                    )}
                    {activeTab === 'receipts' && (
                        <div>
                            <h2 className="text-2xl font-bold mb-6">Enviar Comprovante</h2>
                            <ReceiptUpload />
                        </div>
                    )}
                    {activeTab === 'expenses' && (
                        <div>
                            <h2 className="text-2xl font-bold mb-6">Auditoria de Despesas</h2>
                            <ExpenseAudit />
                        </div>
                    )}
                    {activeTab === 'reconciliation' && (
                        <div>
                            <h2 className="text-2xl font-bold mb-6">Reconciliação Manual</h2>
                            <ReconciliationQueue />
                        </div>
                    )}
                </main>
            </div>
        </QueryClientProvider>
    )
}

export default App
