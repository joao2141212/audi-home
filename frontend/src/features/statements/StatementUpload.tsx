import { useState } from 'react'
import { CheckCircle, Loader2, Landmark } from 'lucide-react'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Transaction {
    data: string
    descricao: string
    valor: number
    type: 'CREDIT' | 'DEBIT'
}

export function StatementUpload() {
    const { user } = useAuth()
    const [uploading, setUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [transactions, setTransactions] = useState<Transaction[]>([])

    const handleFileUpload = async (file: File) => {
        if (!user?.condominio_id) return
        setUploading(true)
        setUploadStatus('idle')
        setMessage('Enviando extrato para processamento seguro...')
        setTransactions([])

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('condominio_id', user.condominio_id)

            const { data: sessionData } = await supabase.auth.getSession()
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-extrato`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`
                    },
                    body: formData
                }
            )

            const result = await response.json()

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Falha ao processar extrato')
            }

            const normalizedTransactions: Transaction[] = (result.transacoes?.lista || []).map((tx: any) => ({
                data: tx.data,
                descricao: tx.descricao,
                valor: tx.valor,
                type: tx.type || tx.tipo
            }))

            setTransactions(normalizedTransactions)
            setUploadStatus('success')
            setMessage(`Extrato importado com sucesso! ${result.transacoes?.inseridas || 0} transações salvas.`)
        } catch (error) {
            setUploadStatus('error')
            setMessage(error instanceof Error ? error.message : 'Erro ao processar arquivo.')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="space-y-8 animate-fade-in shadow-2xl rounded-3xl bg-white/50 backdrop-blur-sm p-8 border border-white">
            <div className="card bg-white p-12 rounded-3xl shadow-xl border-none text-center">
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]) }}
                    className="relative group cursor-pointer"
                >
                    <input type="file" id="s-up" className="hidden" accept=".pdf,.csv,.ofx" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                    <label htmlFor="s-up" className="cursor-pointer">
                        <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                            {uploading ? <Loader2 className="animate-spin text-indigo-600 h-10 w-10" /> : <Landmark className="text-indigo-600 h-10 w-10" />}
                        </div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">Enviar arquivo do banco</h3>
                        <p className="text-gray-500 max-w-xl mx-auto">{uploading ? message : 'No internet banking, exporte o extrato da conta do condomínio. Envie OFX (recomendado), CSV ou PDF. Cada movimentação será comparada com cobranças e comprovantes.'}</p>
                    </label>
                </div>
            </div>

            {(uploadStatus !== 'idle' || transactions.length > 0) && (
                <div className="space-y-6">
                    <div className={cn(
                        "p-8 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl",
                        uploadStatus === 'success' ? "bg-indigo-600 shadow-indigo-200" : "bg-rose-600 shadow-rose-200"
                    )}>
                        <div className="flex items-center gap-4">
                            <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl">
                                {uploadStatus === 'success' ? <CheckCircle className="h-8 w-8" /> : <Loader2 className="h-8 w-8" />}
                            </div>
                            <div>
                                <p className="text-xl font-bold">{uploadStatus === 'success' ? 'Extrato Importado' : 'Falha no Processamento'}</p>
                                <p className="opacity-90">{message}</p>
                            </div>
                        </div>
                    </div>

                    {transactions.length > 0 && (
                        <div className="card bg-white rounded-3xl shadow-xl overflow-hidden border-none">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                        <th className="px-6 py-4">Data</th>
                                        <th className="px-6 py-4">Descrição</th>
                                        <th className="px-6 py-4 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {transactions.map((tx, i) => (
                                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-500">{tx.data}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-gray-900 truncate max-w-xs">{tx.descricao}</td>
                                            <td className={cn("px-6 py-4 text-sm font-black text-right", tx.type === 'CREDIT' ? "text-green-600" : "text-red-500")}>
                                                {tx.type === 'CREDIT' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(tx.valor))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
