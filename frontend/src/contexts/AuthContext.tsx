import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

// ─── Persistent error log (survives page state, visible to dev) ──────────────
const LOG_KEY = 'audicondo_debug_log'
const MAX_LOGS = 50

export function appendLog(level: 'info' | 'warn' | 'error', msg: string, data?: any) {
    try {
        const existing: any[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
        existing.unshift({ ts: new Date().toISOString(), level, msg, data: data ?? null })
        localStorage.setItem(LOG_KEY, JSON.stringify(existing.slice(0, MAX_LOGS)))
    } catch { /* ignore storage errors */ }
    if (level === 'error') console.error(`[AudiCondo] ${msg}`, data)
    else if (level === 'warn') console.warn(`[AudiCondo] ${msg}`, data)
    else console.log(`[AudiCondo] ${msg}`, data)
}

export function getLogs(): any[] {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] }
}

// ─── Auth types ───────────────────────────────────────────────────────────────
interface UserProfile {
    id: string
    email: string
    nome: string | null
    role: 'master' | 'gestor' | 'sindico'
    condominio_id: string | null
    administradora_id: string | null
}

interface AuthContextType {
    user: UserProfile | null
    isAuthenticated: boolean
    loading: boolean
    authError: string | null
    login: (email: string, pass: string) => Promise<void>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function getFriendlyAuthError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)

    if (message === 'Failed to fetch' || message.includes('fetch failed') || message.includes('NetworkError')) {
        return 'Nao foi possivel conectar ao Supabase agora. Verifique internet, DNS ou se o projeto remoto esta ativo.'
    }

    return message
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [authError, setAuthError] = useState<string | null>(null)
    const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Guarantee loading never stays true more than 8s no matter what
    const startLoadingGuard = () => {
        if (loadingTimer.current) clearTimeout(loadingTimer.current)
        loadingTimer.current = setTimeout(() => {
            appendLog('error', 'Auth loading timeout (8s). Forçando loading=false.', { url: window.location.href })
            setAuthError('Timeout de autenticação — tente atualizar a página.')
            setLoading(false)
        }, 8000)
    }

    const stopLoadingGuard = () => {
        if (loadingTimer.current) {
            clearTimeout(loadingTimer.current)
            loadingTimer.current = null
        }
    }

    const loadProfile = async (userId: string, email: string): Promise<void> => {
        // Wrap the whole profile fetch in a race against a 5s timeout
        const fetchProfile = supabase
            .from('perfis')
            .select('id, nome, role, condominio_id, administradora_id')
            .eq('id', userId)
            .single()

        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('perfis query timeout (5s)')), 5000)
        )

        try {
            const { data: perfil, error } = await Promise.race([fetchProfile, timeout]) as any

            if (error) {
                appendLog('warn', 'perfis query error — usando perfil padrão', { error: error.message, userId })
                setUser({ id: userId, email, nome: email.split('@')[0], role: 'sindico', condominio_id: null, administradora_id: null })
                return
            }

            appendLog('info', 'Perfil carregado', { role: perfil.role, condominio_id: perfil.condominio_id })
            setUser({ id: userId, email, nome: perfil.nome, role: perfil.role, condominio_id: perfil.condominio_id, administradora_id: perfil.administradora_id })
        } catch (err: any) {
            appendLog('error', 'loadProfile falhou', { message: err.message, userId })
            // Fall back to minimal profile so user isn't stuck
            setUser({ id: userId, email, nome: email.split('@')[0], role: 'sindico', condominio_id: null, administradora_id: null })
        }
    }

    useEffect(() => {
        startLoadingGuard()
        appendLog('info', 'AuthProvider montado — iniciando verificação de sessão')

        // 1. Check for existing session immediately (faster than waiting for onAuthStateChange)
        supabase.auth.getSession().then(async ({ data: { session }, error }) => {
            if (error) {
                appendLog('error', 'getSession error', { message: error.message })
            }
            if (session?.user) {
                appendLog('info', 'Sessão existente encontrada via getSession', { event: 'getSession' })
                await loadProfile(session.user.id, session.user.email ?? '')
            } else {
                appendLog('info', 'Nenhuma sessão existente')
                setUser(null)
            }
            stopLoadingGuard()
            setLoading(false)
        }).catch(err => {
            appendLog('error', 'getSession threw', { message: err.message })
            stopLoadingGuard()
            setLoading(false)
        })

        // 2. Listen for future auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                appendLog('info', `Auth event: ${event}`, { hasSession: !!session })

                // Only handle events that change user state — ignore INITIAL_SESSION (handled above)
                if (event === 'INITIAL_SESSION') return

                try {
                    if (session?.user) {
                        await loadProfile(session.user.id, session.user.email ?? '')
                    } else {
                        appendLog('info', 'Sessão encerrada', { event })
                        setUser(null)
                    }
                } catch (err: any) {
                    appendLog('error', `onAuthStateChange handler threw on event ${event}`, { message: err.message })
                } finally {
                    // Only update loading for SIGNED_IN (initial login)
                    if (event === 'SIGNED_IN') setLoading(false)
                }
            }
        )

        return () => {
            stopLoadingGuard()
            subscription.unsubscribe()
        }
    }, [])

    const login = async (email: string, pass: string) => {
        appendLog('info', 'Login tentativa', { email })
        setAuthError(null)
        let data
        try {
            const result = await supabase.auth.signInWithPassword({ email, password: pass })
            data = result.data
            if (result.error) {
                appendLog('error', 'Login falhou', { message: result.error.message })
                throw new Error(getFriendlyAuthError(result.error))
            }
        } catch (err) {
            const friendly = getFriendlyAuthError(err)
            appendLog('error', 'Login falhou', { message: friendly })
            throw new Error(friendly)
        }
        if (data.user) {
            appendLog('info', 'Login OK', { userId: data.user.id })
            await loadProfile(data.user.id, email)
        }
    }

    const logout = async () => {
        appendLog('info', 'Logout')
        await supabase.auth.signOut()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, authError, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) throw new Error('useAuth must be used within an AuthProvider')
    return context
}
