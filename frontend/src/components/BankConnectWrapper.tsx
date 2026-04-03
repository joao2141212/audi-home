import { useState } from 'react'
import { cn } from '../lib/utils'

interface BankConnectWrapperProps {
    userId: string
    provider: 'pluggy' | 'belvo'
    onSuccess: (data: any) => void
    onError: (error: any) => void
    className?: string
    children?: React.ReactNode
}

export function BankConnectWrapper({
    onSuccess,
    className,
    children
}: BankConnectWrapperProps) {
    const [loading, setLoading] = useState(false)

    // Iniciar conexão
    const handleConnect = async () => {
        setLoading(true)
        setTimeout(() => {
            setLoading(false)
            onSuccess({ item: { id: 'mock-123' } })
            alert('Conexão Bancária Realizada com Sucesso!')
        }, 2000)
    }

    return (
        <button
            onClick={handleConnect}
            disabled={loading}
            className={cn(
                "px-6 py-3 bg-blue-600 text-white rounded-lg font-medium transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed",
                className
            )}
        >
            {loading ? 'Aguarde...' : children || 'Conectar Conta Bancária'}
        </button>
    )
}
