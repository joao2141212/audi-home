import { useState } from 'react'
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Loader, BarChart3, Bot, Coins, Database, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

interface UploadedFile {
    id: string
    file: File
    status: 'uploading' | 'success' | 'error'
    data?: any
    error?: string
}

export function UploadComprovantes() {
    const [files, setFiles] = useState<UploadedFile[]>([])
    const [isDragging, setIsDragging] = useState(false)

    const supportedExtensions = /\.(pdf|doc|docx|odt|txt|rtf|csv|json|xml|html?|xls|xlsx|ppt|pptx|jpg|jpeg|png|webp|heic|heif|bmp|gif|tif|tiff)$/i

    const getMimeType = (file: File) => {
        if (file.type) return file.type
        const extension = file.name.split('.').pop()?.toLowerCase()
        const mimeByExtension: Record<string, string> = {
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            odt: 'application/vnd.oasis.opendocument.text',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            txt: 'text/plain',
            rtf: 'text/rtf',
            csv: 'text/csv',
            json: 'application/json',
            xml: 'application/xml',
            html: 'text/html',
            htm: 'text/html',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            heic: 'image/heic',
            heif: 'image/heif',
            bmp: 'image/bmp',
            gif: 'image/gif',
            tif: 'image/tiff',
            tiff: 'image/tiff',
        }
        return extension ? mimeByExtension[extension] || 'application/octet-stream' : 'application/octet-stream'
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const droppedFiles = Array.from(e.dataTransfer.files)
        const validFiles = droppedFiles.filter(f => supportedExtensions.test(f.name))

        if (validFiles.length === 0) {
            alert('Formatos suportados: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT/RTF/CSV, XML/JSON/HTML e imagens JPG/PNG/WebP/HEIC')
            return
        }

        uploadFiles(validFiles)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files)
            uploadFiles(selectedFiles)
        }
    }

    const uploadFiles = async (fileList: File[]) => {
        const newFiles = fileList.map(file => ({
            id: Math.random().toString(36).substring(7),
            file,
            status: 'uploading' as const
        }))

        setFiles(prev => [...prev, ...newFiles])

        const markInitialError = (message: string) => setFiles(prev => prev.map(file =>
            newFiles.some(candidate => candidate.id === file.id)
                ? { ...file, status: 'error', error: message }
                : file
        ))

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            markInitialError('Sua sessão expirou. Entre novamente para enviar o comprovante.')
            return
        }

        const { data: profile, error: profileError } = await supabase
            .from('perfis')
            .select('condominio_id')
            .eq('id', user.id)
            .single()

        if (profileError || !profile?.condominio_id) {
            markInitialError('Não foi possível identificar o condomínio da sessão.')
            return
        }

        const condominioId = profile.condominio_id

        for (const uploadedFile of newFiles) {
            try {
                // Converter para Base64 para a Edge Function
                const reader = new FileReader()
                const fileBase64 = await new Promise<string>((resolve) => {
                    reader.onload = () => resolve(reader.result?.toString().split(',')[1] || '')
                    reader.readAsDataURL(uploadedFile.file)
                })

                const mimeType = getMimeType(uploadedFile.file)
                const storagePath = `${condominioId}/${crypto.randomUUID()}-${uploadedFile.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
                const { error: storageError } = await supabase.storage
                    .from('comprovantes')
                    .upload(storagePath, uploadedFile.file, { contentType: mimeType, upsert: false })
                if (storageError) throw new Error(`Falha ao armazenar o arquivo: ${storageError.message}`)

                const { data: receipt, error: receiptError } = await supabase
                    .from('comprovantes')
                    .insert({
                        condominio_id: condominioId,
                        arquivo_nome: uploadedFile.file.name,
                        arquivo_url: storagePath,
                        tipo_arquivo: mimeType,
                        status: 'pendente',
                    })
                    .select('id')
                    .single()
                if (receiptError || !receipt?.id) {
                    await supabase.storage.from('comprovantes').remove([storagePath])
                    throw new Error(`Falha ao registrar o comprovante: ${receiptError?.message || 'ID ausente'}`)
                }

                const { data, error } = await supabase.functions.invoke('process-comprovante', {
                    body: {
                        comprovante_id: receipt.id,
                        file_base64: fileBase64,
                        mime_type: mimeType,
                        filename: uploadedFile.file.name,
                    }
                })

                if (error) throw error

                setFiles(prev => prev.map(f =>
                    f.id === uploadedFile.id
                        ? { ...f, status: 'success', data }
                        : f
                ))
            } catch (error) {
                console.error("Link error:", error)
                setFiles(prev => prev.map(f =>
                    f.id === uploadedFile.id
                        ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Erro ao processar' }
                        : f
                ))
            }
        }
    }

    const stats = {
        total: files.length,
        success: files.filter(f => f.status === 'success').length,
        error: files.filter(f => f.status === 'error').length,
        processing: files.filter(f => f.status === 'uploading').length
    }

    const getStatusIcon = (status: UploadedFile['status']) => {
        switch (status) {
            case 'uploading':
                return <Loader className="h-5 w-5 text-blue-600 animate-spin" />
            case 'success':
                return <CheckCircle className="h-5 w-5 text-emerald-600" />
            case 'error':
                return <XCircle className="h-5 w-5 text-rose-600" />
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900">Upload de Comprovantes</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Envie notas fiscais (XML) ou comprovantes (JSON) para reconciliação automática
                    </p>
                </div>
            </div>

            {/* Upload Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "card p-12 border-2 border-dashed transition-colors cursor-pointer",
                    isDragging
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 hover:border-gray-400"
                )}
            >
                <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.odt,.txt,.rtf,.csv,.json,.xml,.html,.htm,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.heic,.heif,.bmp,.gif,.tif,.tiff"
                    multiple
                    onChange={handleFileSelect}
                />

                <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="flex flex-col items-center text-center">
                        <div className={cn(
                            "p-4 rounded-full mb-4 transition-colors",
                            isDragging ? "bg-blue-100" : "bg-gray-100"
                        )}>
                            <Upload className={cn(
                                "h-12 w-12",
                                isDragging ? "text-blue-600" : "text-gray-400"
                            )} />
                        </div>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            Arraste arquivos aqui
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">
                            ou clique para selecionar
                        </p>
                        <p className="text-xs text-gray-400">
                            Formatos suportados: PDF, DOC/DOCX/ODT, XLS/XLSX, PPT/PPTX, TXT/RTF/CSV, XML/JSON/HTML e imagens JPG/PNG/WEBP/HEIC/BMP/GIF/TIFF (até 12 MB)
                        </p>
                    </div>
                </label>
            </div>

            {/* Progress Summary */}
            {files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="card p-4 bg-white">
                        <p className="text-xs text-gray-500 uppercase font-semibold">Total</p>
                        <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                    </div>
                    <div className="card p-4 bg-emerald-50 border-emerald-100">
                        <p className="text-xs text-emerald-600 uppercase font-semibold">Sucesso</p>
                        <p className="text-xl font-bold text-emerald-700">{stats.success}</p>
                    </div>
                    <div className="card p-4 bg-rose-50 border-rose-100">
                        <p className="text-xs text-rose-600 uppercase font-semibold">Erro</p>
                        <p className="text-xl font-bold text-rose-700">{stats.error}</p>
                    </div>
                    <div className="card p-4 bg-blue-50 border-blue-100">
                        <p className="text-xs text-blue-600 uppercase font-semibold">Processando</p>
                        <p className="text-xl font-bold text-blue-700">{stats.processing}</p>
                    </div>
                </div>
            )}

            {/* Uploaded Files */}
            {files.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Fila de Processamento
                        </h3>
                        {stats.processing === 0 && (
                            <button
                                onClick={() => setFiles([])}
                                className="text-sm text-rose-600 hover:text-rose-700 font-medium"
                            >
                                Limpar Lista
                            </button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {files.map((uploadedFile) => (
                            <div
                                key={uploadedFile.id}
                                className={cn(
                                    "card p-4 transition-all",
                                    uploadedFile.status === 'success' && "border-emerald-200 bg-emerald-50",
                                    uploadedFile.status === 'error' && "border-rose-200 bg-rose-50"
                                )}
                            >
                                <div className="flex items-start gap-4">
                                    {/* Icon */}
                                    <div className="mt-1">
                                        <FileText className="h-6 w-6 text-gray-400" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900 truncate">
                                                    {uploadedFile.file.name}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    {(uploadedFile.file.size / 1024).toFixed(1)} KB
                                                </p>
                                            </div>

                                            {/* Status */}
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(uploadedFile.status)}
                                                <span className={cn(
                                                    "text-sm font-medium capitalize",
                                                    uploadedFile.status === 'success' && "text-emerald-600",
                                                    uploadedFile.status === 'error' && "text-rose-600",
                                                    uploadedFile.status === 'uploading' && "text-blue-600"
                                                )}>
                                                    {uploadedFile.status === 'uploading' && 'Processando...'}
                                                    {uploadedFile.status === 'success' && 'Sucesso'}
                                                    {uploadedFile.status === 'error' && 'Erro'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Success Details */}
                                        {uploadedFile.status === 'success' && uploadedFile.data && (
                                            <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-200">
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div>
                                                        <span className="text-gray-500">Fornecedor:</span>
                                                        <p className="font-medium text-gray-900">
                                                            {uploadedFile.data.dados_extraidos?.razao_social_emissor || uploadedFile.data.ocr_raw?.nf?.razao_social_emissor || 'Não identificado'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">CNPJ:</span>
                                                        <p className="font-medium text-gray-900">
                                                            {uploadedFile.data.dados_extraidos?.cnpj_emissor || uploadedFile.data.ocr_raw?.nf?.cnpj_emissor || 'Não identificado'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Valor:</span>
                                                        <p className="font-medium text-emerald-600">
                                                            {formatCurrency(Number(uploadedFile.data.dados_extraidos?.valor_total ?? uploadedFile.data.ocr_raw?.nf?.valor_total ?? 0))}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Data:</span>
                                                        <p className="font-medium text-gray-900">
                                                            {uploadedFile.data.dados_extraidos?.data_emissao || uploadedFile.data.ocr_raw?.nf?.data_emissao
                                                                ? new Date(uploadedFile.data.dados_extraidos?.data_emissao || uploadedFile.data.ocr_raw?.nf?.data_emissao).toLocaleDateString('pt-BR')
                                                                : 'Não identificada'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Processing Info - Transparência */}
                                                {uploadedFile.data.processamento && (
                                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                                                                Detalhes do Processamento
                                                            </span>
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 text-xs">
                                                            <span className={cn(
                                                                "px-2 py-1 rounded-full font-medium",
                                                                uploadedFile.data.processamento.metodo === 'gemini_ai'
                                                                    ? "bg-purple-100 text-purple-700"
                                                                    : "bg-blue-100 text-blue-700"
                                                            )}>
                                                                <span className="inline-flex items-center gap-1">
                                                                    {uploadedFile.data.processamento.metodo === 'gemini_ai'
                                                                        ? <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                                                                        : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
                                                                    {uploadedFile.data.processamento.metodo === 'gemini_ai' ? 'IA' : 'Parser Nativo'}
                                                                </span>
                                                            </span>
                                                            {uploadedFile.data.processamento.modelo && (
                                                                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                                                                    Modelo: {uploadedFile.data.processamento.modelo}
                                                                </span>
                                                            )}
                                                            {uploadedFile.data.processamento.tokens_total > 0 && (
                                                                <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                                                                    Tokens: {uploadedFile.data.processamento.tokens_total}
                                                                    <span className="text-amber-500 ml-1">
                                                                        (in: {uploadedFile.data.processamento.tokens_input}, out: {uploadedFile.data.processamento.tokens_output})
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {uploadedFile.data.processamento.tokens_total === 0 && (
                                                                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                                                                        Custo zero
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Storage Info - Onde foi salvo */}
                                                {uploadedFile.data.armazenamento && (
                                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                                                                Armazenamento
                                                            </span>
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div>
                                                                <span className="text-gray-500">Local:</span>
                                                                <p className={cn(
                                                                    "font-medium",
                                                                    uploadedFile.data.armazenamento.persistente
                                                                        ? "text-emerald-600"
                                                                        : "text-amber-600"
                                                                )}>
                                                                    {uploadedFile.data.armazenamento.local}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-500">Tabela:</span>
                                                                <p className="font-medium text-gray-900">
                                                                    {uploadedFile.data.armazenamento.tabela}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-500">ID Registro:</span>
                                                                <p className="font-medium text-gray-900 font-mono text-[10px]">
                                                                    {uploadedFile.data.armazenamento.registro_id}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-500">Timestamp:</span>
                                                                <p className="font-medium text-gray-900">
                                                                    {new Date(uploadedFile.data.armazenamento.timestamp).toLocaleString('pt-BR')}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {!uploadedFile.data.armazenamento.persistente && (
                                                            <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                                                                Dados em memória volátil. Serão perdidos ao reiniciar o servidor.
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                {/* Reconciliation Status */}
                                                {uploadedFile.data.reconciliacao && (
                                                    <div className="mt-3 pt-3 border-t border-emerald-200">
                                                        {uploadedFile.data.reconciliacao.sugestoes_criadas > 0 ? (
                                                            <div className="flex items-center gap-2 text-emerald-700">
                                                                <CheckCircle className="h-4 w-4" />
                                                                <span className="text-sm font-medium">
                                                                    {uploadedFile.data.reconciliacao.sugestoes_criadas} match(es) sugerido(s)
                                                                    {uploadedFile.data.reconciliacao.auto_aprovadas > 0 &&
                                                                        ` (${uploadedFile.data.reconciliacao.auto_aprovadas} auto-aprovado)`
                                                                    }
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 text-amber-700">
                                                                <AlertCircle className="h-4 w-4" />
                                                                <span className="text-sm">
                                                                    Nenhuma transação compatível encontrada
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Error Details */}
                                        {uploadedFile.status === 'error' && (
                                            <div className="mt-2 p-2 bg-rose-100 rounded text-sm text-rose-700">
                                                {uploadedFile.error || 'Erro desconhecido'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Help Text */}
            {files.length === 0 && (
                <div className="card p-6 bg-blue-50 border-blue-200">
                    <div className="flex gap-3">
                        <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-medium text-blue-900 mb-1">Como funciona?</h4>
                            <ul className="text-sm text-blue-700 space-y-1">
                                <li>1. Faça upload de PDF, DOC/DOCX, foto/scan ou arquivo textual</li>
                                <li>2. O sistema extrai automaticamente: fornecedor, CNPJ, valor e data</li>
                                <li>3. Busca transações bancárias compatíveis (valor ±R$0,05, data ±3 dias)</li>
                                <li>4. Sugere reconciliações automáticas na fila para aprovação</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
