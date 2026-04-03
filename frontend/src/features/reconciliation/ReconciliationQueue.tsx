import { useState, useEffect } from 'react'
import {
    CheckCircle,
    XCircle,
    GitMerge,
    ArrowRight,
    Calendar,
    Banknote,
    RefreshCw,
    Zap,
    Loader2
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from '../../components/ui/Skeleton'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'

interface QueueItem {
    id: string
    valor: number
    data: string
    unidade: string
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
    const [totalSelected, setTotalSelected] = useState(0)

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
        setSelectedItems(prev => {
            const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
            const selectedData = queue.filter(q => next.includes(q.id))
            const total = selectedData.reduce((acc, curr) => acc + curr.valor, 0)
            setTotalSelected(total)

            if (next.length === 1) {
                findMatchesForSelection(selectedData[0].valor)
            } else {
                setMatches([])
            }
            return next
        })
    }

    const findMatchesForSelection = async (valor: number) => {
        if (!user?.condominio_id) return
        setMatchingResults(true)
        try {
            const data = await api.getReconciliationMatches(user.condominio_id, valor)
            setMatches(data.matches || [])
        } catch (err) {
            console.error('Erro ao buscar matches:', err)
        } finally {
            setMatchingResults(false)
        }
    }

    const handleApprove = async (matchId: string) => {
        if (selectedItems.length !== 1) return
        try {
            await api.approveReconciliation(selectedItems[0], matchId)
            setQueue(prev => prev.filter(q => !selectedItems.includes(q.id)))
            setSelectedItems([])
            setMatches([])
            setTotalSelected(0)
        } catch (err) {
            alert('Erro ao aprovar match')
        }
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
                        <p className="text-sm text-gray-500 font-medium">Cloud Engine • {queue.length} notas aguardando vínculo</p>
                    </div>
                </div>
                <button onClick={fetchQueue} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all">
                    <RefreshCw className="h-5 w-5 text-gray-400" />
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest px-2">Comprovantes Pendentes</h3>
                    <div className="space-y-3">
                        {queue.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => handleToggleItem(item.id)}
                                className={cn(
                                    "p-6 rounded-3xl border transition-all cursor-pointer group",
                                    selectedItems.includes(item.id)
                                        ? "bg-violet-600 border-violet-600 shadow-xl text-white"
                                        : "bg-white border-gray-100 hover:border-violet-200 text-gray-900"
                                )}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <p className="font-bold truncate">{item.unidade}</p>
                                        <p className={cn("text-xs font-medium mt-1", selectedItems.includes(item.id) ? "text-violet-100" : "text-gray-400")}>{item.data}</p>
                                    </div>
                                    <p className="text-lg font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-3">
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest px-2 mb-4">Melhores Matches no Extrato</h3>
                    {selectedItems.length === 0 ? (
                        <div className="h-full min-h-[400px] border-2 border-dashed border-gray-100 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-12 bg-white/30">
                            <Zap className="h-12 w-12 text-gray-200 mb-4" />
                            <p className="text-gray-400 font-bold max-w-xs">Selecione uma nota à esquerda para buscar transações automáticas.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {matchingResults ? <Loader2 className="animate-spin h-10 w-10 mx-auto text-violet-600" /> : matches.map((match) => (
                                <div key={match.id} className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-50 flex flex-col gap-6 animate-in slide-in-from-right-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 bg-emerald-50 rounded-2xl">
                                                <Banknote className="h-6 w-6 text-emerald-600" />
                                            </div>
                                            <div>
                                                <p className="text-xl font-black text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(match.valor))}</p>
                                                <p className="text-sm text-gray-400 font-medium">{match.descricao}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-3xl font-black text-emerald-500">{match.matchScore}%</p>
                                            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Confiança</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        {match.matchReasons.map(r => <span key={r} className="px-3 py-1 bg-violet-50 text-violet-600 text-[10px] font-black uppercase rounded-full">{r}</span>)}
                                    </div>

                                    <button onClick={() => handleApprove(match.id)} className="w-full py-5 bg-violet-600 text-white rounded-2xl font-black shadow-lg shadow-violet-100 hover:shadow-violet-200 transition-all flex items-center justify-center gap-3">
                                        Vincular Transação <ArrowRight className="h-5 w-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
