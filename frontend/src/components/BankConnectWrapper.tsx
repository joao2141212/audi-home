import { useState, useEffect, useCallback } from 'react'
import { cn } from '../lib/utils'

const API_URL = 'http://localhost:8000'
const PLUGGY_CONNECT_URL = 'https://connect.pluggy.ai'

interface BankConnectWrapperProps {
    userId: string
    provider: 'pluggy' | 'belvo'
    onSuccess: (data: any) => void
    onError: (error: any) => void
    className?: string
    children?: React.ReactNode
}

interface PluggyWidgetMessage {
    event: 'open' | 'close' | 'success' | 'error'
    itemId?: string
    error?: any
}

export function BankConnectWrapper({
    userId,
    provider,
    onSuccess,
    onError,
    className,
    children
}: BankConnectWrapperProps) {
    const [loading, setLoading] = useState(false)
    const [widgetWindow, setWidgetWindow] = useState<Window | null>(null)

    // Construir a URL do widget Pluggy com o token
    const buildPluggyWidgetUrl = (accessToken: string): string => {
        // A URL do Pluggy Connect é: https://connect.pluggy.ai?connectToken=TOKEN
        return `${PLUGGY_CONNECT_URL}?connectToken=${accessToken}`
    }

    // Handler para mensagens do widget via postMessage
    const handleWidgetMessage = useCallback((event: MessageEvent) => {
        // Verificar origem (segurança)
        if (!event.origin.includes('pluggy.ai')) return

        try {
            const data = event.data as PluggyWidgetMessage

            console.log('[Pluggy Widget] Mensagem recebida:', data)

            if (data.event === 'success' && data.itemId) {
                // Sucesso! Salvar a conexão no backend
                saveConnection(data.itemId)
            } else if (data.event === 'error') {
                onError(data.error)
            } else if (data.event === 'close') {
                setWidgetWindow(null)
            }
        } catch (e) {
            console.error('[Pluggy Widget] Erro ao processar mensagem:', e)
        }
    }, [onError])

    // Registrar listener de mensagens
    useEffect(() => {
        window.addEventListener('message', handleWidgetMessage)
        return () => window.removeEventListener('message', handleWidgetMessage)
    }, [handleWidgetMessage])

    // Salvar conexão no backend após sucesso
    const saveConnection = async (itemId: string) => {
        try {
            const response = await fetch(`${API_URL}/api/v1/pluggy/save-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: itemId,
                    condominio_id: userId  // userId aqui representa o ID do condomínio
                })
            })

            if (!response.ok) {
                throw new Error('Falha ao salvar conexão')
            }

            const result = await response.json()
            console.log('[Pluggy] Conexão salva:', result)
            onSuccess(result)
        } catch (error) {
            console.error('[Pluggy] Erro ao salvar conexão:', error)
            onError(error)
        }
    }

    // Iniciar conexão
    const handleConnect = async () => {
        setLoading(true)
        try {
            // 1. Obter token de conexão do backend
            const response = await fetch(`${API_URL}/api/v1/pluggy/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })

            if (!response.ok) throw new Error('Falha ao obter token')
            const data = await response.json()

            console.log('[Pluggy] Token obtido com sucesso')

            // 2. Abrir widget Pluggy
            if (provider === 'pluggy') {
                openPluggyWidget(data.accessToken)
            }

        } catch (error) {
            console.error('[Pluggy] Erro na conexão:', error)
            onError(error)
        } finally {
            setLoading(false)
        }
    }

    // Abrir widget em popup
    const openPluggyWidget = (accessToken: string) => {
        const widgetUrl = buildPluggyWidgetUrl(accessToken)

        const width = 500
        const height = 700
        const left = (window.screen.width - width) / 2
        const top = (window.screen.height - height) / 2

        console.log('[Pluggy] Abrindo widget:', widgetUrl.substring(0, 80) + '...')

        const popup = window.open(
            widgetUrl,
            'Pluggy Connect',
            `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        )

        if (popup) {
            setWidgetWindow(popup)

            // Poll para detectar quando a janela foi fechada
            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer)
                    setWidgetWindow(null)
                    console.log('[Pluggy] Janela fechada pelo usuário')
                }
            }, 1000)
        } else {
            onError(new Error('Popup bloqueado pelo navegador'))
        }
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
            {loading ? 'Iniciando...' : children || 'Conectar Conta Bancária'}
        </button>
    )
}
