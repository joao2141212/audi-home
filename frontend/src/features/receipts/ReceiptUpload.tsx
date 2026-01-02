import { useState } from 'react'
import { Upload, FileImage, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

export function ReceiptUpload() {
    const [uploading, setUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [unidade, setUnidade] = useState('')

    const handleFileUpload = async (file: File) => {
        setUploading(true)
        setUploadStatus('idle')

        const formData = new FormData()
        formData.append('file', file)
        if (unidade) {
            formData.append('unidade', unidade)
        }

        try {
            const response = await fetch('http://localhost:8000/api/v1/receipts/upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.detail || 'Upload failed')
            }

            const data = await response.json()

            // Trigger OCR processing
            await fetch(`http://localhost:8000/api/v1/receipts/${data.id}/process-ocr`, {
                method: 'POST',
            })

            setUploadStatus('success')
            setMessage(`Comprovante enviado! Status: ${data.status}`)
        } catch (error) {
            setUploadStatus('error')
            setMessage(error instanceof Error ? error.message : 'Erro ao enviar comprovante')
        } finally {
            setUploading(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) {
            handleFileUpload(file)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleFileUpload(file)
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unidade (opcional)
                </label>
                <input
                    type="text"
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    placeholder="Ex: Apto 101"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className={cn(
                    "border-2 border-dashed rounded-xl p-12 text-center transition-colors",
                    uploading ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-green-400"
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
                <label htmlFor="receipt-upload" className="cursor-pointer">
                    <FileImage className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-700">
                        {uploading ? 'Processando...' : 'Arraste o comprovante ou clique para selecionar'}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                        Formatos aceitos: PDF, JPG, PNG
                    </p>
                </label>
            </div>

            {uploadStatus !== 'idle' && (
                <div
                    className={cn(
                        "p-4 rounded-lg flex items-start gap-3",
                        uploadStatus === 'success' ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                    )}
                >
                    {uploadStatus === 'success' ? (
                        <CheckCircle className="h-5 w-5 mt-0.5" />
                    ) : (
                        <AlertCircle className="h-5 w-5 mt-0.5" />
                    )}
                    <div>
                        <p className="font-medium">
                            {uploadStatus === 'success' ? 'Sucesso!' : 'Erro'}
                        </p>
                        <p className="text-sm">{message}</p>
                    </div>
                </div>
            )}
        </div>
    )
}
