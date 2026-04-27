import { Lock, Building2 } from 'lucide-react'

interface AdminBankConnectionProps {
    condominioId: string
}

export function AdminBankConnection({ condominioId: _condominioId }: AdminBankConnectionProps) {
    return (
        <div className="bg-gray-50 rounded-[2rem] border border-gray-200 p-8 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center text-center p-6">
                <div className="p-4 bg-gray-900 rounded-2xl mb-4 shadow-xl">
                    <Lock className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">Open Finance Bloqueado</h3>
                <p className="text-gray-500 max-w-sm font-medium">
                    A integração bancária automática não está ativa para este plano. Entre em contato com o suporte para habilitar.
                </p>
                <button className="mt-6 px-6 py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:scale-105 transition-transform" disabled>
                    Upgrade do Plano
                </button>
            </div>

            {/* Fundo decorativo desativado */}
            <div className="opacity-30 blur-sm pointer-events-none select-none">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-blue-100 rounded-xl">
                        <Building2 className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Conexão Bancária</h3>
                        <p className="text-sm text-gray-500">Sincronização automática</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="h-24 bg-blue-50 rounded-2xl border border-blue-100"></div>
                    <div className="h-12 bg-blue-600 rounded-xl"></div>
                </div>
            </div>
        </div>
    )
}
