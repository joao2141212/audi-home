import { useState } from 'react'
import { Link2, CheckCircle, AlertCircle, Zap, Shield, Clock, Unplug } from 'lucide-react'
import { cn } from '../../lib/utils'
import { PluggyConnectButton } from '../../components/PluggyConnectButton'

export function OpenFinanceConnect() {
    // Carregar estado inicial do LocalStorage para a Demo ser persistente
    const [connected, setConnected] = useState(() => {
        return localStorage.getItem('demo_connected') === 'true'
    })
    const [bankInfo, setBankInfo] = useState<{ name: string; account: string } | null>(() => {
        const saved = localStorage.getItem('demo_bankInfo')
        return saved ? JSON.parse(saved) : null
    })

    const CONDOMINIO_ID = '00000000-0000-0000-0000-000000000001'

    const handleConnectionSuccess = async (newItemId: string) => {
        setConnected(true)

        const mockBank = {
            name: 'Banco Itaú',
            account: 'Ag. 0001 • CC 12345-6'
        }
        setBankInfo(mockBank)

        // Persistência LocalStorage
        localStorage.setItem('demo_connected', 'true')
        localStorage.setItem('demo_itemId', newItemId)
        localStorage.setItem('demo_bankInfo', JSON.stringify(mockBank))
    }

    const handleDisconnect = () => {
        localStorage.removeItem('demo_connected')
        localStorage.removeItem('demo_itemId')
        localStorage.removeItem('demo_bankInfo')
        localStorage.removeItem('demo_lastSync')
        setConnected(false)
        setBankInfo(null)
    }

    const handleConnectionError = (error: any) => {
        console.error('Erro na conexão:', error)
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8 text-white">
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-10">
                    <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <defs>
                            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect width="100" height="100" fill="url(#grid)" />
                    </svg>
                </div>

                <div className="relative flex items-start gap-6">
                    <div className="flex-shrink-0 p-3 bg-white/10 backdrop-blur rounded-xl">
                        <Zap className="h-8 w-8" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-semibold mb-2 tracking-tight">Open Finance</h2>
                        <p className="text-blue-100 mb-6 max-w-xl leading-relaxed">
                            Conecte sua conta bancária e receba transações em tempo real.
                            Sem uploads manuais, sem fraudes, 100% automático.
                        </p>
                        <div className="flex flex-wrap gap-6 text-sm">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-emerald-300" />
                                <span>Sincronização automática</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-emerald-300" />
                                <span>Dados criptografados</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-emerald-300" />
                                <span>Aprovado pelo Banco Central</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Connection Status Card */}
            <div className="card">
                <div className="card-header">
                    <h3 className="text-base font-semibold text-gray-900">Status da Conexão</h3>
                </div>
                <div className="card-body">
                    {!connected ? (
                        <div className="text-center py-12">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-6">
                                <Link2 className="h-8 w-8 text-gray-400" />
                            </div>
                            <p className="text-gray-600 mb-8 max-w-sm mx-auto">
                                Nenhuma conta bancária conectada. Conecte para começar a receber transações automaticamente.
                            </p>

                            <PluggyConnectButton
                                condominioId={CONDOMINIO_ID}
                                onSuccess={handleConnectionSuccess}
                                onError={handleConnectionError}
                            />

                            {/* Sandbox Instructions */}
                            <div className="mt-10 mx-auto max-w-md p-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
                                <p className="text-sm font-medium text-amber-800 mb-3 flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    Ambiente de Teste (Sandbox)
                                </p>
                                <div className="text-xs text-amber-700 space-y-1">
                                    <p>1. Selecione <strong>"Pluggy Sandbox"</strong></p>
                                    <p>2. Login: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">user-ok</code></p>
                                    <p>3. Senha: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">password-ok</code></p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Connected Status */}
                            <div className="flex items-center justify-between p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                                        <CheckCircle className="h-6 w-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-emerald-900">Conta Conectada</p>
                                        <p className="text-sm text-emerald-700">
                                            {bankInfo ? `${bankInfo.name} • ${bankInfo.account}` : 'Conta bancária ativa'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDisconnect}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                    <Unplug className="h-4 w-4" />
                                    Desconectar
                                </button>
                            </div>

                            {/* Auto-sync Info */}
                            <div className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-blue-900">Sincronização Automática Ativa</p>
                                    <p className="text-sm text-blue-700 mt-1">
                                        Novas transações são importadas automaticamente a cada hora.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FeatureCard
                    icon={<Zap className="h-5 w-5" />}
                    iconBg="bg-blue-100"
                    iconColor="text-blue-600"
                    title="Tempo Real"
                    description="Transações aparecem assim que são processadas pelo banco"
                />
                <FeatureCard
                    icon={<Shield className="h-5 w-5" />}
                    iconBg="bg-emerald-100"
                    iconColor="text-emerald-600"
                    title="100% Seguro"
                    description="Dados criptografados e aprovados pelo Banco Central"
                />
                <FeatureCard
                    icon={<CheckCircle className="h-5 w-5" />}
                    iconBg="bg-violet-100"
                    iconColor="text-violet-600"
                    title="Zero Trabalho Manual"
                    description="Sem downloads de OFX, sem uploads, sem esquecimentos"
                />
            </div>
        </div>
    )
}

function FeatureCard({
    icon,
    iconBg,
    iconColor,
    title,
    description
}: {
    icon: React.ReactNode
    iconBg: string
    iconColor: string
    title: string
    description: string
}) {
    return (
        <div className="card p-6">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-4", iconBg, iconColor)}>
                {icon}
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
            <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
        </div>
    )
}
