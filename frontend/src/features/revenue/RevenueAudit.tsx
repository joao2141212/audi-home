import { useState, useEffect } from 'react'
import {
    TrendingUp,
    TrendingDown,
    AlertCircle,
    Upload, Paperclip, Link2, X, Eye,
    CheckCircle,
    Search,
    Plus,
    RefreshCw
} from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

interface Boleto {
    id: string
    pagador: string
    valor: number
    vencimento: string
    status: 'aberto' | 'pago' | 'atrasado'
    data_pagamento?: string
    beneficiario?: string | null
    linha_digitavel?: string | null
    arquivo_url?: string | null
    arquivo_nome?: string | null
    arquivo_tipo?: string | null
    transacao_id?: string | null
}

const MAX_BOLETO_FILE_SIZE = 10 * 1024 * 1024
const BOLETO_FILE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']

function createInitialBoletoForm() {
    return {
        pagador: '',
        beneficiario: '',
        valor: '',
        vencimento: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        linha_digitavel: '',
        transacao_id: '',
    }
}

function formatDateOnly(value: string) {
    const [year, month, day] = value.slice(0, 10).split('-')
    return year && month && day
        ? `${day}/${month}/${year}`
        : new Date(value).toLocaleDateString('pt-BR')
}

export function RevenueAudit() {
    const { user } = useAuth()
    const [boletos, setBoletos] = useState<Boleto[]>([])
    const [transactions, setTransactions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'todos' | 'aberto' | 'pago' | 'atrasado'>('todos')
    const [taxaServico] = useState<number>(3.5) // Ex: 3.5%
    const [isAntecipado] = useState(true)
    const [showBoletoForm, setShowBoletoForm] = useState(false)
    const [savingBoleto, setSavingBoleto] = useState(false)
    const [boletoError, setBoletoError] = useState<string | null>(null)
    const [boletoFile, setBoletoFile] = useState<File | null>(null)
    const [boletoForm, setBoletoForm] = useState(createInitialBoletoForm)
    const [search, setSearch] = useState('')
    const [openingBoletoId, setOpeningBoletoId] = useState<string | null>(null)
    const [linkingBoletoId, setLinkingBoletoId] = useState<string | null>(null)
    const [boletoPreviewError, setBoletoPreviewError] = useState<string | null>(null)

    const fetchData = async () => {
        if (!user?.condominio_id) {
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            const bData = await api.getBoletos(user.condominio_id)
            const tData = await api.getTransactions(user.condominio_id)

            // Lógica de "atrasado"
            const now = new Date()
            const processedBoletos = (bData || []).map((b: any) => {
                const vencimento = b.vencimento || b.data_transacao
                const venc = new Date(vencimento)
                let status = b.status || (b.conciliado ? 'pago' : 'aberto')
                if (status === 'aberto' && venc < now) {
                    status = 'atrasado'
                }
                return {
                    id: b.id,
                    pagador: b.pagador || b.descricao || 'Recebimento',
                    valor: Number(b.valor) || 0,
                    vencimento,
                    status: status as 'aberto' | 'pago' | 'atrasado',
                    data_pagamento: b.data_pagamento,
                    beneficiario: b.beneficiario,
                    linha_digitavel: b.linha_digitavel,
                    arquivo_url: b.arquivo_url,
                    arquivo_nome: b.arquivo_nome,
                    arquivo_tipo: b.arquivo_tipo,
                    transacao_id: b.transacao_id,
                }
            })

            setBoletos(processedBoletos)
            setTransactions((tData || []).filter((t: any) => t.type === 'CREDIT'))
        } catch (err) {
            console.error('Erro ao buscar receitas:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleBoletoFile = (file: File | undefined) => {
        if (!file) return
        const extension = file.name.split('.').pop()?.toLowerCase() || ''
        if (!BOLETO_FILE_EXTENSIONS.includes(extension)) {
            setBoletoError('Anexe o boleto em PDF, JPG ou PNG.')
            setBoletoFile(null)
            return
        }
        if (file.size > MAX_BOLETO_FILE_SIZE) {
            setBoletoError('O boleto deve ter no máximo 10 MB.')
            setBoletoFile(null)
            return
        }
        setBoletoError(null)
        setBoletoFile(file)
    }

    const resetBoletoForm = () => {
        setBoletoForm(createInitialBoletoForm())
        setBoletoFile(null)
        setBoletoError(null)
    }

    const handleSaveBoleto = async () => {
        if (!user?.condominio_id) return
        const valor = Number(boletoForm.valor)
        if (!boletoFile || !boletoForm.pagador.trim() || !Number.isFinite(valor) || valor <= 0 || !boletoForm.vencimento) {
            setBoletoError('Anexe o boleto e preencha pagador, valor maior que zero e vencimento.')
            return
        }

        setSavingBoleto(true)
        setBoletoError(null)
        let storagePath: string | null = null
        try {
            const safeName = boletoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
            storagePath = `${user.condominio_id}/boletos/${crypto.randomUUID()}_${safeName}`
            await api.uploadBoletoFile(storagePath, boletoFile)

            const selectedTransaction = transactions.find(t => String(t.id) === boletoForm.transacao_id)
            await api.saveBoleto({
                condominio_id: user.condominio_id,
                pagador: boletoForm.pagador.trim(),
                valor,
                vencimento: boletoForm.vencimento,
                beneficiario: boletoForm.beneficiario.trim() || null,
                linha_digitavel: boletoForm.linha_digitavel.trim() || null,
                arquivo_url: storagePath,
                arquivo_nome: boletoFile.name,
                arquivo_tipo: boletoFile.type || `application/${boletoFile.name.split('.').pop()}`,
                transacao_id: selectedTransaction?.id ? String(selectedTransaction.id) : null,
                data_pagamento: selectedTransaction?.data_transacao?.slice(0, 10) || null,
                status: selectedTransaction ? 'pago' : 'aberto',
            })
            resetBoletoForm()
            setShowBoletoForm(false)
            await fetchData()
    } catch (err) {
        if (storagePath) {
            try {
                await api.removeBoletoFile(storagePath)
            } catch (cleanupError) {
                console.error(JSON.stringify({ fn: 'RevenueAudit.handleSaveBoleto.cleanup', status: 'error', error_class: cleanupError instanceof Error ? cleanupError.name : 'unknown' }))
            }
        }
        console.error(JSON.stringify({ fn: 'RevenueAudit.handleSaveBoleto', status: 'error', error_class: err instanceof Error ? err.name : 'unknown' }))
        setBoletoError('Não foi possível salvar o boleto. Tente novamente.')
        } finally {
        setSavingBoleto(false)
    }

    const handleOpenBoleto = async (boleto: Boleto) => {
        if (!boleto.arquivo_url) return

        setOpeningBoletoId(boleto.id)
        setBoletoPreviewError(null)
        try {
            const url = boleto.arquivo_url.startsWith('http')
                ? boleto.arquivo_url
                : await api.getBoletoFileUrl(boleto.arquivo_url)
            window.open(url, '_blank', 'noopener,noreferrer')
        } catch (err) {
            console.error(JSON.stringify({ fn: 'RevenueAudit.handleOpenBoleto', status: 'error', boleto_id: boleto.id, error_class: err instanceof Error ? err.name : 'unknown' }))
            setBoletoPreviewError('Não foi possível abrir este boleto agora.')
        } finally {
            setOpeningBoletoId(null)
        }
    }

    const handleLinkBoleto = async (boleto: Boleto, transactionId: string) => {
        if (!user?.condominio_id || !transactionId) return
        const transaction = transactionsById.get(transactionId)
        if (!transaction) return

        setLinkingBoletoId(boleto.id)
        setBoletoPreviewError(null)
        try {
            await api.linkBoletoTransaction(
                boleto.id,
                user.condominio_id,
                transactionId,
                transaction.data_transacao?.slice(0, 10) || null,
            )
            await fetchData()
        } catch (err) {
            console.error(JSON.stringify({ fn: 'RevenueAudit.handleLinkBoleto', status: 'error', boleto_id: boleto.id, transaction_id: transactionId, error_class: err instanceof Error ? err.name : 'unknown' }))
            setBoletoPreviewError('Não foi possível vincular o crédito a este boleto.')
        } finally {
            setLinkingBoletoId(null)
        }
    }
    }

    const filteredBoletos = boletos.filter(b => {
        const matchesFilter = filter === 'todos' || b.status === filter
        const query = search.trim().toLowerCase()
        const matchesSearch = !query || [b.pagador, b.beneficiario, b.arquivo_nome, b.linha_digitavel]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(query))
        return matchesFilter && matchesSearch
    })

    const transactionsById = new Map(transactions.map(transaction => [String(transaction.id), transaction]))

    const totalRevenue = boletos.filter(b => b.status === 'pago').reduce((sum, b) => sum + b.valor, 0)
    const totalPending = boletos.filter(b => b.status !== 'pago').reduce((sum, b) => sum + b.valor, 0)
    const inadimplencia = boletos.length > 0 ? (boletos.filter(b => b.status === 'atrasado').length / boletos.length) * 100 : 0

    // Cálculos de Antecipação
    const totalBruto = boletos.reduce((sum, b) => sum + b.valor, 0)
    const valorTaxa = (totalBruto * taxaServico) / 100
    const valorLiquidoEsperado = totalBruto - valorTaxa
    const valorLiquidoReal = transactions.reduce((sum, t) => sum + t.valor, 0)
    const divergenciaReceita = Math.abs(valorLiquidoEsperado - valorLiquidoReal)

    if (loading) return <div className="p-8 text-center text-gray-500">Analizando créditos e boletos...</div>

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:items-center md:flex-row justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Auditoria de Receitas</h2>
                    <p className="text-gray-500">Conferência de créditos bancários vs Boletos emitidos</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn btn-secondary flex items-center gap-2" onClick={fetchData}>
                        <RefreshCw className="h-4 w-4" />
                        Atualizar
                    </button>
                    <button className="btn btn-primary flex items-center gap-2" onClick={() => { setBoletoError(null); setShowBoletoForm(true) }}>
                        <Plus className="h-4 w-4" />
                        Importar boleto
                    </button>
                </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <p>
                    <strong>Como funciona:</strong> anexe o boleto emitido aqui. Quando o pagamento aparecer no extrato/OFX,
                    selecione o crédito correspondente para criar a conciliação. O arquivo fica no Storage; o OFX continua sendo
                    apenas o lançamento bancário.
                </p>
            </div>

            {showBoletoForm && (
                <div role="dialog" aria-modal="true" aria-labelledby="boleto-form-title" className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-start justify-between mb-5">
                        <div>
                            <h3 id="boleto-form-title" className="font-bold text-gray-900">Importar boleto para conciliação</h3>
                            <p className="mt-1 text-sm text-gray-500">O boleto é a evidência da cobrança; o crédito do extrato confirma o pagamento.</p>
                        </div>
                        <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" onClick={() => { resetBoletoForm(); setShowBoletoForm(false) }} aria-label="Fechar formulário">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <label className="block text-sm font-semibold text-gray-700">
                        Arquivo do boleto <span className="text-rose-500">*</span>
                        <div className="mt-1 flex items-center gap-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-4">
                            <Upload className="h-6 w-6 shrink-0 text-blue-600" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-800">
                                    {boletoFile ? boletoFile.name : 'Selecione o PDF ou a foto do boleto'}
                                </p>
                                <p className="mt-0.5 text-xs font-normal text-gray-500">PDF, JPG ou PNG até 10 MB</p>
                            </div>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                onChange={event => handleBoletoFile(event.target.files?.[0])}
                                className="max-w-[190px] text-xs font-normal text-gray-600"
                            />
                            {boletoFile && (
                                <button type="button" onClick={() => setBoletoFile(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-gray-700" aria-label="Remover arquivo">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </label>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="text-sm font-semibold text-gray-700">
                            Pagador <span className="text-rose-500">*</span>
                            <input className="input mt-1 w-full" value={boletoForm.pagador} onChange={e => setBoletoForm(prev => ({ ...prev, pagador: e.target.value }))} placeholder="Nome ou unidade" />
                        </label>
                        <label className="text-sm font-semibold text-gray-700">
                            Beneficiário / emissor
                            <input className="input mt-1 w-full" value={boletoForm.beneficiario} onChange={e => setBoletoForm(prev => ({ ...prev, beneficiario: e.target.value }))} placeholder="Empresa ou condomínio" />
                        </label>
                        <label className="text-sm font-semibold text-gray-700">
                            Valor <span className="text-rose-500">*</span>
                            <input className="input mt-1 w-full" type="number" min="0.01" step="0.01" value={boletoForm.valor} onChange={e => setBoletoForm(prev => ({ ...prev, valor: e.target.value }))} placeholder="0,00" />
                        </label>
                        <label className="text-sm font-semibold text-gray-700">
                            Vencimento <span className="text-rose-500">*</span>
                            <input className="input mt-1 w-full" type="date" value={boletoForm.vencimento} onChange={e => setBoletoForm(prev => ({ ...prev, vencimento: e.target.value }))} />
                        </label>
                        <label className="text-sm font-semibold text-gray-700 md:col-span-2">
                            Linha digitável (opcional)
                            <input className="input mt-1 w-full" value={boletoForm.linha_digitavel} onChange={e => setBoletoForm(prev => ({ ...prev, linha_digitavel: e.target.value }))} placeholder="Cole a linha digitável para auditoria" />
                        </label>
                        <label className="text-sm font-semibold text-gray-700 md:col-span-2">
                            Crédito correspondente no extrato/OFX (opcional)
                            <select className="input mt-1 w-full" value={boletoForm.transacao_id} onChange={e => setBoletoForm(prev => ({ ...prev, transacao_id: e.target.value }))}>
                                <option value="">Ainda não pago ou vincular depois</option>
                                {transactions.map(transaction => (
                                    <option key={transaction.id} value={transaction.id}>
                                        {new Date(transaction.data_transacao).toLocaleDateString('pt-BR')} · {transaction.descricao || 'Crédito bancário'} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(transaction.valor) || 0)}
                                    </option>
                                ))}
                            </select>
                            <span className="mt-1 block text-xs font-normal text-gray-500">Selecione somente depois que o crédito aparecer no extrato. A divergência de valor continua visível na auditoria.</span>
                        </label>
                    </div>
                    {boletoError && <p role="alert" className="mt-3 text-sm text-rose-600">{boletoError}</p>}
                    <div className="flex justify-end gap-2 mt-4">
                        <button className="btn btn-secondary" onClick={() => { resetBoletoForm(); setShowBoletoForm(false) }}>Cancelar</button>
                        <button className="btn btn-primary" disabled={savingBoleto} onClick={handleSaveBoleto}>{savingBoleto ? 'Salvando...' : 'Salvar boleto'}</button>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Receita Arrecadada</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
                    </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                            <TrendingDown className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Pendente / Inadimplência</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPending)}
                    </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Taxa de Inadimplência</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        {inadimplencia.toFixed(1)}%
                    </p>
                </div>

                {isAntecipado && (
                    <div className="md:col-span-3 bg-violet-600 p-8 rounded-3xl text-white shadow-xl shadow-violet-200 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-violet-100 font-medium mb-1">Auditoria de Antecipação</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-bold tracking-tight">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorLiquidoReal)}
                                </span>
                                <span className="text-violet-200">recebido no banco</span>
                            </div>
                            <div className="mt-4 flex gap-4 text-xs font-medium">
                                <div className="px-3 py-1 bg-white/10 rounded-full border border-white/20">Bruto: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBruto)}</div>
                                <div className="px-3 py-1 bg-white/10 rounded-full border border-white/20">Taxa: {taxaServico}% (-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTaxa)})</div>
                            </div>
                        </div>

                        <div className="relative z-10 bg-white/10 p-6 rounded-2xl border border-white/20 backdrop-blur-sm min-w-[280px]">
                            <p className="text-sm font-medium text-violet-100 mb-2">Conformidade de Taxas</p>
                            <div className="flex items-center gap-3">
                                {divergenciaReceita < 10 ? (
                                    <CheckCircle className="h-8 w-8 text-emerald-300" />
                                ) : (
                                    <AlertCircle className="h-8 w-8 text-amber-300 animate-pulse" />
                                )}
                                <div>
                                    <p className="text-xl font-bold">
                                        {divergenciaReceita < 10 ? 'Lançamento Correto' : `Divergência: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(divergenciaReceita)}`}
                                    </p>
                                    <p className="text-xs text-violet-200">vs. Resumo de Receita</p>
                                </div>
                            </div>
                        </div>

                        {/* Decor */}
                        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 bg-white/5 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 -ml-10 -mb-10 h-32 w-32 bg-violet-400/20 rounded-full blur-2xl" />
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar pagador..."
                                className="pl-10 text-sm py-2 rounded-xl border-gray-200"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex bg-white rounded-xl border border-gray-200 p-1">
                            {(['todos', 'aberto', 'pago', 'atrasado'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize",
                                        filter === f ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {boletoPreviewError && (
                    <p role="alert" className="px-6 py-3 text-sm text-rose-600 border-b border-rose-100 bg-rose-50">
                        {boletoPreviewError}
                    </p>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/30">
                                <th className="px-6 py-4">Boleto</th>
                                <th className="px-6 py-4">Vencimento</th>
                                <th className="px-6 py-4 text-right">Valor</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4">Crédito no extrato</th>
                                <th className="px-6 py-4">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredBoletos.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        Nenhum registro encontrado para este filtro.
                                    </td>
                                </tr>
                            ) : (
                                filteredBoletos.map((b) => (
                                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                                                    {b.pagador.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="block font-semibold text-gray-900">{b.pagador}</span>
                                                    {b.beneficiario && <span className="block text-xs text-gray-500 truncate">Emissor: {b.beneficiario}</span>}
                                                    <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                                        {b.arquivo_nome ? <span className="truncate max-w-[220px]">{b.arquivo_nome}</span> : 'Sem arquivo anexado'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 tabular-nums">
                                            {formatDateOnly(b.vencimento)}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right tabular-nums">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.valor)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                b.status === 'pago' ? "bg-emerald-100 text-emerald-700" :
                                                    b.status === 'atrasado' ? "bg-rose-100 text-rose-700 animate-pulse" : "bg-blue-100 text-blue-700"
                                            )}>
                                                {b.status === 'pago' ? 'Pago' : b.status === 'atrasado' ? 'Atrasado' : 'Em aberto'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            {b.transacao_id ? (
                                                <div className="text-emerald-700">
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle className="h-4 w-4 shrink-0" />
                                                        <span>Vinculado{b.data_pagamento ? ` em ${formatDateOnly(b.data_pagamento)}` : ''}</span>
                                                    </div>
                                                    {transactionsById.get(String(b.transacao_id)) && Math.abs(Number(transactionsById.get(String(b.transacao_id))?.valor) - b.valor) > 0.01 && (
                                                        <span className="mt-1 block text-xs font-semibold text-rose-600">
                                                            Divergência: crédito {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(transactionsById.get(String(b.transacao_id))?.valor) || 0)}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <select
                                                    className="input min-w-[220px] text-xs"
                                                    value=""
                                                    disabled={linkingBoletoId === b.id || transactions.length === 0}
                                                    onChange={e => handleLinkBoleto(b, e.target.value)}
                                                    aria-label={`Vincular crédito ao boleto de ${b.pagador}`}
                                                >
                                                    <option value="">{linkingBoletoId === b.id ? 'Vinculando...' : transactions.length === 0 ? 'Aguardando crédito' : 'Vincular crédito'}</option>
                                                    {transactions.map(transaction => (
                                                        <option key={transaction.id} value={transaction.id}>
                                                            {new Date(transaction.data_transacao).toLocaleDateString('pt-BR')} · {transaction.descricao || 'Crédito bancário'} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(transaction.valor) || 0)}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                type="button"
                                                disabled={!b.arquivo_url || openingBoletoId === b.id}
                                                onClick={() => handleOpenBoleto(b)}
                                                title={b.arquivo_url ? 'Ver boleto' : 'Boleto sem arquivo'}
                                                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"
                                            >
                                                <Eye className="h-4 w-4" />
                                                {openingBoletoId === b.id ? 'Abrindo...' : 'Ver boleto'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Contextual Info */}
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-emerald-600 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-emerald-900 text-sm uppercase tracking-wide">Relatório de Antecipação de Receita</h4>
                    <p className="text-sm text-emerald-700 mt-1">
                        O monitoramento de créditos confirmou 100% dos repasses de antecipação deste mês. Nenhuma divergência de taxas detectada.
                    </p>
                </div>
            </div>
        </div>
    )
}
