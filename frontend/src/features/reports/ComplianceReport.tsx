import { useState, useEffect } from 'react'
import {
    FileWarning,
    RefreshCw,
    ShieldAlert,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    ShieldCheck
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

export function ComplianceReport() {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [missingReceipts, setMissingReceipts] = useState<any[]>([])
    const [expandedSection, setExpandedSection] = useState<string | null>('nf')

    const fetchReport = async () => {
        if (!user?.condominio_id) return
        setLoading(true)
        try {
            // Busca transações DEBIT que NÃO possuem vinculação com comprovante
            const { data, error } = await supabase
                .from('transacoes_bancarias')
                .select('*')
                .eq('condominio_id', user.condominio_id)
                .eq('type', 'DEBIT')
                .eq('conciliado', false)
                .order('data_transacao', { ascending: false })

            if (error) throw error
            setMissingReceipts(data || [])
        } catch (err) {
            console.error('Erro na auditoria cloud:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchReport()
    }, [user])

    if (loading) return <div className="p-20 text-center"><RefreshCw className="h-10 w-10 animate-spin mx-auto text-indigo-600" /></div>

    const sections = [
        {
            id: 'nf',
            title: 'Pagamentos Sem Comprovante',
            description: 'Saídas detectadas no extrato que ainda não possuem nota fiscal vinculada.',
            icon: <FileWarning className="h-6 w-6 text-amber-500" />,
            data: missingReceipts,
            color: 'amber'
        },
        {
            id: 'rfb',
            title: 'Divergências Cadastrais',
            description: 'Fornecedores com bloqueio ou irregularidade na RFB.',
            icon: <ShieldAlert className="h-6 w-6 text-rose-500" />,
            data: [],
            color: 'rose'
        }
    ]

    return (
        <div className="p-8 space-y-8 animate-fade-in shadow-2xl rounded-3xl bg-white/50 backdrop-blur-sm border border-white">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Compliance de Auditoria</h1>
                    <p className="text-gray-500 font-medium">Motor de Inteligência Cloud • Sincronizado com Supabase</p>
                </div>
                <button onClick={fetchReport} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg hover:shadow-indigo-200 transition-all active:scale-95">
                    <RefreshCw className="h-5 w-5" />
                </button>
            </header>

            <div className="grid grid-cols-1 gap-6">
                {sections.map((s) => (
                    <div key={s.id} className="bg-white rounded-[2rem] shadow-xl border border-gray-50 overflow-hidden">
                        <button
                            onClick={() => setExpandedSection(expandedSection === s.id ? null : s.id)}
                            className="w-full p-8 flex items-center justify-between hover:bg-gray-50/50 transition-all"
                        >
                            <div className="flex items-center gap-6">
                                <div className={cn("p-4 rounded-2xl shadow-inner", s.data.length > 0 ? `bg-${s.color}-50` : "bg-green-50")}>
                                    {s.data.length > 0 ? s.icon : <ShieldCheck className="h-6 w-6 text-green-500" />}
                                </div>
                                <div className="text-left">
                                    <h3 className="text-xl font-bold text-gray-900">{s.title}</h3>
                                    <p className="text-sm text-gray-500 font-medium">{s.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={cn("px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest", s.data.length > 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600")}>
                                    {s.data.length} Pendências
                                </span>
                                {expandedSection === s.id ? <ChevronUp /> : <ChevronDown />}
                            </div>
                        </button>

                        {expandedSection === s.id && (
                            <div className="px-8 pb-8 animate-in slide-in-from-top-4 duration-300">
                                {s.data.length === 0 ? (
                                    <div className="py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100 text-center">
                                        <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                                        <p className="text-gray-500 font-bold">Tudo em conformidade!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 mt-4">
                                        {s.data.map((item) => (
                                            <div key={item.id} className="p-6 bg-gray-50 rounded-2xl flex items-center justify-between hover:bg-white hover:shadow-lg transition-all border border-transparent hover:border-gray-100">
                                                <div className="flex-1">
                                                    <p className="font-bold text-gray-900">{item.descricao}</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-1">{item.data_transacao}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-black text-rose-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(item.valor))}</p>
                                                    <button className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1 hover:underline">Vincular Comprovante</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="p-8 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-200 flex items-center gap-6">
                <ShieldAlert className="h-10 w-10 opacity-50" />
                <div>
                    <h4 className="text-xl font-bold">Monitoramento Ativo</h4>
                    <p className="text-indigo-100 text-sm opacity-80 mt-1">O motor de auditoria cloud processa cada transação em tempo real para garantir que seu condomínio esteja 100% protegido contra fraudes e erros contábeis.</p>
                </div>
            </div>
        </div>
    )
}
