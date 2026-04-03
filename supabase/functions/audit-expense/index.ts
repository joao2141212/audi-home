/**
 * Edge Function: audit-expense
 * 
 * Auditoria de despesas (pagamentos a fornecedores):
 * 1. Recebe CNPJ e descrição do serviço
 * 2. Valida CNPJ na Receita Federal
 * 3. Verifica compatibilidade CNAE x Serviço
 * 4. Retorna nível de risco
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CNPJService, SupplierData, RiskLevel } from "../_shared/cnpj-service.ts";
import { RobustValidator, ValidationConfig } from "../_shared/robust-validator.ts";
import { AuditLogService } from "../_shared/audit-log-service.ts";

declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuditExpenseRequest {
    cnpj: string;
    service_description?: string;
    transaction_id?: string;
    valor?: number;
    condominio_id?: string;
    actor_id?: string;
}

interface AuditExpenseResponse {
    status: "OK" | "WARNING" | "CRITICAL_RISK" | "CNPJ_NOT_FOUND" | "ERROR";
    supplier: {
        cnpj: string;
        razao_social: string;
        nome_fantasia: string | null;
        status_receita: string;
        cnae_principal: {
            codigo: string;
            descricao: string;
        };
        municipio: string | null;
        uf: string | null;
    } | null;
    cnae_validation: {
        valid: boolean | null;
        reason: string;
        service_requested: string | null;
    } | null;
    risk_level: RiskLevel | null;
    recommendation: string;
    cached: boolean;
    provider: string;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body: AuditExpenseRequest = await req.json();

        if (!body.cnpj) {
            return new Response(
                JSON.stringify({ error: 'CNPJ é obrigatório' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`🔍 Auditando despesa - CNPJ: ${body.cnpj}`);

        // Inicializar serviços
        const cnpjService = new CNPJService();
        const robustValidator = new RobustValidator();

        let supplierData: SupplierData | null = null;
        let riskLevel: RiskLevel | null = null;
        let cnaeValidation: { valid: boolean | null; reason: string } | null = null;

        try {
            // 1. Validar CNPJ
            supplierData = await cnpjService.validateCNPJ(body.cnpj);
            riskLevel = cnpjService.getRiskLevel(supplierData);

            console.log(`✅ CNPJ: ${supplierData.razao_social} - ${supplierData.status_receita} - Risco: ${riskLevel}`);

            // 2. Validar CNAE vs Serviço (se fornecido)
            if (body.service_description && supplierData.cnae_principal) {
                cnaeValidation = robustValidator.validateCnaeService(
                    supplierData.cnae_principal.codigo,
                    [], // CNAEs secundários (não temos no CNPJ.ws grátis)
                    body.service_description
                );

                console.log(`📋 CNAE: ${cnaeValidation.valid ? '✅' : '❌'} ${cnaeValidation.reason}`);

                // Se CNAE não é compatível, aumentar risco
                if (cnaeValidation.valid === false && riskLevel === "OK") {
                    riskLevel = "WARNING";
                }
            }

        } catch (e: any) {
            console.error(`❌ Erro ao validar CNPJ: ${e.message}`);

            return new Response(
                JSON.stringify({
                    status: "CNPJ_NOT_FOUND",
                    supplier: null,
                    cnae_validation: null,
                    risk_level: "CRITICAL_RISK",
                    recommendation: "CNPJ não encontrado na Receita Federal. NÃO PAGAR.",
                    cached: false,
                    provider: "cnpj.ws"
                } as AuditExpenseResponse),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 3. Gerar recomendação
        let recommendation = '';
        if (riskLevel === "OK") {
            recommendation = "Fornecedor ativo e regular. Pagamento autorizado.";
        } else if (riskLevel === "WARNING") {
            recommendation = "Fornecedor com alertas. Verificar manualmente antes de pagar.";
            if (cnaeValidation?.valid === false) {
                recommendation += " CNAE incompatível com o serviço prestado.";
            }
        } else {
            recommendation = "Fornecedor com problemas graves. NÃO PAGAR.";
        }

        // 4. Registrar auditoria (se tiver Supabase configurado)
        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

            if (supabaseUrl && supabaseKey) {
                const supabase = createClient(supabaseUrl, supabaseKey);
                const auditLogService = new AuditLogService(supabase);

                await auditLogService.logAction({
                    entity_type: "expense",
                    entity_id: body.transaction_id || body.cnpj,
                    action: "VALIDATE",
                    actor_id: body.actor_id || "SYSTEM",
                    new_state: {
                        cnpj: body.cnpj,
                        risk_level: riskLevel,
                        status_receita: supplierData?.status_receita,
                        cnae_valid: cnaeValidation?.valid
                    },
                    metadata: {
                        service_description: body.service_description,
                        valor: body.valor
                    }
                });
            }
        } catch (e) {
            console.warn("⚠️ Não foi possível registrar auditoria:", e);
        }

        // 5. Retornar resposta
        const response: AuditExpenseResponse = {
            status: riskLevel === "OK" ? "OK" : riskLevel === "WARNING" ? "WARNING" : "CRITICAL_RISK",
            supplier: supplierData ? {
                cnpj: supplierData.cnpj,
                razao_social: supplierData.razao_social,
                nome_fantasia: supplierData.nome_fantasia,
                status_receita: supplierData.status_receita,
                cnae_principal: supplierData.cnae_principal,
                municipio: supplierData.municipio,
                uf: supplierData.uf
            } : null,
            cnae_validation: cnaeValidation ? {
                valid: cnaeValidation.valid,
                reason: cnaeValidation.reason,
                service_requested: body.service_description || null
            } : null,
            risk_level: riskLevel,
            recommendation,
            cached: supplierData?.cached || false,
            provider: supplierData?.provider || "cnpj.ws"
        };

        return new Response(
            JSON.stringify(response),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('❌ Erro:', error);
        return new Response(
            JSON.stringify({
                status: "ERROR",
                error: error.message,
                supplier: null,
                cnae_validation: null,
                risk_level: null,
                recommendation: "Erro ao processar. Tente novamente.",
                cached: false,
                provider: "cnpj.ws"
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
