import { useState } from 'react'
import {
    Upload,
    FileText,
    CheckCircle,
    AlertCircle,
    Clock,
    Eye,
    Trash2,
    Image as ImageIcon,
    FileCheck,
    Loader2
} from 'lucide-react'
import { cn } from '../../lib/utils'

// Mock data for demo - comprovantes já enviados
const mockReceipts = [
    {
        id: '1',
        fileName: 'comprovante_dezembro_101.pdf',
        unidade: 'Apto 101',
        uploadedAt: '2025-12-28T14:30:00',
        status: 'aprovado',
        valor: 850.00,
        ocrConfianca: 98
    },
    {
        id: '2',
        fileName: 'pagamento_taxa_202.jpg',
        unidade: 'Apto 202',
        uploadedAt: '2025-12-27T10:15:00',
        status: 'pendente',
        valor: 850.00,
        ocrConfianca: 85
    },
    {
        id: '3',
        fileName: 'recibo_manutencao.pdf',
        unidade: 'Área Comum',
        uploadedAt: '2025-12-26T09:00:00',
        status: 'rejeitado',
        valor: null,
        ocrConfianca: 42
    },
]

export function ReceiptUpload() {
    const [uploading, setUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [unidade, setUnidade] = useState('')
    const [dragActive, setDragActive] = useState(false)
    const [receipts, setReceipts] = useState(mockReceipts)

    const handleFileUpload = async (file: File) => {
        setUploading(true)
        setUploadStatus('idle')

        // Simulate upload for demo
        setTimeout(() => {
            const newReceipt = {
                id: Date.now().toString(),
                fileName: file.name,
                unidade: unidade || 'Não informada',
                uploadedAt: new Date().toISOString(),
                status: 'pendente' as const,
                valor: 850.00,
                ocrConfianca: 92
            }
            setReceipts([newReceipt, ...receipts])
            setUploadStatus('success')
            setMessage('Comprovante enviado e processado via OCR!')
            setUploading(false)
            setUnidade('')
        }, 1500)
    }

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFileUpload(file)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleFileUpload(file)
    }

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'aprovado':
                return {
                    label: 'Aprovado',
                    icon: <CheckCircle className="h-3.5 w-3.5" />,
                    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }
            case 'pendente':
                return {
                    label: 'Pendente',
                    icon: <Clock className="h-3.5 w-3.5" />,
                    classes: 'bg-amber-50 text-amber-700 border-amber-200'
                }
            case 'rejeitado':
                return {
                    label: 'Rejeitado',
                    icon: <AlertCircle className="h-3.5 w-3.5" />,
                    classes: 'bg-rose-50 text-rose-700 border-rose-200'
                }
            default:
                return {
                    label: status,
                    icon: null,
                    classes: 'bg-gray-50 text-gray-700 border-gray-200'
                }
        }
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Upload Section */}
            <div className="card">
                <div className="card-header">
                    <h3 className="text-base font-semibold text-gray-900">Novo Comprovante</h3>
                </div>
                <div className="card-body space-y-6">
                    {/* Unit Input */}
                    <div className="max-w-xs">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Unidade
                        </label>
                        <input
                            type="text"
                            value={unidade}
                            onChange={(e) => setUnidade(e.target.value)}
                            placeholder="Ex: Apto 101"
                            className="w-full"
                        />
                    </div>

                    {/* Drop Zone */}
                    <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className={cn(
                            "relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200",
                            dragActive
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 hover:border-gray-300 bg-gray-50/50",
                            uploading && "pointer-events-none opacity-60"
                        )}
                    >
                        <input
                            type="file"
                            id="receipt-upload"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleFileSelect}
                            disabled={uploading}
                        />
                        <label htmlFor="receipt-upload" className="cursor-pointer block">
                            <div className={cn(
                                "mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors",
                                dragActive ? "bg-blue-100" : "bg-gray-100"
                            )}>
                                {uploading ? (
                                    <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                                ) : (
                                    <Upload className={cn(
                                        "h-6 w-6 transition-colors",
                                        dragActive ? "text-blue-600" : "text-gray-400"
                                    )} />
                                )}
                            </div>
                            <p className="text-base font-medium text-gray-700 mb-1">
                                {uploading ? 'Processando OCR...' : 'Arraste o comprovante aqui'}
                            </p>
                            <p className="text-sm text-gray-500">
                                ou <span className="text-blue-600 hover:text-blue-700 font-medium">clique para selecionar</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-3">
                                PDF, JPG ou PNG até 10MB
                            </p>
                        </label>
                    </div>

                    {/* Upload Status */}
                    {uploadStatus !== 'idle' && (
                        <div className={cn(
                            "flex items-center gap-3 p-4 rounded-lg",
                            uploadStatus === 'success'
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : "bg-rose-50 text-rose-800 border border-rose-200"
                        )}>
                            {uploadStatus === 'success' ? (
                                <CheckCircle className="h-5 w-5 text-emerald-600" />
                            ) : (
                                <AlertCircle className="h-5 w-5 text-rose-600" />
                            )}
                            <div>
                                <p className="font-medium text-sm">
                                    {uploadStatus === 'success' ? 'Enviado com sucesso!' : 'Erro no upload'}
                                </p>
                                <p className="text-xs opacity-80">{message}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Receipts List */}
            <div className="card">
                <div className="card-header flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">Comprovantes Enviados</h3>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {receipts.length} registros
                    </span>
                </div>
                <div className="divide-y divide-gray-100">
                    {receipts.map((receipt, index) => {
                        const statusConfig = getStatusConfig(receipt.status)
                        const isPDF = receipt.fileName.endsWith('.pdf')

                        return (
                            <div
                                key={receipt.id}
                                className="p-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors animate-fade-in"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                {/* File Icon */}
                                <div className={cn(
                                    "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                    isPDF ? "bg-rose-100" : "bg-blue-100"
                                )}>
                                    {isPDF ? (
                                        <FileText className="h-5 w-5 text-rose-600" />
                                    ) : (
                                        <ImageIcon className="h-5 w-5 text-blue-600" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {receipt.fileName}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                        <span>{receipt.unidade}</span>
                                        <span>•</span>
                                        <span>{new Date(receipt.uploadedAt).toLocaleDateString('pt-BR')}</span>
                                        {receipt.valor && (
                                            <>
                                                <span>•</span>
                                                <span className="font-medium text-gray-700">
                                                    R$ {receipt.valor.toFixed(2)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* OCR Confidence */}
                                {receipt.ocrConfianca && (
                                    <div className="hidden sm:flex flex-col items-end">
                                        <span className="text-xs text-gray-500">OCR</span>
                                        <span className={cn(
                                            "text-sm font-medium",
                                            receipt.ocrConfianca >= 80 ? "text-emerald-600" :
                                                receipt.ocrConfianca >= 60 ? "text-amber-600" : "text-rose-600"
                                        )}>
                                            {receipt.ocrConfianca}%
                                        </span>
                                    </div>
                                )}

                                {/* Status Badge */}
                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                    statusConfig.classes
                                )}>
                                    {statusConfig.icon}
                                    {statusConfig.label}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                        <Eye className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <FileCheck className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-blue-900">Como funciona</p>
                    <p className="text-sm text-blue-700 mt-1">
                        Os comprovantes são processados automaticamente via OCR para extrair valor, data e NSU.
                        Em seguida, são cruzados com o extrato bancário para validação.
                    </p>
                </div>
            </div>
        </div>
    )
}
