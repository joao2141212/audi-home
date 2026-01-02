import { useState } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

export function StatementUpload() {
    const [uploading, setUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    const handleFileUpload = async (file: File) => {
        setUploading(true)
        setUploadStatus('idle')

        const formData = new FormData()
        formData.append('file', file)

        try {
            const response = await fetch('http://localhost:8000/api/v1/statements/upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.detail || 'Upload failed')
            }

            const data = await response.json()
            setUploadStatus('success')
            setMessage(`Extrato importado com sucesso! ID: ${data.id}`)
        } catch (error) {
            setUploadStatus('error')
            setMessage(error instanceof Error ? error.message : 'Erro ao importar extrato')
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
            <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className={cn(
                    "border-2 border-dashed rounded-xl p-12 text-center transition-colors",
                    uploading ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-400"
                )}
            >
                <input
                    type="file"
                    id="statement-upload"
                    className="hidden"
                    accept=".csv,.ofx,.pdf"
                    onChange={handleFileSelect}
                    disabled={uploading}
                />
                <label htmlFor="statement-upload" className="cursor-pointer">
                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-700">
                        {uploading ? 'Processando...' : 'Arraste o extrato bancário ou clique para selecionar'}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                        Formatos aceitos: CSV, OFX, PDF
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
