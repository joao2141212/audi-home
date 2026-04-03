import { Lock } from 'lucide-react'

export function OpenFinanceConnect() {
    return (
        <div className="bg-gray-50 rounded-[2rem] border border-gray-200 p-8 relative overflow-hidden group min-h-[400px]">
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center text-center p-6">
                <div className="p-6 bg-gray-900 rounded-3xl mb-6 shadow-2xl shadow-gray-400">
                    <Lock className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-2">Open Finance Bloqueado</h3>
                <p className="text-gray-500 max-w-sm font-medium leading-relaxed">
                    A integração bancária automática não faz parte do seu plano atual. A funcionalidade existe, mas está desativada.
                </p>
                <div className="mt-8 flex gap-4">
                    <button className="px-8 py-3 bg-gray-900 text-white rounded-2xl font-bold text-sm shadow-lg hover:scale-105 transition-transform cursor-not-allowed opacity-80" disabled>
                        Upgrade do Plano
                    </button>
                    <button className="px-8 py-3 bg-white text-gray-900 border border-gray-200 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-colors">
                        Falar com Suporte
                    </button>
                </div>
            </div>
        </div>
    )
}
