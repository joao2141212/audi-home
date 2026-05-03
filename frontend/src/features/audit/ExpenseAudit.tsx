import { useState } from 'react'
import { ExpenseList } from './ExpenseList'
import { ExpenseAuditForm } from './ExpenseAuditForm'
import { useAuth } from '../../contexts/AuthContext'

interface Transaction {
    id: string
    condominioId: string
    amount: number
    date: string
    description: string
}

export function ExpenseAudit() {
    const { user } = useAuth()
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

    if (!user?.condominio_id) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-medium text-amber-800">
                O perfil atual ainda não está vinculado a um condomínio. Vincule o usuário antes de usar a auditoria de despesas.
            </div>
        )
    }

    return (
        <div>
            <ExpenseList
                condominioId={user.condominio_id}
                onAuditClick={setSelectedTransaction}
            />

            {selectedTransaction && (
                <ExpenseAuditForm
                    transaction={selectedTransaction}
                    onClose={() => setSelectedTransaction(null)}
                />
            )}
        </div>
    )
}
