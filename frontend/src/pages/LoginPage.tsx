import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, AlertCircle, Building2, ShieldCheck, TrendingUp } from 'lucide-react'

export function LoginPage() {
    const { login, resetPassword } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        setNotice('')

        try {
            await login(email, password)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha no login. Verifique suas credenciais.')
        } finally {
            setLoading(false)
        }
    }

    const handleForgotPassword = async () => {
        setError('')
        setNotice('')

        const normalizedEmail = email.trim()
        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            setError('Informe um e-mail válido para receber o link de recuperação.')
            return
        }

        setLoading(true)
        try {
            await resetPassword(normalizedEmail)
            setNotice('Se o e-mail estiver cadastrado, enviaremos um link de recuperação.')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível solicitar a recuperação agora.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex relative overflow-hidden bg-slate-50">
            {/* Ambient Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/20 mix-blend-multiply filter blur-[100px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-400/20 mix-blend-multiply filter blur-[100px] animate-pulse animation-delay-2000"></div>
            <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] rounded-full bg-purple-400/20 mix-blend-multiply filter blur-[100px] animate-pulse animation-delay-4000"></div>

            {/* Split Screen Container */}
            <div className="flex w-full z-10">
                {/* Left Side - Presentation (Hidden on mobile) */}
                <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-16 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white relative overflow-hidden">
                    {/* SVG Pattern Overlay */}
                    <svg className="absolute inset-0 opacity-10" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>

                    <div className="relative z-10">
                        <div className="flex items-center gap-3">
                            <img
                                src="/logo-audicondo.png"
                                alt="AudiCondo"
                                className="h-14 w-auto drop-shadow-[0_4px_16px_rgba(255,255,255,0.15)]"
                            />
                        </div>
                    </div>

                    <div className="relative z-10 max-w-lg">
                        <h1 className="text-5xl font-black mb-6 leading-tight">
                            A nova era da <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">auditoria financeira</span>.
                        </h1>
                        <p className="text-lg text-slate-300 mb-12">
                            Tecnologia embarcada com IA para reconciliação automática, detecção de fraudes em tempo real e visão global do seu condomínio.
                        </p>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4 bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                                <div className="p-3 bg-blue-500/20 rounded-xl">
                                    <ShieldCheck className="h-6 w-6 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">Auditoria 100% Blindada</h3>
                                    <p className="text-sm text-slate-400">Validação instantânea na Receita Federal.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                                <div className="p-3 bg-indigo-500/20 rounded-xl">
                                    <TrendingUp className="h-6 w-6 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">Ecossistema Escalável</h3>
                                    <p className="text-sm text-slate-400">Desenvolvido para sustentar +10.000 condomínios.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 text-sm text-slate-500 font-medium tracking-wide">
                        &copy; 2026 AudiCondo. Todos os direitos reservados.
                    </div>
                </div>

                {/* Right Side - Login Form */}
                <div className="flex-1 flex flex-col justify-center items-center p-8 sm:p-16">
                    <div className="w-full max-w-md space-y-8 animate-in slide-in-from-right-8 duration-700 fade-in">
                        
                        {/* Mobile Header */}
                        <div className="lg:hidden flex flex-col items-center text-center mb-10">
                            <img
                                src="/logo-audicondo.png"
                                alt="AudiCondo"
                                className="h-20 w-auto mb-2"
                            />
                        </div>

                        <div className="text-center lg:text-left mb-8">
                            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-600 tracking-tight">
                                Bem-vindo de volta
                            </h2>
                            <p className="text-slate-500 mt-2 font-medium">Acesse o seu painel de controle seguro.</p>
                        </div>

                        <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl shadow-indigo-100/50 border border-white">
                            <form className="space-y-6" onSubmit={handleSubmit}>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-bold text-slate-700 mb-2">
                                        E-mail corporativo
                                    </label>
                                    <div className="relative group">
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="sindico@condominio.com"
                                            className="block w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label htmlFor="password" className="block text-sm font-bold text-slate-700">
                                            Senha
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleForgotPassword}
                                            disabled={loading}
                                            className="text-sm font-bold text-indigo-600 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Esqueceu a senha?
                                        </button>
                                    </div>
                                    <div className="relative group">
                                        <input
                                            id="password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="current-password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="block w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white transition-all"
                                        />
                                        <button
                                            type="button"
                                            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                            onClick={() => setShowPassword((visible) => !visible)}
                                            className="absolute inset-y-0 right-3 flex items-center px-2 text-slate-500 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-xl"
                                        >
                                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="flex items-center gap-3">
                                            <AlertCircle className="h-5 w-5 text-rose-500" />
                                            <h3 className="text-sm font-bold text-rose-800">{error}</h3>
                                        </div>
                                    </div>
                                )}

                                {notice && (
                                    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="flex items-center gap-3">
                                            <ShieldCheck className="h-5 w-5 text-emerald-500" />
                                            <h3 className="text-sm font-bold text-emerald-800">{notice}</h3>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="relative w-full flex justify-center items-center gap-2 py-4 px-8 rounded-2xl text-sm font-black text-white bg-slate-900 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-xl hover:shadow-indigo-500/20 hover:-translate-y-0.5"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                                <span>Autenticando na Nuvem...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Building2 className="h-5 w-5" />
                                                <span>Acessar Painel</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
import { Eye, EyeOff } from 'lucide-react'
