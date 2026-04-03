import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

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
    login: (email: string, pass: string) => Promise<void>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)

    // On mount: restore session from Supabase GoTrue (the real auth layer)
    useEffect(() => {
        // Safety net: never show spinner for more than 5 seconds
        const timeout = setTimeout(() => {
            console.warn('[AudiCondo] Auth timeout - forçando loading=false')
            setLoading(false)
        }, 5000)

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                clearTimeout(timeout)
                console.log('[AudiCondo] Auth event:', event, !!session)
                if (session?.user) {
                    await loadProfile(session.user.id, session.user.email ?? '')
                } else {
                    setUser(null)
                }
                setLoading(false)
            }
        )
        return () => {
            clearTimeout(timeout)
            subscription.unsubscribe()
        }
    }, [])

    const loadProfile = async (userId: string, email: string) => {
        try {
            const { data: perfil, error } = await supabase
                .from('perfis')
                .select('id, nome, role, condominio_id, administradora_id')
                .eq('id', userId)
                .single()

            if (error) {
                // Profile might not exist yet (new user, trigger fires async)
                // Fall back to a default profile
                setUser({
                    id: userId,
                    email,
                    nome: email.split('@')[0],
                    role: 'sindico',
                    condominio_id: null,
                    administradora_id: null
                })
                return
            }

            setUser({
                id: userId,
                email,
                nome: perfil.nome,
                role: perfil.role,
                condominio_id: perfil.condominio_id,
                administradora_id: perfil.administradora_id
            })
        } catch {
            setUser(null)
        }
    }

    const login = async (email: string, pass: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw new Error(error.message)
        if (data.user) {
            await loadProfile(data.user.id, email)
        }
    }

    const logout = async () => {
        await supabase.auth.signOut()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) throw new Error('useAuth must be used within an AuthProvider')
    return context
}
