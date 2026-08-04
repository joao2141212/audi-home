import { useState, useEffect } from 'react'
import {
    FileWarning,
    RefreshCw,
    ShieldAlert,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    ShieldCheck,
    Search
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

export function ComplianceReport() {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [missingReceipts, setMissingReceipts] = useState<any[]>([])
    const [receipts, setReceipts] = useState<any[]>([])
    const [expandedSection, setExpandedSection] = useState<string | null>('nf')
    const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null)
    const [selectedReceiptId, setSelectedReceiptId] = useState('')
    const [receiptSearch, setReceiptSearch] = useState('')
    const [linking, setLinking] = useState(false)
    const [linkError, setLinkError] = useState<string | null>(null)

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

            const { data: receiptData, error: receiptError } = await supabase
                .from('comprovantes')
                .select('id, arquivo_nome, valor, status_auditoria')
                .eq('condominio_id', user.condominio_id)
                .order('created_at', { ascending: false })

            if (receiptError) throw receiptError
            setReceipts(receiptData || [])
        } catch (err) {
            console.error('Erro na auditoria cloud:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchReport()
    }, [user])

    const handleLinkReceipt = async () => {
        if (!selectedTransaction || !selectedReceiptId) {
            setLinkError('Selecione um comprovante para vincular.')
            return
        }

        setLinking(true)
        setLinkError(null)
        try {
            await api.approveReconciliation(selectedReceiptId, selectedTransaction.id)
            setSelectedTransaction(null)
            setSelectedReceiptId('')
            setReceiptSearch('')
            await fetchReport()
        } catch (err) {
            console.error(JSON.stringify({ fn: 'ComplianceReport.handleLinkReceipt', status: 'error', error: err }))
            setLinkError('Não foi possível vincular o comprovante.')
        } finally {
            setLinking(false)
        }
    }

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
                                                    <button
                                                    onClick={() => { setSelectedTransaction(item); setSelectedReceiptId(receipts[0]?.id || ''); setLinkError(null) }}
                                                        className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1 hover:underline"
                                                    >
                                                        Vincular Comprovante
                                                    </button>
                                                    {selectedTransaction?.id === item.id && (
                                                        <div className="mt-3 flex flex-col gap-2 text-left">
                                                            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                                                                <label htmlFor="receipt-search" className="sr-only">Buscar comprovante</label>
                                                                <div className="relative">
                                                                    <input
                                                                        id="receipt-search"
                                                                        type="search"
                                                                        value={receiptSearch}
                                                                        onChange={event => setReceiptSearch(event.target.value)}
                                                                        placeholder="Buscar por nome ou valor..."
                                                                        aria-label="Buscar comprovante por nome ou valor"
                                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-9 text-xs outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                                                    />
                                                                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                                                </div>
                                                                <div role="listbox" aria-label="Comprovantes encontrados" className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                                                                    {receipts
                                                                        .filter(receipt => {
                                                                            const query = receiptSearch.trim().toLowerCase()
                                                                            if (!query) return true
                                                                            return `${receipt.arquivo_nome || ''} ${receipt.valor || ''} ${receipt.id || ''}`.toLowerCase().includes(query)
                                                                        })
                                                                        .map(receipt => {
                                                                            const selected = selectedReceiptId === receipt.id
                                                                            return (
                                                                                <button
                                                                                    key={receipt.id}
                                                                                    type="button"
                                                                                    role="option"
                                                                                    aria-selected={selected}
                                                                                    onClick={() => setSelectedReceiptId(receipt.id)}
                                                                                    className={cn(
                                                                                        "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                                                                                        selected ? "border-indigo-300 bg-indigo-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                                                                                    )}
                                                                                >
                                                                                    <span className="block break-words text-xs font-bold text-slate-800">{receipt.arquivo_nome || 'Comprovante sem nome'}</span>
                                                                                    <span className="mt-0.5 block text-[11px] text-slate-500">R$ {Number(receipt.valor || 0).toFixed(2)}</span>
                                                                                </button>
                                                                            )
                                                                        })}
                                                                    {receipts.filter(receipt => {
                                                                        const query = receiptSearch.trim().toLowerCase()
                                                                        if (!query) return true
                                                                        return `${receipt.arquivo_nome || ''} ${receipt.valor || ''} ${receipt.id || ''}`.toLowerCase().includes(query)
                                                                    }).length === 0 && (
                                                                        <p className="px-3 py-5 text-center text-xs font-semibold text-slate-500">Nenhum comprovante encontrado.</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button className="btn btn-primary text-xs" disabled={linking} onClick={handleLinkReceipt}>
                                                                {linking ? 'Vinculando...' : 'Confirmar vínculo'}
                                                            </button>
                                                            {linkError && <span role="alert" className="text-xs text-rose-600">{linkError}</span>}
                                                        </div>
                                                    )}
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
