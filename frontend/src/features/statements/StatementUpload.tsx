import { useState } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader2, Save, Trash2, FileText, Landmark } from 'lucide-react'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'
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
    const [pendingData, setPendingData] = useState<any>(null)
    const [isSaving, setIsSaving] = useState(false)

    const extractWithGemini = async (base64: string, mimeType: string) => {
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
        const prompt = `Extraia transações de extrato bancário em JSON: { "transacoes": [{ "data": "YYYY-MM-DD", "descricao": "...", "valor": 0.00, "type": "CREDIT|DEBIT" }], "periodo_inicio": "...", "periodo_fim": "..." }`

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }]
                })
            }
        )

        if (!response.ok) throw new Error('Erro na IA')
        const result = await response.json()
        let jsonText = result.candidates[0].content.parts[0].text
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```/g, '').trim()
        return JSON.parse(jsonText)
    }

    const handleFileUpload = async (file: File) => {
        setUploading(true)
        setUploadStatus('idle')
        setMessage('IA Processando Extrato...')

        try {
            const arrayBuffer = await file.arrayBuffer()
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
            let mimeType = file.type || 'application/pdf'

            const result = await extractWithGemini(base64, mimeType)

            setTransactions(result.transacoes)
            setPendingData({ filename: file.name, ...result })
            setMessage('Extrato processado com sucesso! Revise os dados abaixo.')
        } catch (error) {
            setUploadStatus('error')
            setMessage('Erro ao processar arquivo.')
        } finally {
            setUploading(false)
        }
    }

    const handleConfirmSave = async () => {
        if (!pendingData || !user?.condominio_id) return
        setIsSaving(true)
        setMessage('Sincronizando com a Nuvem...')

        try {
            await api.saveStatement({
                filename: pendingData.filename,
                periodo_inicio: pendingData.periodo_inicio,
                periodo_fim: pendingData.periodo_fim,
                instituicao: 'Detectado via IA',
                transacoes: pendingData.transacoes,
                condominio_id: user.condominio_id
            })

            setUploadStatus('success')
            setMessage('Extrato salvo no Supabase!')
            setPendingData(null)
        } catch (error) {
            setUploadStatus('error')
            setMessage('Erro ao salvar no banco.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-8 animate-fade-in shadow-2xl rounded-3xl bg-white/50 backdrop-blur-sm p-8 border border-white">
            {!pendingData ? (
                <div className="card bg-white p-12 rounded-3xl shadow-xl border-none text-center">
                    <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]) }}
                        className="relative group cursor-pointer"
                    >
                        <input type="file" id="s-up" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                        <label htmlFor="s-up" className="cursor-pointer">
                            <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                                {uploading ? <Loader2 className="animate-spin text-indigo-600 h-10 w-10" /> : <Landmark className="text-indigo-600 h-10 w-10" />}
                            </div>
                            <h3 className="text-xl font-black text-gray-900 mb-2">Importar Extrato Cloud</h3>
                            <p className="text-gray-500 max-w-sm mx-auto">{uploading ? message : 'Arraste o arquivo PDF/CSV do seu banco para sincronizar direto no Supabase.'}</p>
                        </label>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-indigo-600 p-8 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl shadow-indigo-200">
                        <div className="flex items-center gap-4">
                            <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl">
                                <CheckCircle className="h-8 w-8" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">Documento Processado</p>
                                <p className="text-indigo-100 opacity-80">{transactions.length} transações encontradas</p>
                            </div>
                        </div>
                        <div className="flex gap-4 w-full md:w-auto">
                            <button onClick={() => setPendingData(null)} className="flex-1 px-6 py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-bold transition-all border border-white/20">Descartar</button>
                            <button onClick={handleConfirmSave} disabled={isSaving} className="flex-1 px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
                                {isSaving ? 'Salvando...' : 'Confirmar e Subir'}
                            </button>
                        </div>
                    </div>

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
                </div>
            )}
        </div>
    )
}
