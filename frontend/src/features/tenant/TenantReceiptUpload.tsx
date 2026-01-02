import { useState } from 'react'
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface TenantReceiptUploadProps {
    condominioId: string
    unidadeId?: string
}

export function TenantReceiptUpload({ condominioId, unidadeId }: TenantReceiptUploadProps) {
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [validationResult, setValidationResult] = useState<any>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setValidationResult(null)
        }
    }

    const handleUpload = async () => {
        if (!file) return

        setUploading(true)
        setValidationResult(null)

        try {
            // 1. Upload the file
            const formData = new FormData()
            formData.append('file', file)
            if (unidadeId) formData.append('unidade', unidadeId)

            const uploadResponse = await fetch('http://localhost:8000/api/v1/receipts/upload', {
                method: 'POST',
                body: formData,
            })

            if (!uploadResponse.ok) {
                throw new Error('Falha no upload')
            }

            const uploadData = await uploadResponse.json()
            const receiptId = uploadData.id

            // 2. Process OCR
            const ocrResponse = await fetch(
                `http://localhost:8000/api/v1/receipts/${receiptId}/process-ocr`,
                { method: 'POST' }
            )

            if (!ocrResponse.ok) {
                throw new Error('Falha no processamento OCR')
            }

            const ocrData = await ocrResponse.json()

            // 3. Validate against bank transactions
            if (ocrData.ocr_valor && ocrData.ocr_data) {
                const validationResponse = await fetch(
                    'http://localhost:8000/api/v1/pluggy/validate-receipt',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            valor: ocrData.ocr_valor,
                            data: ocrData.ocr_data,
                            condominio_id: condominioId,
                        }),
                    }
                )

                if (!validationResponse.ok) {
                    throw new Error('Falha na validação')
                }

                const validationData = await validationResponse.json()
                setValidationResult(validationData)
            } else {
                setValidationResult({
                    status: 'ERRO',
                    message: 'Não foi possível extrair valor ou data do comprovante',
                })
            }
        } catch (error) {
            console.error(error)
            setValidationResult({
                status: 'ERRO',
                message: 'Erro ao processar comprovante. Tente novamente.',
            })
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-2xl font-bold mb-6">Enviar Comprovante de Pagamento</h2>

                {/* Upload Area */}
                <div className="mb-6">
                    <label
                        htmlFor="file-upload"
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                            file
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-300 bg-gray-50 hover:bg-gray-100"
                        )}
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {file ? (
                                <>
                                    <FileText className="h-12 w-12 text-blue-600 mb-3" />
                                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {(file.size / 1024).toFixed(2)} KB
                                    </p>
                                </>
                            ) : (
                                <>
                                    <Upload className="h-12 w-12 text-gray-400 mb-3" />
                                    <p className="mb-2 text-sm text-gray-500">
                                        <span className="font-semibold">Clique para enviar</span> ou arraste o arquivo
                                    </p>
                                    <p className="text-xs text-gray-500">PDF, JPG ou PNG (máx. 10MB)</p>
                                </>
                            )}
                        </div>
                        <input
                            id="file-upload"
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                        />
                    </label>
                </div>

                {/* Upload Button */}
                <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className={cn(
                        "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors",
                        !file || uploading
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                    )}
                >
                    {uploading ? (
                        <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Processando...
                        </>
                    ) : (
                        <>
                            <Upload className="h-5 w-5" />
                            Enviar e Validar
                        </>
                    )}
                </button>

                {/* Validation Result */}
                {validationResult && (
                    <div className="mt-6">
                        {validationResult.status === 'APROVADO' ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <CheckCircle className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-bold text-green-900 text-lg">Pagamento Confirmado!</p>
                                        <p className="text-sm text-green-700 mt-1">{validationResult.message}</p>
                                        {validationResult.match_details && (
                                            <div className="mt-3 text-sm text-green-800 bg-green-100 rounded p-3">
                                                <p><strong>Valor:</strong> R$ {validationResult.match_details.amount?.toFixed(2)}</p>
                                                <p><strong>Data:</strong> {validationResult.match_details.date}</p>
                                                <p><strong>Descrição:</strong> {validationResult.match_details.description}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <XCircle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-bold text-red-900 text-lg">Pagamento Não Encontrado</p>
                                        <p className="text-sm text-red-700 mt-1">{validationResult.message}</p>
                                        <p className="text-xs text-red-600 mt-2">
                                            O comprovante foi enviado, mas não encontramos o pagamento no extrato bancário do condomínio.
                                            Entre em contato com a administração.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Info Box */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                        <strong>Como funciona:</strong> Ao enviar seu comprovante, o sistema valida automaticamente
                        se o pagamento foi recebido na conta do condomínio. Você receberá a confirmação em instantes.
                    </p>
                </div>
            </div>
        </div>
    )
}
