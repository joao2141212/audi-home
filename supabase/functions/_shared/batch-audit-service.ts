/**
 * Batch Audit Service - TypeScript
 * Portado de: backend/app/services/batch_audit_service.py
 * 
 * Processamento em lote com rate limiting inteligente.
 */

import { CNPJService, RiskLevel } from "./cnpj-service.ts";
import { RobustValidator } from "./robust-validator.ts";

declare const Deno: any;

// ============== INTERFACES ==============

export interface BatchAuditItem {
    cnpj: string;
    transaction_id?: string;
    service_type?: string;
}

export interface BatchAuditResult {
    cnpj: string;
    razao_social: string;
    status_receita: string;
    cnae: string;
    risk_level: RiskLevel;
    cnae_valid: boolean | null;
    status: "APPROVED" | "REJECTED" | "CNAE_MISMATCH" | "MANUAL_REVIEW";
    reason: string;
    cached: boolean;
}

export interface BatchAuditStatus {
    total: number;
    processed: number;
    pending: number;
    results: BatchAuditResult[];
    errors: Array<{
        item: BatchAuditItem;
        error: string;
    }>;
}

// ============== BATCH AUDIT SERVICE ==============

export class BatchAuditService {
    private cnpjService: CNPJService;
    private results: BatchAuditResult[] = [];
    private errors: Array<{ item: BatchAuditItem; error: string }> = [];

    constructor() {
        this.cnpjService = new CNPJService();
    }

    /**
     * Processa lista de CNPJs em lote com rate limiting.
     */
    async processBatch(
        items: BatchAuditItem[],
        progressCallback?: (processed: number, total: number) => void
    ): Promise<BatchAuditStatus> {
        const total = items.length;
        let processed = 0;

        console.log(`[Batch Audit] Iniciando processamento de ${total} itens...`);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            try {
                // Processar item
                const result = await this.processSingleItem(item);
                this.results.push(result);
                processed++;

                // Reportar progresso
                if (progressCallback) {
                    progressCallback(processed, total);
                }

                console.log(`[Batch Audit] ${processed}/${total} - ${item.cnpj} ✅`);

                // Rate limiting para versão grátis CNPJ.ws (3 req/min = 20s entre requests)
                if (i < total - 1) {
                    const waitTime = 20000; // 20 segundos
                    console.log(`[Batch Audit] Aguardando ${waitTime / 1000}s (rate limit)...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

            } catch (error: any) {
                if (error.name === 'CNPJRateLimitError') {
                    // Rate limit atingido - aguardar mais tempo
                    console.log(`[Batch Audit] Rate limit atingido! Aguardando 60s...`);
                    await new Promise(resolve => setTimeout(resolve, 60000));

                    // Tentar novamente
                    try {
                        const result = await this.processSingleItem(item);
                        this.results.push(result);
                        processed++;
                    } catch (retryError: any) {
                        this.errors.push({
                            item,
                            error: retryError.message
                        });
                    }
                } else {
                    console.log(`[Batch Audit] Erro ao processar ${item.cnpj}: ${error.message}`);
                    this.errors.push({
                        item,
                        error: error.message
                    });
                }
            }
        }

        const pending = total - processed;

        return {
            total,
            processed,
            pending,
            results: this.results,
            errors: this.errors
        };
    }

    /**
     * Processa um único item
     */
    private async processSingleItem(item: BatchAuditItem): Promise<BatchAuditResult> {
        const cnpj = item.cnpj;
        const serviceType = item.service_type || "";

        // Validar CNPJ
        const supplierData = await this.cnpjService.validateCNPJ(cnpj);

        // Determinar risco
        const riskLevel = this.cnpjService.getRiskLevel(supplierData);

        // Validar CNAE vs Serviço
        const validator = new RobustValidator();
        const cnaeValidation = validator.validateCnaeService(
            supplierData.cnae_principal.codigo,
            [],
            serviceType
        );

        // Determinar status final
        let status: BatchAuditResult['status'];
        let reason: string;

        if (riskLevel === "CRITICAL_RISK") {
            status = "REJECTED";
            reason = `Empresa ${supplierData.status_receita}`;
        } else if (cnaeValidation.valid === false) {
            status = "CNAE_MISMATCH";
            reason = cnaeValidation.reason;
        } else if (cnaeValidation.valid === null) {
            status = "MANUAL_REVIEW";
            reason = cnaeValidation.reason;
        } else {
            status = "APPROVED";
            reason = "Fornecedor validado";
        }

        return {
            cnpj,
            razao_social: supplierData.razao_social,
            status_receita: supplierData.status_receita,
            cnae: supplierData.cnae_principal.codigo,
            risk_level: riskLevel,
            cnae_valid: cnaeValidation.valid,
            status,
            reason,
            cached: supplierData.cached
        };
    }

    /**
     * Limpa resultados e erros para novo processamento
     */
    reset(): void {
        this.results = [];
        this.errors = [];
    }
}
