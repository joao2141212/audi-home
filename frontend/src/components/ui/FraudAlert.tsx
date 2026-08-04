import { AlertTriangle, Shield, FileWarning, Copy, Edit, FileX, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/utils'


interface FraudAlertBadgeProps {
    receipt: {
        fraud_score: number
        fraud_flags?: Record<string, any>
        documento_alterado: boolean
        status: string
    }
}

export function FraudAlertBadge({ receipt }: FraudAlertBadgeProps) {
    const { fraud_score, fraud_flags, documento_alterado, status } = receipt

    if (fraud_score === 0 || status === 'aprovado') {
        return null
    }

    const getSeverity = () => {
        if (fraud_score >= 70) return 'critical'
        if (fraud_score >= 40) return 'high'
        if (fraud_score >= 20) return 'medium'
        return 'low'
    }

    const severity = getSeverity()

    const severityConfig = {
        critical: {
            bg: 'bg-red-100',
            text: 'text-red-800',
            border: 'border-red-300',
            icon: FileX,
            label: 'FRAUDE DETECTADA'
        },
        high: {
            bg: 'bg-orange-100',
            text: 'text-orange-800',
            border: 'border-orange-300',
            icon: AlertTriangle,
            label: 'ALTO RISCO'
        },
        medium: {
            bg: 'bg-yellow-100',
            text: 'text-yellow-800',
            border: 'border-yellow-300',
            icon: FileWarning,
            label: 'SUSPEITO'
        },
        low: {
            bg: 'bg-blue-100',
            text: 'text-blue-800',
            border: 'border-blue-300',
            icon: Shield,
            label: 'ATENÇÃO'
        }
    }

    const config = severityConfig[severity]
    const Icon = config.icon

    const getFlagLabel = (flag: string): { icon: any; label: string } => {
        const flagMap: Record<string, { icon: any; label: string }> = {
            'duplicate_file': { icon: Copy, label: 'Arquivo duplicado' },
            'edited_with_photoshop': { icon: Edit, label: 'Editado com Photoshop' },
            'edited_with_canva': { icon: Edit, label: 'Editado com Canva' },
            'pdf_created_with_editor': { icon: Edit, label: 'PDF criado com editor' },
            'no_exif_data': { icon: FileWarning, label: 'Sem metadados EXIF' },
            'modified_after_creation': { icon: Edit, label: 'Modificado após criação' },
            'screenshot_detected': { icon: FileWarning, label: 'Screenshot detectado' },
            'pdf_modified_after_creation': { icon: Edit, label: 'PDF modificado' },
            'barcode_value_mismatch': { icon: AlertTriangle, label: 'Valor do código de barras divergente' },
            'file_too_small': { icon: FileWarning, label: 'Arquivo muito pequeno' },
            'file_too_large': { icon: FileWarning, label: 'Arquivo muito grande' }
        }

        return flagMap[flag] || { icon: AlertTriangle, label: flag }
    }

    return (
        <div className={cn(
            "border-2 rounded-lg p-4",
            config.bg,
            config.text,
            config.border
        )}>
            <div className="flex items-start gap-3">
                <Icon className="h-6 w-6 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-lg">{config.label}</h4>
                        <span className="text-2xl font-bold">{fraud_score.toFixed(0)}%</span>
                    </div>

                    {documento_alterado && (
                        <p className="font-semibold mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Documento apresenta sinais de alteração
                        </p>
                    )}

                    {fraud_flags && fraud_flags.flags && fraud_flags.flags.length > 0 && (
                        <div className="space-y-1 mt-3">
                            <p className="text-sm font-medium">Problemas detectados:</p>
                            <ul className="space-y-1">
                                {fraud_flags.flags.map((flag: string, index: number) => {
                                    const { icon: FlagIcon, label } = getFlagLabel(flag)
                                    return (
                                        <li key={index} className="flex items-center gap-2 text-sm">
                                            <FlagIcon className="h-4 w-4" />
                                            {label}
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )}

                    {severity === 'critical' && (
                        <div className="mt-3 pt-3 border-t border-red-300">
                            <p className="text-sm font-semibold flex items-start gap-1.5">
                                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                                Ação recomendada: Rejeitar comprovante e solicitar novo documento
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export function FraudScoreBadge({ score }: { score: number }) {
    const getColor = () => {
        if (score >= 70) return 'bg-red-600 text-white'
        if (score >= 40) return 'bg-orange-600 text-white'
        if (score >= 20) return 'bg-yellow-600 text-white'
        return 'bg-green-600 text-white'
    }

    if (score === 0) {
        return (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-green-600 text-white">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Verificado
            </span>
        )
    }

    return (
        <span className={cn("px-3 py-1 rounded-full text-xs font-bold", getColor())}>
            Risco: {score.toFixed(0)}%
        </span>
    )
}
