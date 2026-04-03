import { useState } from 'react'
import { DollarSign, Calendar, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

interface FormData {
    data: string
    descricao: string
    valor: string
    type: 'CREDIT' | 'DEBIT'
}

interface SubmitResult {
    status: 'idle' | 'loading' | 'success' | 'error'
    message?: string
    data?: any
}

export function AddTransactionForm() {
    const CONDOMINIO_ID = 'demo_condo_1'

    const [formData, setFormData] = useState<FormData>({
        data: new Date().toISOString().split('T')[0],
        descricao: '',
        valor: '',
        type: 'DEBIT'
    })

    const [result, setResult] = useState<SubmitResult>({ status: 'idle' })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setResult({ status: 'loading' })

        // Validações básicas
        if (!formData.descricao || formData.descricao.length < 3) {
            setResult({
                status: 'error',
                message: 'Descrição deve ter ao menos 3 caracteres'
            })
            return
        }

        if (!formData.valor || parseFloat(formData.valor) === 0) {
            setResult({
                status: 'error',
                message: 'Valor não pode ser zero'
            })
            return
        }

        // Preparar payload
        const valor = parseFloat(formData.valor)
        const payload = {
            condominio_id: CONDOMINIO_ID,
            data: formData.data,
            descricao: formData.descricao,
            valor: formData.type === 'DEBIT' ? -Math.abs(valor) : Math.abs(valor),
            type: formData.type
        }

        try {
            console.log("🚀 Invoking transactions Edge Function: add-manual...")
            const { data, error } = await supabase.functions.invoke('transactions', {
                body: { ...payload, action: 'add-manual' }
            })

            if (error) throw error

            if (data && data.status === 'success') {
                setResult({
                    status: 'success',
                    message: 'Transação adicionada com sucesso!',
                    data: data
                })

                // Limpar formulário
                setFormData({
                    data: new Date().toISOString().split('T')[0],
                    descricao: '',
                    valor: '',
                    type: 'DEBIT'
                })

                // Reset success message after 5s
                setTimeout(() => {
                    setResult({ status: 'idle' })
                }, 5000)
            } else {
                setResult({
                    status: 'error',
                    message: data?.message || 'Erro ao adicionar transação'
                })
            }
        } catch (error) {
            setResult({
                status: 'error',
                message: 'Erro ao conectar com servidor'
            })
        }
    }

    return (
        <div className="card p-6 max-w-2xl mx-auto">
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    Adicionar Transação Manual
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                    Registre uma entrada ou saída bancária manualmente
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Tipo */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de Transação
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, type: 'DEBIT' })}
                            className={cn(
                                "p-4 rounded-lg border-2 transition-all text-left",
                                formData.type === 'DEBIT'
                                    ? "border-rose-500 bg-rose-50"
                                    : "border-gray-200 hover:border-gray-300"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <div className={cn(
                                    "p-1.5 rounded",
                                    formData.type === 'DEBIT' ? "bg-rose-100" : "bg-gray-100"
                                )}>
                                    <DollarSign className={cn(
                                        "h-4 w-4",
                                        formData.type === 'DEBIT' ? "text-rose-600" : "text-gray-400"
                                    )} />
                                </div>
                                <span className={cn(
                                    "font-medium",
                                    formData.type === 'DEBIT' ? "text-rose-900" : "text-gray-600"
                                )}>
                                    Saída
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">Despesa / Pagamento</p>
                        </button>

                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, type: 'CREDIT' })}
                            className={cn(
                                "p-4 rounded-lg border-2 transition-all text-left",
                                formData.type === 'CREDIT'
                                    ? "border-emerald-500 bg-emerald-50"
                                    : "border-gray-200 hover:border-gray-300"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <div className={cn(
                                    "p-1.5 rounded",
                                    formData.type === 'CREDIT' ? "bg-emerald-100" : "bg-gray-100"
                                )}>
                                    <DollarSign className={cn(
                                        "h-4 w-4",
                                        formData.type === 'CREDIT' ? "text-emerald-600" : "text-gray-400"
                                    )} />
                                </div>
                                <span className={cn(
                                    "font-medium",
                                    formData.type === 'CREDIT' ? "text-emerald-900" : "text-gray-600"
                                )}>
                                    Entrada
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">Receita / Recebimento</p>
                        </button>
                    </div>
                </div>

                {/* Data */}
                <div>
                    <label htmlFor="data" className="block text-sm font-medium text-gray-700 mb-2">
                        Data da Transação
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="date"
                            id="data"
                            value={formData.data}
                            onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                            max={new Date().toISOString().split('T')[0]}
                            className="input pl-10"
                            required
                        />
                    </div>
                </div>

                {/* Descrição */}
                <div>
                    <label htmlFor="descricao" className="block text-sm font-medium text-gray-700 mb-2">
                        Descrição
                    </label>
                    <input
                        type="text"
                        id="descricao"
                        value={formData.descricao}
                        onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                        placeholder="Ex: Pagamento Tech Solutions - Serviço TI"
                        className="input"
                        minLength={3}
                        maxLength={200}
                        required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Mínimo 3 caracteres, máximo 200
                    </p>
                </div>

                {/* Valor */}
                <div>
                    <label htmlFor="valor" className="block text-sm font-medium text-gray-700 mb-2">
                        Valor (R$)
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                            R$
                        </span>
                        <input
                            type="number"
                            id="valor"
                            value={formData.valor}
                            onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                            placeholder="0,00"
                            step="0.01"
                            min="0.01"
                            className="input pl-12"
                            required
                        />
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={result.status === 'loading'}
                    className={cn(
                        "btn btn-primary w-full",
                        result.status === 'loading' && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {result.status === 'loading' ? (
                        <>
                            <Loader className="h-4 w-4 animate-spin" />
                            Processando...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="h-4 w-4" />
                            Adicionar Transação
                        </>
                    )}
                </button>

                {/* Result Messages */}
                {result.status === 'success' && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                            <span className="font-medium text-emerald-900">
                                {result.message}
                            </span>
                        </div>

                        {result.data?.reconciliacao && (
                            <div className="text-sm text-emerald-700 mt-2">
                                {result.data.reconciliacao.matches_criados > 0 ? (
                                    <p>
                                        ✨ {result.data.reconciliacao.matches_criados} comprovante(s) compatível(s) encontrado(s)!
                                        Verifique a fila de reconciliação.
                                    </p>
                                ) : (
                                    <p>
                                        {result.data.reconciliacao.comprovantes_avaliados > 0
                                            ? `Avaliados ${result.data.reconciliacao.comprovantes_avaliados} comprovante(s), nenhum match encontrado.`
                                            : 'Nenhum comprovante pendente para reconciliar no momento.'
                                        }
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {result.status === 'error' && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-rose-600" />
                            <span className="font-medium text-rose-900">
                                {result.message}
                            </span>
                        </div>
                    </div>
                )}
            </form>
        </div>
    )
}
