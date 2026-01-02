import { useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Loader2, Building2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Transaction {
    id: string
    amount: number
    date: string
    description: string
}

interface ExpenseAuditFormProps {
    transaction: Transaction
    condominioId: string
    onClose: () => void
}

interface AuditResult {
    status: string
    fornecedor: any
    validacao_cnae: any
    relatorio_compliance: string
}

const SERVICE_TYPES = [
    { value: 'elevador', label: 'Manutenção de Elevador' },
    { value: 'limpeza', label: 'Serviços de Limpeza' },
    { value: 'seguranca', label: 'Segurança/Portaria' },
    { value: 'jardinagem', label: 'Jardinagem' },
    { value: 'piscina', label: 'Manutenção de Piscina' },
    { value: 'energia', label: 'Energia Elétrica' },
    { value: 'agua', label: 'Água/Esgoto' },
    { value: 'gas', label: 'Gás' },
    { value: 'manutencao', label: 'Manutenção Predial' },
    { value: 'contabilidade', label: 'Contabilidade' },
    { value: 'advocacia', label: 'Advocacia' },
    { value: 'administracao', label: 'Administração' },
    { value: 'outros', label: 'Outros' }
]

export function ExpenseAuditForm({ transaction, condominioId, onClose }: ExpenseAuditFormProps) {
    const [cnpj, setCnpj] = useState('')
    const [servico, setServico] = useState('')
    const [serviceType, setServiceType] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<AuditResult | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setResult(null)

        try {
            const response = await fetch('http://localhost:8000/api/v1/audit/expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transaction_id_pluggy: transaction.id,
                    cnpj_fornecedor: cnpj,
                    codigo_servico: servico,
                    service_type: serviceType,
                    condominio_id: condominioId
                })
            })

            if (!response.ok) {
                throw new Error('Falha na auditoria')
            }

            const data = await response.json()
            setResult(data)
        } catch (error) {
            console.error(error)
            alert('Erro ao auditar fornecedor. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    const formatCNPJ = (value: string) => {
        const numbers = value.replace(/\D/g, '')
        if (numbers.length <= 14) {
            return numbers
                .replace(/(\d{2})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1/$2')
                .replace(/(\d{4})(\d)/, '$1-$2')
        }
        return value
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold">Auditar Fornecedor</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Transaction Info */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-semibold mb-2">Transação</h3>
                        <p className="text-sm text-gray-600">{transaction.description}</p>
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-sm text-gray-500">{transaction.date}</span>
                            <span className="text-lg font-bold text-red-600">
                                - R$ {transaction.amount.toFixed(2)}
                            </span>
                        </div>
                    </div>

                    {/* Form */}
                    {!result && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    CNPJ do Fornecedor
                                </label>
                                <input
                                    type="text"
                                    value={cnpj}
                                    onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                                    placeholder="00.000.000/0000-00"
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Descrição do Serviço
                                </label>
                                <input
                                    type="text"
                                    value={servico}
                                    onChange={(e) => setServico(e.target.value)}
                                    placeholder="Ex: Manutenção de Elevador"
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Informe o serviço conforme nota fiscal
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Tipo de Serviço
                                </label>
                                <select
                                    value={serviceType}
                                    onChange={(e) => setServiceType(e.target.value)}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                >
                                    <option value="">Selecione o tipo de serviço</option>
                                    {SERVICE_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    Usado para validar o CNAE do fornecedor
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className={cn(
                                    "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition",
                                    loading
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-blue-600 text-white hover:bg-blue-700"
                                )}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Auditando...
                                    </>
                                ) : (
                                    <>
                                        <Building2 className="h-5 w-5" />
                                        Validar Fornecedor
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="space-y-4">
                            {/* Status Badge */}
                            <div
                                className={cn(
                                    "p-4 rounded-lg border-2",
                                    result.status === 'APROVADO'
                                        ? "bg-green-50 border-green-200"
                                        : result.status === 'ALERTA'
                                            ? "bg-yellow-50 border-yellow-200"
                                            : "bg-red-50 border-red-200"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    {result.status === 'APROVADO' ? (
                                        <CheckCircle className="h-6 w-6 text-green-600 mt-0.5" />
                                    ) : result.status === 'ALERTA' ? (
                                        <AlertTriangle className="h-6 w-6 text-yellow-600 mt-0.5" />
                                    ) : (
                                        <XCircle className="h-6 w-6 text-red-600 mt-0.5" />
                                    )}
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg mb-2">
                                            {result.status === 'APROVADO'
                                                ? '✅ Fornecedor Aprovado'
                                                : result.status === 'ALERTA'
                                                    ? '⚠️ Alerta Detectado'
                                                    : '❌ Fornecedor Rejeitado'}
                                        </h3>
                                        <p className="text-sm">{result.relatorio_compliance}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Supplier Info */}
                            {result.fornecedor && (
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <h4 className="font-semibold mb-3">Dados do Fornecedor (RFB)</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Razão Social:</span>
                                            <span className="font-medium">{result.fornecedor.razao_social}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Status Cadastral:</span>
                                            <span
                                                className={cn(
                                                    "font-medium",
                                                    result.fornecedor.status_cadastral === 'ATIVA'
                                                        ? "text-green-600"
                                                        : "text-red-600"
                                                )}
                                            >
                                                {result.fornecedor.status_cadastral}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">CNAE:</span>
                                            <span className="font-medium">{result.fornecedor.cnae_principal}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Atividade:</span>
                                            <span className="font-medium">{result.fornecedor.descricao_cnae}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setResult(null)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Nova Auditoria
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
