import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { cn } from '../lib/utils'

interface PluggyConnectButtonProps {
    condominioId: string
    onSuccess?: (itemId: string) => void
    onError?: (error: any) => void
    className?: string
}

export function PluggyConnectButton({
    condominioId: _condominioId,
    onSuccess,
    className
}: PluggyConnectButtonProps) {
    const [loading, setLoading] = useState(false)
    const [connected, setConnected] = useState(false)

    const handleConnect = async () => {
        setLoading(true)
        // Simulação
        setTimeout(() => {
            setConnected(true)
            setLoading(false)
            if (onSuccess) onSuccess('mock-item-id-123')
            alert('Conta conectada (Modo Simulação)')
        }, 1500)
    }

    if (connected) {
        return (
            <div className="flex items-center gap-2 p-3 bg-green-50 text-green-800 rounded-lg animate-in fade-in">
                <CheckCircle className="h-5 w-5" />
                <span>Conta bancária conectada com sucesso!</span>
            </div>
        )
    }

    return (
        <button
            onClick={handleConnect}
            disabled={loading}
            className={cn(
                "px-6 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 w-full bg-indigo-600 text-white hover:bg-indigo-700",
                className
            )}
        >
            {loading && <Loader2 className="h-5 w-5 animate-spin" />}
            {loading ? 'Conectando...' : 'Conectar Conta Bancária'}
        </button>
    )
}
