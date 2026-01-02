// Type definitions for the Financial Audit System
// These mirror the Pydantic models from the backend

export type ValidationStatus = 'ok' | 'divergencia' | 'erro' | 'pendente'
export type PaymentType = 'boleto' | 'cheque' | 'pix' | 'tef' | 'debito_automatico'
export type RfbStatus = 'Ativo' | 'Inativo' | 'Suspenso' | 'Baixada' | 'Nula'
export type ReconciliationStatus = 'pendente' | 'reconciliado' | 'divergente' | 'ignorado'
export type ReceiptStatus = 'pendente' | 'processando' | 'aprovado' | 'rejeitado' | 'suspeito' | 'duplicado'
export type QueueType = 'manual' | 'excecao' | 'duplicado' | 'fraude_suspeita' | 'multiplos_matches' | 'baixa_confianca'
export type QueueStatus = 'pendente' | 'em_revisao' | 'concluido' | 'cancelado'

// Bank Statement
export interface BankStatement {
    id: string
    arquivo_nome: string
    arquivo_url?: string
    arquivo_hash: string
    data_importacao: string
    periodo_inicio?: string
    periodo_fim?: string
    fonte: 'manual' | 'open_finance'
    criado_por?: string
}

// Bank Transaction
export interface BankTransaction {
    id: string
    extrato_id: string
    data_transacao: string
    valor: number
    tipo: 'credito' | 'debito'
    descricao?: string
    nsu?: string
    codigo_barras?: string
    conta_origem?: string
    conta_destino?: string
    status_reconciliacao: ReconciliationStatus
    comprovante_id?: string
    criado_em: string
}

// Receipt
export interface Receipt {
    id: string
    arquivo_nome: string
    arquivo_url: string
    arquivo_hash: string
    tipo_arquivo: 'pdf' | 'jpg' | 'jpeg' | 'png'
    tamanho_bytes?: number
    enviado_por?: string
    unidade?: string
    data_envio: string

    // OCR
    ocr_processado: boolean
    ocr_confianca?: number
    ocr_valor?: number
    ocr_data?: string
    ocr_nsu?: string
    ocr_codigo_barras?: string
    ocr_texto_completo?: string
    ocr_erro?: string

    // Fraud
    fraud_score: number
    fraud_flags?: Record<string, any>
    documento_alterado: boolean
    duplicado_de?: string

    // Status
    status: ReceiptStatus
    transacao_id?: string

    // Review
    revisado_por?: string
    data_revisao?: string
    motivo_decisao?: string
}

// Transaction Match
export interface TransactionMatch {
    transacao_id: string
    data_transacao: string
    valor: number
    descricao?: string
    nsu?: string
    match_score: number
    match_reasons: string[]
}

// Reconciliation Queue Item
export interface ReconciliationQueueItem {
    id: string
    comprovante_id: string
    prioridade: number
    tipo: QueueType
    matches_sugeridos: TransactionMatch[]
    status: QueueStatus
    criado_em: string
    atribuido_a?: string
}

// API Request types
export interface ReconciliationApproval {
    comprovante_id: string
    transacao_id: string
    motivo_decisao?: string
}

export interface ReconciliationRejection {
    comprovante_id: string
    motivo_decisao: string
}
