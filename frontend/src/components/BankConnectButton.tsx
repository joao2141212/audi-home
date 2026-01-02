import React, { useState, useEffect } from 'react'
import { PluggyConnect } from 'react-pluggy-connect'
import { Loader2 } from 'lucide-react'

interface BankConnectButtonProps {
    onSuccess?: (itemData: any) => void
    onError?: (error: any) => void
}

export function BankConnectButton({ onSuccess, onError }: BankConnectButtonProps) {
    const [connectToken, setConnectToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [isWidgetOpen, setIsWidgetOpen] = useState(false)

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
            if (onError) onError(err)
        } finally {
            setLoading(false)
        }
    }

    const handleSuccess = (itemData: any) => {
        console.log('Pluggy Success:', itemData)
        // Here you would typically send the itemData.item.id to your backend
        // to associate it with the user
        if (onSuccess) onSuccess(itemData)
        setIsWidgetOpen(false)
    }

    const handleError = (error: any) => {
        console.error('Pluggy Error:', error)
        if (onError) onError(error)
    }

    return (
        <>
            <button
                onClick={fetchToken}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? 'Iniciando...' : 'Conectar Conta Bancária'}
            </button>

            {isWidgetOpen && connectToken && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white p-4 rounded-xl w-full max-w-2xl h-[600px] relative">
                        <button
                            onClick={() => setIsWidgetOpen(false)}
                            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 z-10"
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
        </>
    )
}
