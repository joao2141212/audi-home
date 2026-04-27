import { useState } from 'react'
import { Upload, FileText, CheckCircle, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'

interface TenantReceiptUploadProps {
    condominioId: string
    unidadeId?: string
}

export function TenantReceiptUpload({ condominioId, unidadeId: _unidadeId }: TenantReceiptUploadProps) {
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [validationResult, setValidationResult] = useState<any>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setValidationResult(null)
        }
    }

    const extractReceiptWithGemini = async (base64: string, mimeType: string) => {
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
        // Prompt otimizado para pagamento de boleto
        const prompt = `Analise este Comprovante de Pagamento (Boleto/Pix).
        Extraia em JSON:
        {
          "data_pagamento": "YYYY-MM-DD",
          "valor_pago": 100.00,
          "beneficiario": "Nome do Condomínio ou Administradora",
          "pagador": "Nome do Pagador/Unidade"
        }`

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

    const handleUpload = async () => {
        if (!file) return
        setUploading(true)
        setValidationResult(null)

        try {
            // 1. Visão Computacional Client-Side
            const arrayBuffer = await file.arrayBuffer()
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
            let mimeType = file.type || 'application/pdf'

            const iaData = await extractReceiptWithGemini(base64, mimeType)

            // 2. Busca Match no Supabase (Client-Side)
            const { matches } = await api.getReconciliationMatches(condominioId, iaData.valor_pago)

            // 3. Validação
            const exactMatch = matches.find((m: any) => m.matchScore === 100 || Math.abs(m.valor - iaData.valor_pago) < 0.05)

            if (exactMatch) {
                // Auto-aprovação
                await api.approveReconciliation(file.name, exactMatch.id) // Simplificação: nome como ID fake por enquanto, ideal criar comprovante

                setValidationResult({
                    status: 'APROVADO',
                    message: `Pagamento de R$ ${iaData.valor_pago} confirmado automaticamente!`,
                    match_details: { amount: iaData.valor_pago, date: iaData.data_pagamento, description: 'Validado via Cloud AI' }
                })
            } else {
                setValidationResult({
                    status: 'PENDENTE',
                    message: `Pagamento recebido (R$ ${iaData.valor_pago}), mas aguardando conciliação bancária.`
                })
            }

        } catch (error) {
            console.error(error)
            setValidationResult({ status: 'ERRO', message: 'Erro ao processar. Verifique sua conexão.' })
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="p-8 space-y-8 animate-fade-in shadow-2xl rounded-3xl bg-white/50 backdrop-blur-sm border border-white max-w-2xl mx-auto">
            <header className="text-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck className="h-10 w-10 text-white" />
                </div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Portal de Comprovantes</h1>
                <p className="text-gray-500 font-medium mt-2">Validação instantânea via Auditoria Cloud</p>
            </header>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-50">
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]) }}
                    className={cn(
                        "relative border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer",
                        file ? "border-indigo-600 bg-indigo-50" : "border-gray-100 bg-gray-50/50 hover:bg-gray-100/50"
                    )}
                >
                    <input id="t-up" type="file" className="hidden" onChange={handleFileChange} />
                    <label htmlFor="t-up" className="cursor-pointer block">
                        {file ? <FileText className="h-12 w-12 text-indigo-600 mx-auto mb-4" /> : <Upload className="h-12 w-12 text-gray-300 mx-auto mb-4" />}
                        <p className="font-bold text-gray-700">{file ? file.name : 'Selecione seu comprovante'}</p>
                        <p className="text-xs text-gray-400 mt-2">PDF, JPG ou PNG</p>
                    </label>
                </div>

                <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="w-full mt-6 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                    {uploading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                    {uploading ? 'Validando na Nuvem...' : 'Enviar para Auditoria'}
                </button>

                {validationResult && (
                    <div className={cn("mt-8 p-6 rounded-3xl border-2 animate-in zoom-in-95", validationResult.status === 'APROVADO' ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100")}>
                        <div className="flex gap-4">
                            {validationResult.status === 'APROVADO' ? <CheckCircle className="text-green-500" /> : <CheckCircle className="text-amber-500" />}
                            <div>
                                <p className="font-bold text-gray-900">{validationResult.status === 'APROVADO' ? 'Pagamento Confirmado' : 'Recebido'}</p>
                                <p className="text-sm text-gray-600 mt-1">{validationResult.message}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
