import { useState } from 'react'
import {
    AlertTriangle,
    Loader2,
    Building2,
    X,
    FileText,
    BadgeCheck,
    ShieldCheck,
    ShieldX,
    Sparkles,
    Leaf,
    Waves,
    Zap,
    Droplets,
    Flame,
    Wrench,
    BarChart3,
    Scale,
    Building,
    ClipboardList
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Transaction {
    id: string
    condominioId: string
    amount: number
    date: string
    description: string
}

interface ExpenseAuditFormProps {
    transaction: Transaction
    onClose: () => void
}

interface AuditResult {
    status: string
    fornecedor: any
    validacao_cnae: any
    relatorio_compliance: string
}

const SERVICE_TYPES = [
    { value: 'elevador', label: 'Manutenção de Elevador', icon: Building2 },
    { value: 'limpeza', label: 'Serviços de Limpeza', icon: Sparkles },
    { value: 'seguranca', label: 'Segurança/Portaria', icon: ShieldCheck },
    { value: 'jardinagem', label: 'Jardinagem', icon: Leaf },
    { value: 'piscina', label: 'Manutenção de Piscina', icon: Waves },
    { value: 'energia', label: 'Energia Elétrica', icon: Zap },
    { value: 'agua', label: 'Água/Esgoto', icon: Droplets },
    { value: 'gas', label: 'Gás', icon: Flame },
    { value: 'manutencao', label: 'Manutenção Predial', icon: Wrench },
    { value: 'contabilidade', label: 'Contabilidade', icon: BarChart3 },
    { value: 'advocacia', label: 'Advocacia', icon: Scale },
    { value: 'administracao', label: 'Administração', icon: Building },
    { value: 'outros', label: 'Outros', icon: ClipboardList }
]

// Mapeamento de CNAEs permitidos por tipo de serviço (Anti-Fraude)
const CNAE_MAP: Record<string, string[]> = {
    'elevador': ['4329103', '4329-1/03'],
    'limpeza': ['8121400', '8129900'],
    'seguranca': ['8011101', '8111700'],
    'jardinagem': ['8130300'],
    'piscina': ['8129900', '4329199'],
    'energia': ['3514000', '4321500'],
    'administracao': ['8211300', '6822600'],
    'contabilidade': ['6920601'],
}

export function ExpenseAuditForm({ transaction, onClose }: ExpenseAuditFormProps) {
    const { user } = useAuth()
    const [cnpj, setCnpj] = useState('')
    const [serviceType, setServiceType] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<AuditResult | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setResult(null)

        const cleanCnpj = cnpj.replace(/\D/g, '')

        try {
            // Consulta REAL via BrasilAPI (Gratuita)
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`)

            if (!response.ok) {
                if (response.status === 404) throw new Error('CNPJ não encontrado na base da Receita Federal.')
                throw new Error('Falha na consulta. Tente novamente em instantes.')
            }

            const data = await response.json()

            // --- LÓGICA DE AUDITORIA (Fluxo Mental) ---

            let status = 'APROVADO'
            let relatorio = 'Fornecedor ativo e sem irregularidades detectadas.'

            // 1. Verificação de Status Cadastral
            const isAtiva = data.descricao_situacao_cadastral === 'ATIVA' || data.situacao_cadastral === 2
            if (!isAtiva) {
                status = 'REJEITADO'
                relatorio = `CRÍTICO: Este CNPJ está com situação ${data.descricao_situacao_cadastral || 'INATIVA'}. Pagamento não recomendado.`
            }

            // 2. Verificação de CNAE (Compatibilidade de Serviço)
            if (status !== 'REJEITADO' && serviceType && CNAE_MAP[serviceType]) {
                const cnaeFornecedor = data.cnae_fiscal?.toString()
                const allowedCnaes = CNAE_MAP[serviceType]

                const hasMatch = allowedCnaes.some(code =>
                    code.replace(/\D/g, '') === cnaeFornecedor
                )

                if (!hasMatch) {
                    status = 'ALERTA'
                    relatorio = `SUSPEITA DE FRAUDE: A atividade principal desta empresa (${data.cnae_fiscal_descricao}) não é compatível com o serviço de ${SERVICE_TYPES.find(t => t.value === serviceType)?.label}.`
                }
            }

            setResult({
                status: status,
                fornecedor: {
                    razao_social: data.razao_social,
                    status_cadastral: data.descricao_situacao_cadastral || (data.situacao_cadastral === 2 ? 'ATIVA' : 'INATIVA'),
                    cnae_principal: data.cnae_fiscal,
                    descricao_cnae: data.cnae_fiscal_descricao
                },
                validacao_cnae: {
                    compativel: status === 'APROVADO',
                    score: status === 'APROVADO' ? 100 : 30
                },
                relatorio_compliance: relatorio
            })

        } catch (error: any) {
            console.error('Erro na auditoria:', error)
            alert(error.message || 'Erro ao validar CNPJ')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveAudit = async () => {
        if (!result || !user) return
        setLoading(true)
        try {
            const auditStatus = result.status === 'APROVADO'
                ? 'auditado'
                : result.status === 'ALERTA'
                    ? 'alerta'
                    : 'rejeitado'
            const fraudScore = result.status === 'APROVADO'
                ? 0
                : result.status === 'ALERTA'
                    ? 45
                    : 90
            const fraudFlags = result.status === 'APROVADO'
                ? []
                : result.status === 'ALERTA'
                    ? ['CNAE_INCOMPATIVEL']
                    : ['CNPJ_IRREGULAR']
            const cleanCnpj = cnpj.replace(/\D/g, '')
            const serviceLabel = SERVICE_TYPES.find(t => t.value === serviceType)?.label || serviceType

            const { error: updateError } = await supabase
                .from('comprovantes')
                .update({
                    ocr_cnpj: cleanCnpj,
                    ocr_razao_social: result.fornecedor?.razao_social || null,
                    cnpj_status: result.fornecedor?.status_cadastral || null,
                    natureza_servico: serviceLabel,
                    status_auditoria: auditStatus,
                    fraud_score: fraudScore,
                    fraud_flags: fraudFlags,
                    motivo_rejeicao: auditStatus === 'rejeitado' ? result.relatorio_compliance : null,
                    aprovado_por: auditStatus === 'auditado' ? user.id : null,
                    aprovado_em: auditStatus === 'auditado' ? new Date().toISOString() : null,
                })
                .eq('id', transaction.id)

            if (updateError) throw updateError

            const { error: logError } = await supabase.from('audit_acoes').insert({
                comprovante_id: transaction.id,
                condominio_id: transaction.condominioId,
                usuario_id: user.id,
                usuario_nome: user.nome || user.email,
                acao: auditStatus === 'auditado' ? 'aprovado' : auditStatus === 'rejeitado' ? 'rejeitado' : 'solicitado_esclarecimento',
                motivo: result.relatorio_compliance,
                fraud_score_na_acao: fraudScore
            })

            if (logError) throw logError
            onClose()
        } catch (err) {
            console.error('Erro ao salvar auditoria:', err)
            alert('Falha ao salvar auditoria no banco de dados.')
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
                            <p className="text-sm text-gray-500">Validação via Receita Federal (BrasilAPI)</p>
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
                                    Tipo de Serviço para Conferência
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
                                            <type.icon className="h-5 w-5 text-blue-600" aria-hidden="true" />
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
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading || !cnpj || !serviceType}
                                className={cn(
                                    "w-full btn",
                                    loading || !cnpj || !serviceType
                                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                        : "btn-primary shadow-lg shadow-blue-200"
                                )}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Consultando RFB (BrasilAPI)...
                                    </>
                                ) : (
                                    <>
                                        <BadgeCheck className="h-5 w-5" />
                                        Executar Auditoria Real
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
                                                    ? 'Alerta de Inconsistência'
                                                    : 'Fornecedor Rejeitado'}
                                        </h3>
                                        <p className="text-sm mt-1 font-medium">{result.relatorio_compliance}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Supplier Details */}
                            {result.fornecedor && (
                                <div className="card border-gray-200">
                                    <div className="card-header bg-gray-50/50">
                                        <h4 className="text-sm font-semibold text-gray-900">Dados Oficiais (Receita Federal)</h4>
                                    </div>
                                    <div className="card-body space-y-3">
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                            <span className="text-sm text-gray-500">Razão Social</span>
                                            <span className="text-sm font-semibold text-gray-900 text-right ml-4">
                                                {result.fornecedor.razao_social}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                            <span className="text-sm text-gray-500">Situação Cadastral</span>
                                            <span className={cn(
                                                "text-xs font-bold px-2.5 py-1 rounded-full",
                                                result.fornecedor.status_cadastral === 'ATIVA'
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : "bg-rose-100 text-rose-700"
                                            )}>
                                                {result.fornecedor.status_cadastral}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                            <span className="text-sm text-gray-500">CNPJ Consultado</span>
                                            <span className="text-sm font-mono text-gray-900 font-medium">
                                                {cnpj}
                                            </span>
                                        </div>
                                        <div className="py-2">
                                            <span className="text-sm text-gray-500 block mb-1">CNAE Principal</span>
                                            <span className="text-xs font-medium text-gray-900 bg-gray-100 p-2 rounded block">
                                                {result.fornecedor.cnae_principal} - {result.fornecedor.descricao_cnae}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setResult(null)}
                                    className="flex-1 btn btn-secondary"
                                    disabled={loading}
                                >
                                    Nova Consulta
                                </button>
                                <button
                                    onClick={handleSaveAudit}
                                    className={cn(
                                        "flex-1 btn",
                                        result.status === 'REJEITADO' ? "btn-danger" : "btn-primary"
                                    )}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <BadgeCheck className="h-4 w-4" />
                                            Concluir & Gravar Auditoria
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
