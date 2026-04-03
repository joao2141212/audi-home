import { useState, useEffect } from 'react'
import {
    Upload,
    FileText,
    CheckCircle,
    AlertCircle,
    Clock,
    Image as ImageIcon,
    Loader2
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'

interface Receipt {
    id: string
    arquivo_nome: string
    razao_social: string | null
    cnpj: string | null
    data_emissao: string
    valor: number
    status_auditoria: string
    created_at?: string
    fornecedores?: {
        razao_social: string
        cnpj: string
    }
}

interface GeminiReceiptResponse {
    cnpj_emissor: string
    razao_social_emissor: string
    data_emissao: string
    valor_total: number
    descricao_servico: string
    natureza_servico?: string
}

export function ReceiptUpload() {
    const { user } = useAuth()
    const [uploading, setUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [dragActive, setDragActive] = useState(false)
    const [receipts, setReceipts] = useState<Receipt[]>([])

    useEffect(() => {
        if (user?.condominio_id) loadReceipts()
    }, [user])

    const loadReceipts = async () => {
        if (!user?.condominio_id) return
        try {
            const data = await api.getReceipts(user.condominio_id)
            setReceipts(data)
        } catch (error) {
            console.error('Erro ao carregar comprovantes:', error)
        }
    }

    const extractReceiptWithGemini = async (base64: string, mimeType: string): Promise<GeminiReceiptResponse> => {
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
        const prompt = `Analise este Comprovante/Nota Fiscal. Extraia em JSON: cnpj_emissor, razao_social_emissor, data_emissao (YYYY-MM-DD), valor_total (number), descricao_servico, natureza_servico.`

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
        if (!user?.condominio_id) return
        setUploading(true)
        setUploadStatus('idle')
        setMessage('Iniciando visão computacional...')

        try {
            const arrayBuffer = await file.arrayBuffer()
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
            let mimeType = file.type || 'application/octet-stream'
            if (file.name.endsWith('.pdf')) mimeType = 'application/pdf'

            const data = await extractReceiptWithGemini(base64, mimeType)

            setMessage('Auditoria Cloud: Validando CNPJ...')
            const cnpjAudit = await api.validateCNPJ(data.cnpj_emissor)

            let auditStatus = 'auditado'
            let auditFlags = []

            if (cnpjAudit.valid) {
                if (cnpjAudit.situacao !== 'ATIVA') {
                    auditStatus = 'suspeito'
                    auditFlags.push(`CNPJ_${cnpjAudit.situacao}`)
                }

                // Cheque de CNAE simplificado
                const cnaeMap: any = {
                    'Manutenção': ['4321', '4322', '4329', '4399', '3313', '3314'],
                    'Limpeza': ['8121', '8122', '8129'],
                    'Obra': ['4120', '4330', '4391']
                }

                const serviceType = data.natureza_servico || 'Manutenção'
                const requiredCnaes = cnaeMap[serviceType] || []
                const hasCnae = (cnpjAudit.cnaes || []).some((c: string) =>
                    requiredCnaes.some((req: string) => c.replace(/\D/g, '').startsWith(req))
                )

                if (!hasCnae && requiredCnaes.length > 0) {
                    auditFlags.push('CNAE_INCOMPATIVEL')
                    if (auditStatus !== 'suspeito') auditStatus = 'alerta'
                }
            } else {
                auditStatus = 'alerta'
                auditFlags.push('CNPJ_NAO_ENCONTRADO')
            }

            setMessage('Salvando no Cloud...')
            await api.saveReceipt({
                condominio_id: user.condominio_id,
                data_emissao: data.data_emissao,
                valor: data.valor_total,
                descricao: data.descricao_servico,
                arquivo_nome: file.name,
                status_auditoria: auditStatus,
                audit_flags: auditFlags.join(',')
            })

            setUploadStatus('success')
            setMessage('Comprovante processado e salvo na nuvem!')
            loadReceipts()
        } catch (error) {
            setUploadStatus('error')
            setMessage('Erro ao processar comprovante.')
        } finally {
            setUploading(false)
        }
    }

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'auditado': return { label: 'Auditado', icon: <CheckCircle className="h-3.5 w-3.5" />, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
            default: return { label: 'Pendente', icon: <Clock className="h-3.5 w-3.5" />, classes: 'bg-amber-50 text-amber-700 border-amber-200' }
        }
    }

    return (
        <div className="space-y-8 animate-fade-in shadow-2xl rounded-3xl bg-white/50 backdrop-blur-sm p-8">
            <div className="card bg-white p-6 rounded-3xl shadow-lg border-none">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Novo Comprovante (Cloud)</h3>
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]) }}
                    className={cn(
                        "relative border-2 border-dashed rounded-3xl p-12 text-center transition-all",
                        dragActive ? "border-indigo-500 bg-indigo-50" : "border-gray-100 bg-gray-50/50"
                    )}
                >
                    <input type="file" id="r-up" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                    <label htmlFor="r-up" className="cursor-pointer block">
                        <div className="w-16 h-16 bg-white shadow-md rounded-2xl flex items-center justify-center mx-auto mb-4">
                            {uploading ? <Loader2 className="animate-spin text-indigo-600" /> : <Upload className="text-indigo-600" />}
                        </div>
                        <p className="font-bold text-gray-700">{uploading ? message : 'Upload de Nota Fiscal'}</p>
                        <p className="text-xs text-gray-400 mt-2">Arraste ou clique para selecionar</p>
                    </label>
                </div>
            </div>

            <div className="card bg-white p-6 rounded-3xl shadow-lg border-none">
                <h3 className="text-lg font-bold text-gray-900 mb-6 px-2">Histórico de Comprovantes</h3>
                <div className="divide-y divide-gray-50">
                    {receipts.map((r) => {
                        const s = getStatusConfig(r.status_auditoria)
                        return (
                            <div key={r.id} className="py-4 flex items-center gap-4 px-2 hover:bg-gray-50/50 rounded-2xl transition-all">
                                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                    <FileText className="h-6 w-6" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-gray-900">{r.fornecedores?.razao_social || 'Fornecedor'}</p>
                                    <div className="flex gap-3 text-xs text-gray-500 mt-1 font-medium">
                                        <span>{r.data_emissao}</span>
                                        <span>•</span>
                                        <span className="text-indigo-600">R$ {r.valor.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase border", s.classes)}>
                                    {s.label}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
