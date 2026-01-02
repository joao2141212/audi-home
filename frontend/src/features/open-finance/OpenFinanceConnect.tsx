import { useState } from 'react'
import { Link2, CheckCircle, AlertCircle, RefreshCw, Zap } from 'lucide-react'
import { cn } from '../../lib/utils'
import { PluggyConnectButton } from '../../components/PluggyConnectButton'

export function OpenFinanceConnect() {
    // Carregar estado inicial do LocalStorage para a Demo ser persistente
    const [connected, setConnected] = useState(() => {
        return localStorage.getItem('demo_connected') === 'true'
    })
    const [syncing, setSyncing] = useState(false)
    const [lastSync, setLastSync] = useState(() => {
        return localStorage.getItem('demo_lastSync')
    })
    const [itemId, setItemId] = useState(() => {
        return localStorage.getItem('demo_itemId')
    })
    const [bankInfo, setBankInfo] = useState<{ name: string; account: string } | null>(() => {
        const saved = localStorage.getItem('demo_bankInfo')
        return saved ? JSON.parse(saved) : null
    })

    // ID do condomínio (em produção viria do auth/context)
    const CONDOMINIO_ID = '00000000-0000-0000-0000-000000000001'

    const handleConnectionSuccess = async (newItemId: string) => {
        setConnected(true)
        setItemId(newItemId)

        const mockBank = {
            name: 'Pluggy Sandbox (Banco de Teste)',
            account: '12345-6 / Ag: 0001'
        }
        setBankInfo(mockBank)

        // PERSISTÊNCIA PARA A DEMO (LocalStorage)
        localStorage.setItem('demo_connected', 'true')
        localStorage.setItem('demo_itemId', newItemId)
        localStorage.setItem('demo_bankInfo', JSON.stringify(mockBank))

        try {
            const response = await fetch(`http://localhost:8000/api/v1/pluggy/sync-transactions/${CONDOMINIO_ID}`)
            if (response.ok) {
                const data = await response.json()
                if (data.status === 'success') {
                    const now = new Date().toLocaleString('pt-BR')
                    setLastSync(now)
                    localStorage.setItem('demo_lastSync', now)
                }
            }
        } catch (error) {
            console.error('Erro ao sincronizar após conexão:', error)
        }
    }

    const handleConnectionError = (error: any) => {
        console.error('Erro na conexão:', error)
    }

    const handleSync = async () => {
        setSyncing(true)

        try {
            const response = await fetch(`http://localhost:8000/api/v1/pluggy/sync-transactions/${CONDOMINIO_ID}`)

            if (!response.ok) {
                throw new Error('Sync failed')
            }

            const data = await response.json()
            setLastSync(new Date().toLocaleString('pt-BR'))

            alert(`✅ ${data.transactions_count || 0} transações sincronizadas!`)
        } catch (error) {
            console.error('Sync failed:', error)
            alert('Falha na sincronização. Tente novamente.')
        } finally {
            setSyncing(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Hero Section */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-8 text-white">
                <div className="flex items-start gap-4">
                    <Zap className="h-12 w-12 flex-shrink-0" />
                    <div>
                        <h2 className="text-2xl font-bold mb-2">Open Finance</h2>
                        <p className="text-blue-100 mb-4">
                            Conecte sua conta bancária e receba transações em tempo real.
                            Sem uploads manuais, sem fraudes, 100% automático.
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                <span>Sincronização automática</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                <span>Dados criptografados</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                <span>Aprovado pelo Banco Central</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Connection Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold mb-4">Status da Conexão</h3>

                {!connected ? (
                    <div className="text-center py-8">
                        <Link2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-600 mb-6">
                            Nenhuma conta bancária conectada
                        </p>

                        {/* Componente oficial Pluggy Connect */}
                        <PluggyConnectButton
                            condominioId={CONDOMINIO_ID}
                            onSuccess={handleConnectionSuccess}
                            onError={handleConnectionError}
                        />

                        {/* BOTÃO DE EMERGÊNCIA PARA APRESENTAÇÃO */}
                        <div className="mt-20 opacity-20 hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => handleConnectionSuccess('demo-item-id')}
                                className="text-xs text-gray-400 border border-dashed border-gray-300 px-2 py-1 rounded"
                            >
                                (Modo de Emergência: Forçar Conexão para Apresentação)
                            </button>
                        </div>

                        <p className="text-xs text-gray-500 mt-4">
                            Você será redirecionado para o site do seu banco
                        </p>

                        {/* Instruções para teste Sandbox */}
                        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left">
                            <p className="text-sm font-medium text-yellow-800 mb-2">
                                🧪 Para testar (Sandbox):
                            </p>
                            <ul className="text-xs text-yellow-700 space-y-1">
                                <li>1. Clique em "Conectar Conta Bancária"</li>
                                <li>2. Selecione "Pluggy Sandbox" ou "Banco de Teste"</li>
                                <li>3. Use: <code className="bg-yellow-100 px-1 rounded">user-ok</code> / <code className="bg-yellow-100 px-1 rounded">password-ok</code></li>
                                <li>4. MFA (se pedir): <code className="bg-yellow-100 px-1 rounded">123456</code></li>
                            </ul>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <CheckCircle className="h-6 w-6 text-green-600" />
                                <div>
                                    <p className="font-medium text-green-900">Conta Conectada</p>
                                    <p className="text-sm text-green-700">
                                        {bankInfo ? `${bankInfo.name} - ${bankInfo.account}` : 'Conta bancária conectada'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleSync}
                                disabled={syncing}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md transition",
                                    syncing ? "opacity-50 cursor-not-allowed" : "hover:bg-green-700"
                                )}
                            >
                                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                                {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                            </button>
                        </div>

                        {lastSync && (
                            <p className="text-sm text-gray-600">
                                Última sincronização: <span className="font-medium">{lastSync}</span>
                            </p>
                        )}

                        {/* Auto-sync Schedule */}
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-blue-900">Sincronização Automática Ativa</p>
                                    <p className="text-sm text-blue-700 mt-1">
                                        O sistema busca novas transações a cada 1 hora automaticamente.
                                        Você também pode sincronizar manualmente a qualquer momento.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-6 border border-gray-100">
                    <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                        <Zap className="h-6 w-6 text-blue-600" />
                    </div>
                    <h4 className="font-semibold mb-2">Tempo Real</h4>
                    <p className="text-sm text-gray-600">
                        Transações aparecem no sistema assim que são processadas pelo banco
                    </p>
                </div>

                <div className="bg-white rounded-lg p-6 border border-gray-100">
                    <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <h4 className="font-semibold mb-2">100% Seguro</h4>
                    <p className="text-sm text-gray-600">
                        Dados criptografados e aprovados pelo Banco Central do Brasil
                    </p>
                </div>

                <div className="bg-white rounded-lg p-6 border border-gray-100">
                    <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                        <RefreshCw className="h-6 w-6 text-purple-600" />
                    </div>
                    <h4 className="font-semibold mb-2">Zero Trabalho Manual</h4>
                    <p className="text-sm text-gray-600">
                        Sem downloads de OFX, sem uploads, sem esquecimentos
                    </p>
                </div>
            </div>
        </div>
    )
}
