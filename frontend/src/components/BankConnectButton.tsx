import { useState } from 'react'
import { Loader2, Building2 } from 'lucide-react'

interface BankConnectButtonProps {
    onSuccess?: (itemData: any) => void
    onError?: (error: any) => void
}

export function BankConnectButton({ onSuccess }: BankConnectButtonProps) {
    const [loading, setLoading] = useState(false)

    const handleConnect = () => {
        setLoading(true)
        // Simulação
        setTimeout(() => {
            setLoading(false)
            if (onSuccess) onSuccess({ item: { id: 'mock-id' } })
            alert('Conexão Bancária Simulada com Sucesso!')
        }, 1500)
    }

    return (
        <button
            onClick={handleConnect}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {loading ? 'Conectando...' : 'Conectar Banco'}
        </button>
    )
}
