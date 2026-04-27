import { useState, useEffect } from 'react'
import {
    Upload, FileText, AlertCircle,
    Clock, Loader2, ShieldAlert, ShieldCheck, AlertTriangle
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Receipt {
    id: string
    arquivo_nome: string
    data_emissao: string | null
    valor: number | null
    status_auditoria: string
    fraud_score: number | null
    fraud_flags: string[]
    ocr_razao_social: string | null
    ocr_cnpj: string | null
    cnpj_status: string | null
    descricao: string | null
}

export function ReceiptUpload() {
    const { user } = useAuth()
    const [uploading, setUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [dragActive, setDragActive] = useState(false)
    const [receipts, setReceipts] = useState<Receipt[]>([])
    const [lastResult, setLastResult] = useState<any>(null)
    const [moradores, setMoradores] = useState<{ id: string; nome: string; unidade: string }[]>([])
    const [moradorId, setMoradorId] = useState<string>('')

    const calculateFileHash = async (buffer: ArrayBuffer) => {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
        return Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    }

    useEffect(() => {
        if (user?.condominio_id) {
            loadReceipts()
            loadMoradores()
        }
    }, [user])

    const loadMoradores = async () => {
        if (!user?.condominio_id) return
        const { data } = await supabase
            .from('moradores')
            .select('id, nome, unidade')
            .eq('condominio_id', user.condominio_id)
            .eq('ativo', true)
            .order('unidade')
        setMoradores((data || []) as any[])
    }

    const loadReceipts = async () => {
        if (!user?.condominio_id) return
        const { data } = await supabase
            .from('comprovantes')
            .select('id, arquivo_nome, data_emissao, valor, status_auditoria, fraud_score, fraud_flags, ocr_razao_social, ocr_cnpj, cnpj_status, descricao')
            .eq('condominio_id', user.condominio_id)
            .order('created_at', { ascending: false })
            .limit(20)

        setReceipts((data || []) as Receipt[])
    }

    const handleFileUpload = async (file: File) => {
        if (!user?.condominio_id) return
        setUploading(true)
        setUploadStatus('idle')
        setLastResult(null)

        try {
            // STEP 1: Upload file to Supabase Storage (server-side)
            setMessage('Fazendo upload seguro para o servidor...')
            const ext = file.name.split('.').pop()
            const storagePath = `${user.condominio_id}/${Date.now()}_${file.name}`
            const arrayBuffer = await file.arrayBuffer()
            const uint8 = new Uint8Array(arrayBuffer)
            const fileHash = await calculateFileHash(arrayBuffer)

            const { error: storageError } = await supabase.storage
                .from('comprovantes')
                .upload(storagePath, file, { contentType: file.type, upsert: false })

            if (storageError) throw new Error(`Storage: ${storageError.message}`)

            // STEP 2: Create comprovante record (status pending)
            setMessage('Registrando documento...')
            const { data: comp, error: compError } = await supabase
                .from('comprovantes')
                .insert({
                    condominio_id: user.condominio_id,
                    morador_id: moradorId || null,
                    arquivo_nome: file.name,
                    arquivo_url: storagePath,
                    arquivo_hash: fileHash,
                    tipo_arquivo: ext as any,
                    tamanho_bytes: file.size,
                    status: 'processando',
                    status_auditoria: 'pendente',
                })
                .select('id')
                .single()

            if (compError) throw new Error(`Insert: ${compError.message}`)


            // STEP 3: Convert file to base64 for OCR
            setMessage('Extraindo dados com IA (Gemini Flash Lite)...')
            let binary = ''
            uint8.forEach(b => binary += String.fromCharCode(b))
            const base64 = btoa(binary)

            let mimeType = file.type || 'application/octet-stream'
            if (file.name.endsWith('.pdf')) mimeType = 'application/pdf'

            // STEP 4: Call Edge Function (key is SERVER-SIDE only)
            setMessage('Auditando CNPJ e calculando score de fraude...')
            const { data: fnData, error: fnError } = await supabase.functions.invoke('process-comprovante', {
                body: {
                    comprovante_id: comp.id,
                    file_base64: base64,
                    mime_type: mimeType,
                    filename: file.name
                }
            })

            if (fnError) throw new Error(`Edge function: ${fnError.message}`)

            setLastResult(fnData)
            setUploadStatus('success')

            const statusMsg: Record<string, string> = {
                auditado: '✅ Documento auditado — Sem irregularidades detectadas',
                alerta: '⚠️ Documento com alertas — Revisão recomendada',
                suspeito: '🚨 Documento SUSPEITO — Revisão obrigatória antes de aprovar',
                rejeitado: '❌ Documento REJEITADO — Não é uma NF/Recibo válido'
            }
            setMessage(statusMsg[fnData.status] || '✅ Processado')
            await loadReceipts()

        } catch (error: any) {
            setUploadStatus('error')
            setMessage(`Erro: ${error.message}`)
        } finally {
            setUploading(false)
        }
    }

    const getStatusConfig = (status: string) => {
        if (status === 'auditado') return {
            label: 'Auditado', icon: <ShieldCheck className="h-3.5 w-3.5" />,
            classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }
        if (status === 'suspeito') return {
            label: 'Suspeito', icon: <ShieldAlert className="h-3.5 w-3.5" />,
            classes: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
        }
        if (status === 'alerta') return {
            label: 'Alerta', icon: <AlertTriangle className="h-3.5 w-3.5" />,
            classes: 'bg-amber-50 text-amber-700 border-amber-200'
        }
        if (status === 'rejeitado') return {
            label: 'Rejeitado', icon: <AlertCircle className="h-3.5 w-3.5" />,
            classes: 'bg-slate-100 text-slate-600 border-slate-200'
        }
        return { label: 'Pendente', icon: <Clock className="h-3.5 w-3.5" />, classes: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    }

    return (
        <div className="space-y-8">
            {/* Upload Zone */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-2">Upload de Nota Fiscal</h3>
                <p className="text-sm text-slate-500 mb-6">
                    O documento é processado com <strong>Gemini Flash Lite</strong> no servidor — sua chave nunca é exposta. 
                    CNPJ validado na RFB com score de fraude automático.
                </p>

                {/* Morador selector (para comprovantes Pix de inquilinos) */}
                {moradores.length > 0 && (
                    <div className="mb-5">
                        <label className="block text-xs font-bold text-slate-600 mb-1">
                            Morador / Inquilino <span className="text-slate-400 font-normal">(opcional — para comprovantes Pix)</span>
                        </label>
                        <select
                            value={moradorId}
                            onChange={e => setMoradorId(e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                            <option value="">— Selecione o morador (se aplicável) —</option>
                            {moradores.map(m => (
                                <option key={m.id} value={m.id}>
                                    Apto {m.unidade} — {m.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]) }}
                    className={cn(
                        "relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer",
                        dragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/30"
                    )}
                >
                    <input type="file" id="nf-upload" className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.xml"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                    <label htmlFor="nf-upload" className="cursor-pointer block">
                        <div className="w-16 h-16 bg-white shadow-md rounded-2xl flex items-center justify-center mx-auto mb-4">
                            {uploading ? <Loader2 className="animate-spin text-indigo-600 h-7 w-7" /> : <Upload className="text-indigo-600 h-7 w-7" />}
                        </div>
                        <p className="font-bold text-slate-700 text-lg">
                            {uploading ? message : 'Arraste sua NF ou clique para selecionar'}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">PDF, JPG, PNG ou XML — até 10MB</p>
                    </label>
                </div>

                {/* Last result display */}
                {lastResult && uploadStatus === 'success' && (
                    <div className={cn(
                        "mt-6 p-5 rounded-2xl border flex items-start gap-4",
                        lastResult.status === 'auditado' ? "bg-emerald-50 border-emerald-200" :
                        lastResult.status === 'suspeito' ? "bg-rose-50 border-rose-200" :
                        "bg-amber-50 border-amber-200"
                    )}>
                        <div className={cn("p-2.5 rounded-xl",
                            lastResult.status === 'auditado' ? "bg-emerald-100" :
                            lastResult.status === 'suspeito' ? "bg-rose-100" : "bg-amber-100"
                        )}>
                            {lastResult.status === 'auditado' ? <ShieldCheck className="h-6 w-6 text-emerald-600" /> :
                             lastResult.status === 'suspeito' ? <ShieldAlert className="h-6 w-6 text-rose-600" /> :
                             <AlertTriangle className="h-6 w-6 text-amber-600" />}
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-slate-900">{message}</p>
                            {lastResult.ocr?.razao_social_emissor && (
                                <p className="text-sm text-slate-600 mt-1">
                                    <strong>Empresa:</strong> {lastResult.ocr.razao_social_emissor} 
                                    {lastResult.cnpj_status && <span className={cn("ml-2 px-2 py-0.5 rounded text-xs font-bold",
                                        lastResult.cnpj_status === 'ATIVA' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                    )}>{lastResult.cnpj_status}</span>}
                                </p>
                            )}
                            {lastResult.fraud_flags?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {lastResult.fraud_flags.map((f: string) => (
                                        <span key={f} className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">{f}</span>
                                    ))}
                                </div>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-slate-500">Score de fraude:</span>
                                <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                                    <div className={cn("h-1.5 rounded-full transition-all",
                                        lastResult.fraud_score >= 60 ? "bg-rose-500" :
                                        lastResult.fraud_score >= 30 ? "bg-amber-500" : "bg-emerald-500"
                                    )} style={{ width: `${lastResult.fraud_score}%` }} />
                                </div>
                                <span className="text-xs font-bold text-slate-700">{lastResult.fraud_score}/100</span>
                            </div>
                        </div>
                    </div>
                )}

                {uploadStatus === 'error' && (
                    <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700">
                        <AlertCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">{message}</span>
                    </div>
                )}
            </div>

            {/* History */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Histórico de Comprovantes Auditados</h3>
                {receipts.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">Nenhum comprovante enviado ainda</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {receipts.map((r) => {
                            const s = getStatusConfig(r.status_auditoria)
                            return (
                                <div key={r.id} className="py-4 flex items-center gap-4 hover:bg-slate-50/50 rounded-xl px-2 transition-all">
                                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                                        <FileText className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900 truncate">
                                            {r.ocr_razao_social || r.arquivo_nome}
                                        </p>
                                        <div className="flex gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                                            {r.data_emissao && <span>{new Date(r.data_emissao).toLocaleDateString('pt-BR')}</span>}
                                            {r.valor && <span className="text-indigo-600 font-semibold">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor)}
                                            </span>}
                                            {r.ocr_cnpj && <span className="font-mono">{r.ocr_cnpj}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {r.fraud_score !== null && r.fraud_score > 0 && (
                                            <span className={cn("text-xs font-bold",
                                                r.fraud_score >= 60 ? "text-rose-600" :
                                                r.fraud_score >= 30 ? "text-amber-600" : "text-emerald-600"
                                            )}>
                                                {r.fraud_score}pts
                                            </span>
                                        )}
                                        <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase border flex items-center gap-1", s.classes)}>
                                            {s.icon}
                                            {s.label}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
