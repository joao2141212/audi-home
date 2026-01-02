import { useState } from 'react'
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    Building2,
    X,
    FileText,
    BadgeCheck,
    ShieldCheck,
    ShieldX
} from 'lucide-react'
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
    { value: 'elevador', label: 'Manutenção de Elevador', icon: '🛗' },
    { value: 'limpeza', label: 'Serviços de Limpeza', icon: '🧹' },
    { value: 'seguranca', label: 'Segurança/Portaria', icon: '🛡️' },
    { value: 'jardinagem', label: 'Jardinagem', icon: '🌿' },
    { value: 'piscina', label: 'Manutenção de Piscina', icon: '🏊' },
    { value: 'energia', label: 'Energia Elétrica', icon: '⚡' },
    { value: 'agua', label: 'Água/Esgoto', icon: '💧' },
    { value: 'gas', label: 'Gás', icon: '🔥' },
    { value: 'manutencao', label: 'Manutenção Predial', icon: '🔧' },
    { value: 'contabilidade', label: 'Contabilidade', icon: '📊' },
    { value: 'advocacia', label: 'Advocacia', icon: '⚖️' },
    { value: 'administracao', label: 'Administração', icon: '🏢' },
    { value: 'outros', label: 'Outros', icon: '📋' }
]

// Mock result for demo
const mockAuditResult: AuditResult = {
    status: 'APROVADO',
    fornecedor: {
        razao_social: 'ATLAS SCHINDLER S.A.',
        status_cadastral: 'ATIVA',
        cnae_principal: '4329-1/03',
        descricao_cnae: 'Instalação, manutenção e reparação de elevadores, escadas e esteiras rolantes'
    },
    validacao_cnae: {
        compativel: true,
        score: 95
    },
    relatorio_compliance: 'Fornecedor ativo na Receita Federal com CNAE compatível para serviços de manutenção de elevadores. Sem irregularidades detectadas.'
}

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

        // Simulate API call for demo
        setTimeout(() => {
            setResult(mockAuditResult)
            setLoading(false)
        }, 2000)
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Building2 className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Auditar Fornecedor</h2>
                            <p className="text-sm text-gray-500">Validação via Receita Federal</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                    {/* Transaction Card */}
                    <div className="mb-6 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm">
                                <FileText className="h-4 w-4 text-gray-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{transaction.description}</p>
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-sm text-gray-500">
                                        {new Date(transaction.date).toLocaleDateString('pt-BR')}
                                    </span>
                                    <span className="text-lg font-bold text-rose-600">
                                        - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.amount)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Form */}
                    {!result && (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* CNPJ */}
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
                                    maxLength={18}
                                    className="w-full font-mono"
                                />
                            </div>

                            {/* Service Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Tipo de Serviço
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {SERVICE_TYPES.slice(0, 6).map((type) => (
                                        <button
                                            key={type.value}
                                            type="button"
                                            onClick={() => setServiceType(type.value)}
                                            className={cn(
                                                "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center",
                                                serviceType === type.value
                                                    ? "border-blue-500 bg-blue-50"
                                                    : "border-gray-200 hover:border-gray-300"
                                            )}
                                        >
                                            <span className="text-lg">{type.icon}</span>
                                            <span className="text-xs font-medium text-gray-700">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                                <select
                                    value={serviceType}
                                    onChange={(e) => setServiceType(e.target.value)}
                                    className="w-full mt-2"
                                >
                                    <option value="">Ou selecione outro...</option>
                                    {SERVICE_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {type.icon} {type.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Descrição do Serviço (NF)
                                </label>
                                <input
                                    type="text"
                                    value={servico}
                                    onChange={(e) => setServico(e.target.value)}
                                    placeholder="Conforme nota fiscal"
                                    className="w-full"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading || !cnpj || !serviceType}
                                className={cn(
                                    "w-full btn",
                                    loading || !cnpj || !serviceType
                                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                        : "btn-primary"
                                )}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Consultando RFB...
                                    </>
                                ) : (
                                    <>
                                        <BadgeCheck className="h-5 w-5" />
                                        Validar Fornecedor
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Status Card */}
                            <div
                                className={cn(
                                    "p-5 rounded-xl border-2",
                                    result.status === 'APROVADO'
                                        ? "bg-emerald-50 border-emerald-200"
                                        : result.status === 'ALERTA'
                                            ? "bg-amber-50 border-amber-200"
                                            : "bg-rose-50 border-rose-200"
                                )}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={cn(
                                        "p-3 rounded-full",
                                        result.status === 'APROVADO' ? "bg-emerald-100" :
                                            result.status === 'ALERTA' ? "bg-amber-100" : "bg-rose-100"
                                    )}>
                                        {result.status === 'APROVADO' ? (
                                            <ShieldCheck className="h-6 w-6 text-emerald-600" />
                                        ) : result.status === 'ALERTA' ? (
                                            <AlertTriangle className="h-6 w-6 text-amber-600" />
                                        ) : (
                                            <ShieldX className="h-6 w-6 text-rose-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={cn(
                                            "font-semibold text-lg",
                                            result.status === 'APROVADO' ? "text-emerald-800" :
                                                result.status === 'ALERTA' ? "text-amber-800" : "text-rose-800"
                                        )}>
                                            {result.status === 'APROVADO'
                                                ? 'Fornecedor Aprovado'
                                                : result.status === 'ALERTA'
                                                    ? 'Alerta Detectado'
                                                    : 'Fornecedor Rejeitado'}
                                        </h3>
                                        <p className="text-sm mt-1 opacity-80">{result.relatorio_compliance}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Supplier Details */}
                            {result.fornecedor && (
                                <div className="card">
                                    <div className="card-header">
                                        <h4 className="text-sm font-semibold text-gray-900">Dados do Fornecedor (RFB)</h4>
                                    </div>
                                    <div className="card-body space-y-3">
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                            <span className="text-sm text-gray-500">Razão Social</span>
                                            <span className="text-sm font-medium text-gray-900">{result.fornecedor.razao_social}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                            <span className="text-sm text-gray-500">Situação Cadastral</span>
                                            <span className={cn(
                                                "text-sm font-medium px-2 py-0.5 rounded-full",
                                                result.fornecedor.status_cadastral === 'ATIVA'
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : "bg-rose-100 text-rose-700"
                                            )}>
                                                {result.fornecedor.status_cadastral}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                            <span className="text-sm text-gray-500">CNAE Principal</span>
                                            <span className="text-sm font-mono text-gray-900">{result.fornecedor.cnae_principal}</span>
                                        </div>
                                        <div className="py-2">
                                            <span className="text-sm text-gray-500 block mb-1">Atividade</span>
                                            <span className="text-sm text-gray-900">{result.fornecedor.descricao_cnae}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setResult(null)}
                                    className="flex-1 btn btn-secondary"
                                >
                                    Nova Consulta
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 btn btn-primary"
                                >
                                    Concluir
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
