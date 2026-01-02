import { useState } from 'react'
import { ExpenseList } from './ExpenseList'
import { ExpenseAuditForm } from './ExpenseAuditForm'

interface Transaction {
    id: string
    amount: number
    date: string
    description: string
}

export function ExpenseAudit() {
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
    const condominioId = '00000000-0000-0000-0000-000000000001' // Em produção, vem do contexto/auth

    return (
        <div>
            <ExpenseList
                condominioId={condominioId}
                onAuditClick={setSelectedTransaction}
            />

            {selectedTransaction && (
                <ExpenseAuditForm
                    transaction={selectedTransaction}
                    condominioId={condominioId}
                    onClose={() => setSelectedTransaction(null)}
                />
            )}
        </div>
    )
}
