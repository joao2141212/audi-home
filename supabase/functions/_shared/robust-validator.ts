/**
 * Robust Validator - TypeScript  
 * Portado de: backend/app/services/robust_validator.py
 * 
 * Validador robusto com Cascade Logic para reconciliação bancária anti-fraude.
 */

declare const Deno: any;

// ============== CONFIG ==============

export const ValidationConfig = {
    // Tolerância de valor (R$ 0,05)
    VALUE_TOLERANCE: 0.05,

    // Tolerância de data (2 dias)
    DATE_TOLERANCE_DAYS: 2,

    // Tolerância de timestamp (30 minutos)
    TIMESTAMP_TOLERANCE_MINUTES: 30,

    // Taxas comuns de boleto
    COMMON_FEES: [2.50, 3.00, 1.50, 5.00],

    // Mapeamento Serviço → CNAEs permitidos
    SERVICE_CNAE_MAP: {
        "jardinagem": ["8130300", "8130-3/00"],
        "paisagismo": ["8130300", "8130-3/00"],
        "limpeza": ["8121400", "8121-4/00", "8129000"],
        "conservacao": ["8121400", "8121-4/00"],
        "seguranca": ["8011101", "8011-1/01", "8011102"],
        "vigilancia": ["8011101", "8011-1/01"],
        "portaria": ["8011101", "8011-1/01"],
        "elevador": ["4329104", "4329-1/04"],
        "manutencao_elevador": ["4329104", "4329-1/04"],
        "eletrica": ["4321500", "4321-5/00"],
        "instalacao_eletrica": ["4321500", "4321-5/00"],
        "hidraulica": ["4322301", "4322-3/01", "4322302"],
        "encanamento": ["4322301", "4322-3/01"],
        "pintura": ["4330404", "4330-4/04", "4330405"],
        "reforma": ["4330404", "4330-4/04"],
        "construcao": ["4120400", "4120-4/00"],
        "obra": ["4120400", "4120-4/00"],
    } as Record<string, string[]>
};

// ============== INTERFACES ==============

export interface TransactionMatch {
    transaction_id: string;
    amount: number;
    date: string;
    description: string;
    timestamp?: string;
    payer_document?: string;
    match_score: number;
    match_type: "exact" | "with_fee" | "tolerance";
    match_level: "cpf" | "timestamp" | "fifo" | "manual" | "pending";
    fee_detected?: number;
    ambiguous: boolean;
    confidence: "high" | "medium" | "low";
    claimed_by?: string;
    claimed_at?: string;
}

export interface ValidationResult {
    status: "APPROVED" | "REJECTED" | "AMBIGUOUS" | "MANUAL_REVIEW" | "TRANSACTION_ALREADY_CLAIMED";
    matches: TransactionMatch[];
    reason: string;
    resolution_level?: string;
    requires_manual_review: boolean;
    fraud_flags: string[];
}

interface ClaimedTransaction {
    claimed_by: string;
    claimed_at: string;
}

// ============== ROBUST VALIDATOR ==============

export class RobustValidator {
    private claimedTransactions: Map<string, ClaimedTransaction> = new Map();

    constructor(claimedTransactions?: Record<string, ClaimedTransaction>) {
        if (claimedTransactions) {
            for (const [key, value] of Object.entries(claimedTransactions)) {
                this.claimedTransactions.set(key, value);
            }
        }
    }

    /**
     * Valida um pagamento contra transações bancárias com Cascade Logic.
     */
    validatePayment(
        receiptAmount: number,
        receiptDate: string, // YYYY-MM-DD
        receiptTimestamp: string | null,
        uploadTimestamp: string,
        payerCpf: string | null,
        receiptId: string,
        transactions: any[]
    ): ValidationResult {
        const matches: TransactionMatch[] = [];

        // PASSO 1: Buscar matches potenciais
        for (const tx of transactions) {
            const match = this.checkTransactionMatch(
                receiptAmount,
                receiptDate,
                payerCpf,
                tx
            );

            if (match) {
                // Verificar se transação já foi reivindicada
                const claimInfo = this.claimedTransactions.get(match.transaction_id);
                if (claimInfo && claimInfo.claimed_by !== receiptId) {
                    match.claimed_by = claimInfo.claimed_by;
                    match.claimed_at = claimInfo.claimed_at;
                }

                matches.push(match);
            }
        }

        // PASSO 2: Analisar resultados
        if (matches.length === 0) {
            return {
                status: "REJECTED",
                matches: [],
                reason: "Nenhuma transação correspondente encontrada no extrato bancário",
                requires_manual_review: false,
                fraud_flags: []
            };
        } else if (matches.length === 1) {
            const match = matches[0];

            if (match.claimed_by && match.claimed_by !== receiptId) {
                return {
                    status: "TRANSACTION_ALREADY_CLAIMED",
                    matches: [match],
                    reason: `Transação já foi reivindicada por outro comprovante em ${match.claimed_at}`,
                    requires_manual_review: true,
                    fraud_flags: ["transaction_claimed"]
                };
            }

            if (match.confidence === "high") {
                this.claimTransaction(match.transaction_id, receiptId);

                return {
                    status: "APPROVED",
                    matches: [match],
                    reason: `Pagamento confirmado (${match.match_type})`,
                    resolution_level: "single_match",
                    requires_manual_review: false,
                    fraud_flags: []
                };
            } else {
                return {
                    status: "MANUAL_REVIEW",
                    matches: [match],
                    reason: "Match encontrado mas com baixa confiança. Requer revisão.",
                    resolution_level: "manual",
                    requires_manual_review: true,
                    fraud_flags: ["low_confidence"]
                };
            }
        } else {
            // Múltiplos matches - CASCADE LOGIC
            return this.resolveAmbiguityCascade(
                matches,
                payerCpf,
                receiptTimestamp,
                uploadTimestamp,
                receiptId
            );
        }
    }

    private resolveAmbiguityCascade(
        matches: TransactionMatch[],
        payerCpf: string | null,
        receiptTimestamp: string | null,
        uploadTimestamp: string,
        receiptId: string
    ): ValidationResult {
        // NÍVEL 1: Match por CPF
        if (payerCpf) {
            const cpfClean = this.cleanDocument(payerCpf);
            const matchesWithCpf = matches.filter(m => {
                if (!m.payer_document || m.claimed_by) return false;
                return this.cleanDocument(m.payer_document) === cpfClean;
            });

            if (matchesWithCpf.length === 1) {
                const match = matchesWithCpf[0];
                match.match_level = "cpf";
                this.claimTransaction(match.transaction_id, receiptId);

                return {
                    status: "APPROVED",
                    matches: [match],
                    reason: "Pagamento confirmado por cruzamento de CPF (Nível 1)",
                    resolution_level: "level_1_cpf",
                    requires_manual_review: false,
                    fraud_flags: []
                };
            } else if (matchesWithCpf.length > 1) {
                matches = matchesWithCpf;
            }
        }

        // NÍVEL 2: Match por Timestamp
        if (receiptTimestamp) {
            const receiptTime = new Date(receiptTimestamp).getTime();
            const matchesWithTimestamp: { match: TransactionMatch; diff: number }[] = [];

            for (const match of matches) {
                if (match.timestamp && !match.claimed_by) {
                    const txTime = new Date(match.timestamp).getTime();
                    const timeDiff = Math.abs((txTime - receiptTime) / (1000 * 60));

                    if (timeDiff <= ValidationConfig.TIMESTAMP_TOLERANCE_MINUTES) {
                        match.match_level = "timestamp";
                        match.match_score += 10;
                        matchesWithTimestamp.push({ match, diff: timeDiff });
                    }
                }
            }

            if (matchesWithTimestamp.length > 0) {
                matchesWithTimestamp.sort((a, b) => a.diff - b.diff);
                const bestMatch = matchesWithTimestamp[0].match;
                this.claimTransaction(bestMatch.transaction_id, receiptId);

                return {
                    status: "APPROVED",
                    matches: [bestMatch],
                    reason: `Pagamento confirmado por timestamp (diferença: ${matchesWithTimestamp[0].diff.toFixed(0)}min) (Nível 2)`,
                    resolution_level: "level_2_timestamp",
                    requires_manual_review: false,
                    fraud_flags: []
                };
            }
        }

        // NÍVEL 3: FIFO
        const unclaimedMatches = matches.filter(m => !m.claimed_by);

        if (unclaimedMatches.length > 0) {
            unclaimedMatches.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.date).getTime();
                const dateB = new Date(b.timestamp || b.date).getTime();
                return dateA - dateB;
            });

            const firstUnclaimed = unclaimedMatches[0];
            firstUnclaimed.match_level = "fifo";
            this.claimTransaction(firstUnclaimed.transaction_id, receiptId);

            return {
                status: "APPROVED",
                matches: [firstUnclaimed],
                reason: "Pagamento confirmado por FIFO - primeira transação disponível (Nível 3)",
                resolution_level: "level_3_fifo",
                requires_manual_review: false,
                fraud_flags: []
            };
        }

        // NÍVEL 4: Todas reivindicadas
        const claimedMatches = matches.filter(m => m.claimed_by);
        if (claimedMatches.length > 0) {
            return {
                status: "TRANSACTION_ALREADY_CLAIMED",
                matches: claimedMatches,
                reason: `Todas as ${claimedMatches.length} transações correspondentes já foram reivindicadas`,
                resolution_level: "level_3_fifo",
                requires_manual_review: true,
                fraud_flags: ["all_transactions_claimed", "possible_duplicate_receipt"]
            };
        }

        // ÚLTIMO CASO: Manual Review
        return {
            status: "MANUAL_REVIEW",
            matches,
            reason: `Múltiplas transações (${matches.length}) sem critério de desempate. Requer revisão manual (Nível 5)`,
            resolution_level: "manual",
            requires_manual_review: true,
            fraud_flags: ["multiple_matches", "no_resolution_criteria"]
        };
    }

    private checkTransactionMatch(
        receiptAmount: number,
        receiptDate: string,
        payerCpf: string | null,
        tx: any
    ): TransactionMatch | null {
        const txAmount = Math.abs(parseFloat(tx.valor || tx.amount || 0));
        const txDateStr = tx.data_transacao || tx.date || '';
        const txDate = this.parseDate(txDateStr);

        if (!txDate) return null;

        // Verificar data
        const receiptDateParsed = this.parseDate(receiptDate);
        if (!receiptDateParsed) return null;

        const dateDiff = Math.abs(
            (new Date(txDate).getTime() - new Date(receiptDateParsed).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (dateDiff > ValidationConfig.DATE_TOLERANCE_DAYS) return null;

        const valueDiff = Math.abs(txAmount - receiptAmount);

        // Match exato
        if (valueDiff <= ValidationConfig.VALUE_TOLERANCE) {
            return {
                transaction_id: tx.id,
                amount: txAmount,
                date: txDateStr,
                timestamp: tx.created_at || tx.timestamp,
                description: tx.descricao || tx.description || '',
                payer_document: tx.payer_document,
                match_score: 100,
                match_type: "exact",
                match_level: "pending",
                confidence: "high",
                ambiguous: false
            };
        }

        // Match com taxa de boleto
        for (const fee of ValidationConfig.COMMON_FEES) {
            if (Math.abs(txAmount - (receiptAmount - fee)) <= ValidationConfig.VALUE_TOLERANCE) {
                return {
                    transaction_id: tx.id,
                    amount: txAmount,
                    date: txDateStr,
                    description: tx.descricao || tx.description || '',
                    match_score: 90,
                    match_type: "with_fee",
                    match_level: "pending",
                    fee_detected: fee,
                    confidence: "high",
                    ambiguous: false
                };
            }
        }

        return null;
    }

    private claimTransaction(transactionId: string, receiptId: string): void {
        this.claimedTransactions.set(transactionId, {
            claimed_by: receiptId,
            claimed_at: new Date().toISOString()
        });
    }

    /**
     * Valida se CNAE é compatível com o serviço prestado
     */
    validateCnaeService(
        cnaePrincipal: string,
        cnaesSecundarios: string[],
        serviceType: string
    ): { valid: boolean | null; reason: string } {
        const serviceNormalized = serviceType.toLowerCase().trim();
        const allowedCnaes = ValidationConfig.SERVICE_CNAE_MAP[serviceNormalized];

        if (!allowedCnaes) {
            return { valid: null, reason: `Serviço '${serviceType}' não mapeado. Requer validação manual.` };
        }

        const cnaePrincipalClean = this.cleanCnae(cnaePrincipal);
        const cnaesSecundariosClean = cnaesSecundarios.map(c => this.cleanCnae(c));
        const allCnaes = [cnaePrincipalClean, ...cnaesSecundariosClean];

        for (const cnae of allCnaes) {
            for (const allowed of allowedCnaes) {
                const allowedClean = this.cleanCnae(allowed);
                if (cnae.startsWith(allowedClean.substring(0, 4))) {
                    return { valid: true, reason: `CNAE ${cnae} compatível com serviço '${serviceType}'` };
                }
            }
        }

        return {
            valid: false,
            reason: `CNAE ${cnaePrincipal} NÃO é compatível com serviço '${serviceType}'. Possível fraude de desvio de função.`
        };
    }

    /**
     * Detecta se uma transação é estorno
     */
    detectRefund(
        transaction: any,
        historicalDebits: any[]
    ): { isRefund: boolean; reason?: string } {
        const description = (transaction.descricao || transaction.description || '').toUpperCase();
        const amount = Math.abs(parseFloat(transaction.valor || transaction.amount || 0));

        // 1. Palavras-chave
        const refundKeywords = ["ESTORNO", "DEVOLUCAO", "CANCELAMENTO", "REEMBOLSO", "ESTORNADO"];
        if (refundKeywords.some(kw => description.includes(kw))) {
            return { isRefund: true, reason: "Identificado por palavra-chave na descrição" };
        }

        // 2. Busca débito correspondente
        for (const debit of historicalDebits) {
            const debitAmount = Math.abs(parseFloat(debit.valor || debit.amount || 0));
            if (Math.abs(debitAmount - amount) < 0.01) {
                return { isRefund: true, reason: `Estorno de transação anterior (ID: ${debit.id})` };
            }
        }

        return { isRefund: false };
    }

    private parseDate(dateStr: string): string | null {
        if (!dateStr) return null;
        try {
            if (dateStr.includes('T')) {
                return dateStr.split('T')[0];
            }
            return dateStr;
        } catch {
            return null;
        }
    }

    private cleanDocument(doc: string): string {
        return doc.replace(/\D/g, '');
    }

    private cleanCnae(cnae: string): string {
        return cnae.replace(/[-/]/g, '');
    }
}
