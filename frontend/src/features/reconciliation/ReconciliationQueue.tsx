import { useState, useEffect } from 'react'
import {
    GitMerge,
    Banknote,
    RefreshCw,
    Zap,
    Loader2,
    Eye,
    Paperclip,
    CheckCircle,
    XCircle,
    AlertCircle
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from '../../components/ui/Skeleton'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface QueueItem {
    id: string
    valor: number
    data: string
    unidade: string
    descricao?: string | null
    arquivo_nome?: string | null
    arquivo_url?: string | null
    status: string
    ocrConfianca: number
}

interface TransactionMatch {
    id: string
    valor: number
    data: string
    descricao: string
    matchScore: number
    matchReasons: string[]
}

export function ReconciliationQueue() {
    const { user } = useAuth()
    const [queue, setQueue] = useState<QueueItem[]>([])
    const [selectedItems, setSelectedItems] = useState<string[]>([])
    const [matches, setMatches] = useState<TransactionMatch[]>([])
    const [loading, setLoading] = useState(true)
    const [matchingResults, setMatchingResults] = useState(false)
    const [openingReceiptId, setOpeningReceiptId] = useState<string | null>(null)
    const [approvingMatchId, setApprovingMatchId] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)

    const fetchQueue = async () => {
        if (!user?.condominio_id) return
        setLoading(true)
        try {
            const data = await api.getReconciliationQueue(user.condominio_id)
            setQueue(data.queue || [])
        } catch (err) {
            console.error('Erro ao buscar fila:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchQueue()
    }, [user])

    const handleToggleItem = (id: string) => {
        const item = queue.find(q => q.id === id)
        if (!item) return

        if (selectedItems[0] === id) {
            setSelectedItems([])
            setMatches([])
            setActionError(null)
            return
        }

        setSelectedItems([id])
        setMatches([])
        setActionError(null)
        void findMatchesForSelection(item.valor, item.data)
    }

    const findMatchesForSelection = async (valor: number, dataTransacao: string) => {
        if (!user?.condominio_id) return
        setMatchingResults(true)
        setActionError(null)
        try {
            const data = await api.getReconciliationMatches(user.condominio_id, valor, dataTransacao)
            setMatches(data.matches || [])
        } catch (err) {
            console.error('Erro ao buscar matches:', err)
            setActionError('Não foi possível buscar os lançamentos do extrato para este comprovante.')
        } finally {
            setMatchingResults(false)
        }
    }

    const handleApprove = async (matchId: string) => {
        if (selectedItems.length !== 1 || !user?.condominio_id) return
        setApprovingMatchId(matchId)
        setActionError(null)
        try {
            await api.approveReconciliation(selectedItems[0], matchId, user.condominio_id)
            setQueue(prev => prev.filter(q => !selectedItems.includes(q.id)))
            setSelectedItems([])
            setMatches([])
        } catch (err) {
            console.error(JSON.stringify({ fn: 'ReconciliationQueue.handleApprove', status: 'error', receipt_id: selectedItems[0], transaction_id: matchId, error_class: err instanceof Error ? err.name : 'unknown' }))
            setActionError('Não foi possível vincular este lançamento. O comprovante continua pendente.')
        } finally {
            setApprovingMatchId(null)
        }
    }

    const handleOpenReceipt = async (item: QueueItem) => {
        if (!item.arquivo_url) {
            setActionError('Este comprovante não possui arquivo armazenado.')
            return
        }

        setOpeningReceiptId(item.id)
        setActionError(null)
        try {
            if (item.arquivo_url.startsWith('http://') || item.arquivo_url.startsWith('https://')) {
                window.open(item.arquivo_url, '_blank', 'noopener,noreferrer')
                return
            }

            const { data, error } = await supabase.storage
                .from('comprovantes')
                .createSignedUrl(item.arquivo_url, 60)

            if (error) throw error
            window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
        } catch (err) {
            console.error(JSON.stringify({ fn: 'ReconciliationQueue.handleOpenReceipt', status: 'error', receipt_id: item.id, error_class: err instanceof Error ? err.name : 'unknown' }))
            setActionError('Não foi possível abrir o arquivo deste comprovante.')
        } finally {
            setOpeningReceiptId(null)
        }
    }

    const selectedItem = selectedItems.length === 1
        ? queue.find(item => item.id === selectedItems[0])
        : undefined

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value) || 0)

    const formatDate = (date: string) => {
        if (!date) return 'Data não informada'
        return new Date(date).toLocaleDateString('pt-BR')
    }

    if (loading) return <div className="p-10"><SkeletonTable rows={5} /></div>

    return (
        <div className="p-8 space-y-8 animate-fade-in shadow-2xl rounded-3xl bg-white/50 backdrop-blur-sm border border-white">
            <header className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-violet-600 rounded-2xl shadow-lg ring-4 ring-violet-50">
                        <GitMerge className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Fila de Reconciliação</h1>
                        <p className="text-sm text-gray-500 font-medium">{queue.length} comprovantes aguardando vínculo com o extrato</p>
                    </div>
                </div>
                <button onClick={fetchQueue} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all">
                    <RefreshCw className="h-5 w-5 text-gray-400" />
                </button>
            </header>

            <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <p>
                    <strong>O que fazer nesta tela:</strong> selecione um comprovante à esquerda. O sistema busca no extrato o débito com valor e data compatíveis. Abra o comprovante, confira a descrição e clique em <strong>Vincular e marcar como conciliado</strong> somente quando a evidência estiver correta.
                </p>
            </div>

            {actionError && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                    <p>{actionError}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                <div className="md:col-span-2 space-y-4">
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest px-2">Comprovantes Pendentes</h3>
                    <div className="space-y-3">
                        {queue.map((item) => (
                            <button
                                type="button"
                                key={item.id}
                                onClick={() => handleToggleItem(item.id)}
                                aria-pressed={selectedItems.includes(item.id)}
                                className={cn(
                                    "w-full p-6 rounded-3xl border transition-all cursor-pointer group text-left",
                                    selectedItems.includes(item.id)
                                        ? "bg-violet-600 border-violet-600 shadow-xl text-white"
                                        : "bg-white border-gray-100 hover:border-violet-200 text-gray-900"
                                )}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <p className="font-bold truncate">{item.unidade}</p>
                                        <p className={cn("text-xs font-medium mt-1", selectedItems.includes(item.id) ? "text-violet-100" : "text-gray-400")}>{formatDate(item.data)}</p>
                                        {item.descricao && <p className={cn("mt-2 truncate text-xs", selectedItems.includes(item.id) ? "text-violet-100" : "text-gray-500")}>{item.descricao}</p>}
                                        <p className={cn("mt-2 flex items-center gap-1 text-xs", selectedItems.includes(item.id) ? "text-violet-100" : "text-gray-500")}>
                                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                            {item.arquivo_nome || 'Arquivo não informado'}
                                        </p>
                                    </div>
                                    <p className="text-lg font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}</p>
                                </div>
                                <span className={cn("mt-4 block text-xs font-semibold", selectedItems.includes(item.id) ? "text-violet-100" : "text-violet-600")}>
                                    {selectedItems.includes(item.id) ? 'Selecionado. Veja os matches ao lado.' : 'Selecionar para buscar no extrato'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="md:col-span-3 space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Conferência com o extrato</h3>
                        {selectedItem && <span className="text-xs font-semibold text-violet-600">1 comprovante selecionado</span>}
                    </div>

                    {selectedItem && (
                        <div className="bg-white p-5 rounded-3xl border border-violet-100 shadow-sm flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Comprovante selecionado</p>
                                <p className="mt-1 truncate font-bold text-gray-900">{selectedItem.arquivo_nome || selectedItem.unidade}</p>
                                <p className="mt-1 text-sm text-gray-500">{formatCurrency(selectedItem.valor)} · {formatDate(selectedItem.data)}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleOpenReceipt(selectedItem)}
                                disabled={openingReceiptId === selectedItem.id}
                                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
                            >
                                <Eye className="h-4 w-4" />
                                {openingReceiptId === selectedItem.id ? 'Abrindo...' : 'Ver comprovante'}
                            </button>
                        </div>
                    )}

                    {selectedItems.length === 0 ? (
                        <div className="h-full min-h-[400px] border-2 border-dashed border-gray-100 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-12 bg-white/30">
                            <Zap className="h-12 w-12 text-gray-200 mb-4" />
                            <p className="text-gray-400 font-bold max-w-xs">Selecione um comprovante à esquerda para procurar o débito correspondente no extrato.</p>
                        </div>
                    ) : matchingResults ? (
                        <div className="min-h-[300px] rounded-[2.5rem] border border-gray-100 bg-white flex flex-col items-center justify-center gap-4 text-center p-12">
                            <Loader2 className="animate-spin h-10 w-10 text-violet-600" />
                            <p className="text-sm font-semibold text-gray-500">Procurando lançamentos por valor e data...</p>
                        </div>
                    ) : matches.length === 0 ? (
                        <div className="min-h-[300px] rounded-[2.5rem] border border-amber-100 bg-amber-50 flex flex-col items-center justify-center gap-3 text-center p-12">
                            <AlertCircle className="h-10 w-10 text-amber-500" />
                            <p className="font-bold text-amber-900">Nenhum débito compatível encontrado.</p>
                            <p className="max-w-md text-sm text-amber-800">Importe o extrato bancário ou mantenha o comprovante pendente para revisar quando o pagamento aparecer.</p>
                            <button type="button" onClick={() => { setSelectedItems([]); setMatches([]) }} className="mt-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-amber-900 shadow-sm hover:bg-amber-100">Manter pendente</button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {matches.map((match) => {
                                const difference = Math.abs(Math.abs(Number(match.valor) || 0) - Math.abs(Number(selectedItem?.valor) || 0))
                                return (
                                    <div key={match.id} className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-50 flex flex-col gap-5 animate-in slide-in-from-right-4">
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="p-3 bg-emerald-50 rounded-2xl">
                                                    <Banknote className="h-6 w-6 text-emerald-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xl font-black text-gray-900">{formatCurrency(Math.abs(match.valor))}</p>
                                                    <p className="truncate text-sm text-gray-500 font-medium">{match.descricao || 'Lançamento bancário sem descrição'}</p>
                                                    <p className="mt-1 text-xs text-gray-400">{formatDate(match.data)}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-2xl font-black text-emerald-500">{match.matchScore}%</p>
                                                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Confiança</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {match.matchReasons.map(r => <span key={r} className="px-3 py-1 bg-violet-50 text-violet-600 text-[10px] font-black uppercase rounded-full">{r}</span>)}
                                            {difference > 0.01 && <span className="px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black uppercase rounded-full">Diferença de {formatCurrency(difference)}</span>}
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => handleApprove(match.id)}
                                                disabled={approvingMatchId === match.id}
                                                className="flex-1 py-4 bg-violet-600 text-white rounded-2xl font-black shadow-lg shadow-violet-100 hover:shadow-violet-200 transition-all flex items-center justify-center gap-3 disabled:cursor-wait disabled:opacity-60"
                                            >
                                                <CheckCircle className="h-5 w-5" />
                                                {approvingMatchId === match.id ? 'Vinculando...' : 'Vincular e marcar como conciliado'}
                                            </button>
                                            <button type="button" onClick={() => { setSelectedItems([]); setMatches([]) }} className="px-4 py-4 border border-gray-200 text-gray-600 rounded-2xl hover:bg-gray-50" title="Manter pendente">
                                                <XCircle className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
