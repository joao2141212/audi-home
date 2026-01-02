import React, { useState } from 'react'
import { PluggyConnect } from 'react-pluggy-connect'
import { Building2, CheckCircle, Loader2, AlertCircle } from 'lucide-react'

interface AdminBankConnectionProps {
    condominioId: string
}

export function AdminBankConnection({ condominioId }: AdminBankConnectionProps) {
    const [connectToken, setConnectToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [isWidgetOpen, setIsWidgetOpen] = useState(false)
    const [connected, setConnected] = useState(false)
    const [accountInfo, setAccountInfo] = useState<any>(null)

    const fetchToken = async () => {
        setLoading(true)
        try {
            const response = await fetch('http://localhost:8000/api/v1/pluggy/token', {
                method: 'POST',
            })

            if (!response.ok) {
                throw new Error('Failed to fetch connect token')
            }

            const data = await response.json()
            setConnectToken(data.accessToken)
            setIsWidgetOpen(true)
        } catch (err) {
            console.error(err)
            alert('Erro ao iniciar conexão. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    const handleSuccess = async (itemData: any) => {
        console.log('Pluggy Success:', itemData)

        // Save the connection to backend
        try {
            const response = await fetch('http://localhost:8000/api/v1/pluggy/save-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: itemData.item.id,
                    condominio_id: condominioId
                })
            })

            if (!response.ok) {
                throw new Error('Failed to save connection')
            }

            const data = await response.json()
            setAccountInfo(data.account)
            setConnected(true)
            setIsWidgetOpen(false)

            alert('✅ Conta bancária conectada com sucesso!')
        } catch (err) {
            console.error(err)
            alert('Erro ao salvar conexão. Tente novamente.')
        }
    }

    const handleError = (error: any) => {
        console.error('Pluggy Error:', error)
        alert('Erro na conexão bancária.')
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
                <Building2 className="h-6 w-6 text-blue-600" />
                <h3 className="text-lg font-semibold">Conta Bancária do Condomínio</h3>
            </div>

            {!connected ? (
                <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-blue-900">
                                <p className="font-medium mb-1">Conecte a conta bancária do condomínio</p>
                                <p className="text-blue-700">
                                    Esta conexão permite que o sistema valide automaticamente os pagamentos
                                    dos moradores contra o extrato bancário real. Você só precisa fazer isso uma vez.
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={fetchToken}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                        {loading ? 'Iniciando...' : 'Conectar Conta Bancária'}
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                            <div>
                                <p className="font-medium text-green-900">Conta Conectada</p>
                                {accountInfo && (
                                    <div className="mt-2 text-sm text-green-700">
                                        <p><strong>Banco:</strong> {accountInfo.bankData?.name || 'N/A'}</p>
                                        <p><strong>Conta:</strong> {accountInfo.number || 'N/A'}</p>
                                        <p><strong>Saldo:</strong> R$ {accountInfo.balance?.toFixed(2) || '0.00'}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <p className="text-sm text-gray-600">
                        ✅ O sistema agora monitora automaticamente esta conta e valida os pagamentos dos moradores.
                    </p>
                </div>
            )}

            {isWidgetOpen && connectToken && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white p-4 rounded-xl w-full max-w-2xl h-[600px] relative">
                        <button
                            onClick={() => setIsWidgetOpen(false)}
                            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 z-10 bg-white rounded-full p-2"
                        >
                            ✕
                        </button>
                        <PluggyConnect
                            connectToken={connectToken}
                            includeSandbox={true}
                            onSuccess={handleSuccess}
                            onError={handleError}
                            onClose={() => setIsWidgetOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
