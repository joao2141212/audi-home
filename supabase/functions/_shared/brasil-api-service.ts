/**
 * BrasilAPI Service - TypeScript
 * Portado de: backend/app/services/brasil_api_service.py
 * 
 * Integração com BrasilAPI para validação de CNPJ (Receita Federal).
 * API Pública: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 */

declare const Deno: any;

// ============== INTERFACES ==============

export interface BrasilAPIResponse {
    valid: boolean;
    status_cadastral: string;
    cnae_principal: string;
    descricao_cnae: string;
    razao_social: string;
    nome_fantasia: string;
    data_situacao_cadastral: string;
    alerta_critico: boolean;
    municipio?: string;
    uf?: string;
    error?: string;
    raw_data?: any;
}

// ============== BRASIL API SERVICE ==============

export class BrasilAPIService {
    private static BASE_URL = "https://brasilapi.com.br/api/cnpj/v1";
    private static cache: Map<string, { data: BrasilAPIResponse; cachedAt: number }> = new Map();
    private static cacheTTL = 30 * 24 * 60 * 60 * 1000; // 30 dias

    /**
     * Valida um fornecedor pelo CNPJ usando BrasilAPI (grátis).
     */
    async validateSupplier(cnpj: string): Promise<BrasilAPIResponse> {
        const cnpjClean = this.cleanCNPJ(cnpj);

        // Verificar cache
        const cached = this.getFromCache(cnpjClean);
        if (cached) {
            console.log(`[BrasilAPI] Cache HIT para ${cnpjClean}`);
            return cached;
        }

        // Buscar na API
        try {
            const response = await fetch(`${BrasilAPIService.BASE_URL}/${cnpjClean}`);

            if (response.ok) {
                const data = await response.json();
                const result = this.normalizeResponse(data);

                // Salvar no cache
                this.saveToCache(cnpjClean, result);

                return result;
            } else if (response.status === 404) {
                return {
                    valid: false,
                    status_cadastral: "",
                    cnae_principal: "",
                    descricao_cnae: "",
                    razao_social: "",
                    nome_fantasia: "",
                    data_situacao_cadastral: "",
                    alerta_critico: true,
                    error: "CNPJ não encontrado na Receita Federal"
                };
            } else {
                throw new Error(`API Error: ${response.status}`);
            }
        } catch (error) {
            console.error(`[BrasilAPI] Erro: ${(error as Error).message}`);
            // Fallback para mock em caso de erro
            return this.mockValidation(cnpjClean);
        }
    }

    /**
     * Normaliza resposta da BrasilAPI
     */
    private normalizeResponse(data: any): BrasilAPIResponse {
        const status = (data.descricao_situacao_cadastral || "").toUpperCase();
        const alertaCritico = !["ATIVA", "ATIVO"].includes(status);

        return {
            valid: true,
            status_cadastral: status,
            cnae_principal: data.cnae_fiscal || "",
            descricao_cnae: data.cnae_fiscal_descricao || "",
            razao_social: data.razao_social || "",
            nome_fantasia: data.nome_fantasia || "",
            data_situacao_cadastral: data.data_situacao_cadastral || "",
            alerta_critico: alertaCritico,
            municipio: data.municipio || "",
            uf: data.uf || "",
            raw_data: data
        };
    }

    /**
     * Valida se o CNAE do fornecedor é compatível com o serviço prestado.
     */
    validateCnaeService(cnae: string, serviceDescription: string): {
        compatible: boolean | null;
        confidence: number;
        reason: string;
    } {
        // Mapeamento CNAE → Palavras-chave de serviços compatíveis
        const CNAE_MAPPING: Record<string, string[]> = {
            "4321": ["eletric", "instalacao", "manutencao", "energia", "fiacao"],
            "4329": ["hidraulic", "encanamento", "agua", "esgoto", "cano", "elevador", "ascensor"],
            "4330": ["pintura", "reforma", "acabamento", "gesso"],
            "4391": ["telhado", "cobertura", "impermeabilizacao"],
            "4399": ["construcao", "obra", "alvenaria"],
            "8112": ["limpeza", "conservacao", "higienizacao", "faxina"],
            "8011": ["seguranca", "vigilancia", "portaria", "monitoramento"],
            "8020": ["jardinagem", "paisagismo", "jardim"],
            "1091": ["padaria", "panificacao", "pao"],
            "5611": ["restaurante", "alimentacao", "refeicao"],
        };

        // Pegar primeiros 4 dígitos do CNAE
        const cnaePrefix = cnae.substring(0, 4);

        // Buscar palavras-chave compatíveis
        const keywords = CNAE_MAPPING[cnaePrefix];

        if (!keywords) {
            return {
                compatible: null,
                confidence: 0,
                reason: `CNAE ${cnae} não mapeado no sistema`
            };
        }

        // Normalizar descrição do serviço
        const serviceNormalized = serviceDescription
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        // Verificar matches
        const matches = keywords.filter(kw => serviceNormalized.includes(kw.toLowerCase()));

        if (matches.length > 0) {
            return {
                compatible: true,
                confidence: 90,
                reason: `CNAE compatível com serviço (matches: ${matches.join(', ')})`
            };
        } else {
            return {
                compatible: false,
                confidence: 80,
                reason: `CNAE incompatível: esperado ${keywords.join(', ')}, recebido '${serviceDescription}'`
            };
        }
    }

    private cleanCNPJ(cnpj: string): string {
        return cnpj.replace(/\D/g, '');
    }

    private getFromCache(cnpj: string): BrasilAPIResponse | null {
        const entry = BrasilAPIService.cache.get(cnpj);
        if (entry) {
            if (Date.now() - entry.cachedAt < BrasilAPIService.cacheTTL) {
                return entry.data;
            } else {
                BrasilAPIService.cache.delete(cnpj);
            }
        }
        return null;
    }

    private saveToCache(cnpj: string, data: BrasilAPIResponse): void {
        BrasilAPIService.cache.set(cnpj, {
            data,
            cachedAt: Date.now()
        });
    }

    /**
     * Mock para desenvolvimento/testes
     */
    private mockValidation(cnpj: string): BrasilAPIResponse {
        // Simular empresa inativa para CNPJs terminados em 999
        if (cnpj.endsWith("999")) {
            return {
                valid: true,
                status_cadastral: "BAIXADA",
                cnae_principal: "0000000",
                descricao_cnae: "EMPRESA TESTE BAIXADA",
                razao_social: "EMPRESA TESTE INATIVA LTDA",
                nome_fantasia: "TESTE INATIVA",
                data_situacao_cadastral: "2020-01-01",
                alerta_critico: true,
                municipio: "São Paulo",
                uf: "SP"
            };
        }

        // Empresa ativa (padrão)
        return {
            valid: true,
            status_cadastral: "ATIVA",
            cnae_principal: "4321500",
            descricao_cnae: "Instalação e manutenção elétrica",
            razao_social: "EMPRESA TESTE ATIVA LTDA",
            nome_fantasia: "TESTE ATIVA",
            data_situacao_cadastral: "2015-01-01",
            alerta_critico: false,
            municipio: "São Paulo",
            uf: "SP"
        };
    }
}
