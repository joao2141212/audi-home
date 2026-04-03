/**
 * RFB Validator - TypeScript
 * Portado de: backend/app/services/rfb_validator.py
 * 
 * Validador da Receita Federal do Brasil (mock por enquanto).
 */

declare const Deno: any;

// ============== INTERFACES ==============

export interface RFBValidationResult {
    situacao_cadastral: string;
    cnae_principal: string;
    razao_social: string;
}

// ============== RFB VALIDATOR ==============

export class RFBValidator {
    private apiKey: string | null;
    private baseUrl = "https://api.dbdireto.com.br"; // Example URL

    constructor() {
        this.apiKey = Deno.env.get('DBDIRETO_API_KEY') || null;
    }

    /**
     * Valida um CNPJ.
     * Retorna dados da situação cadastral, CNAE, etc.
     */
    async validateCNPJ(cnpj: string): Promise<RFBValidationResult> {
        // Se não tem API key, usar mock
        if (!this.apiKey) {
            return this.mockValidation(cnpj);
        }

        try {
            const response = await fetch(`${this.baseUrl}/cnpj/${cnpj}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`[RFB] API Error: ${(error as Error).message}`);
            return this.mockValidation(cnpj);
        }
    }

    /**
     * Mock validation para desenvolvimento sem API keys
     */
    private mockValidation(cnpj: string): RFBValidationResult {
        // Simular empresa inativa para CNPJs específicos
        if (cnpj.endsWith("000199")) {
            return {
                situacao_cadastral: "Inativo",
                cnae_principal: "0000000",
                razao_social: "EMPRESA TESTE INATIVA"
            };
        }

        return {
            situacao_cadastral: "Ativo",
            cnae_principal: "8112500", // Condomínios prediais
            razao_social: "EMPRESA TESTE ATIVA"
        };
    }

    /**
     * Fallback method usando scraping se API falhar.
     * Não implementado nesta versão para evitar complexidade.
     */
    async fallbackScrapeRFB(cnpj: string): Promise<void> {
        // TODO: Implementar se necessário
        console.log(`[RFB] Fallback scraping não implementado para ${cnpj}`);
    }
}
