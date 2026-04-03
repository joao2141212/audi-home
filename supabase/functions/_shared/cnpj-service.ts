/**
 * CNPJ Service - TypeScript
 * Portado de: backend/app/services/cnpj_service.py + cnpj/base.py + cnpj/cnpjws_provider.py
 */

declare const Deno: any;

// ============== INTERFACES ==============

export interface CNAEData {
    codigo: string;
    descricao: string;
}

export interface SupplierData {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string | null;
    status_receita: "ATIVA" | "BAIXADA" | "SUSPENSA" | "INAPTA" | "NULA" | "DESCONHECIDA";
    cnae_principal: CNAEData;
    logradouro: string | null;
    municipio: string | null;
    uf: string | null;
    data_situacao_cadastral: string | null;
    provider: string;
    cached: boolean;
    raw_data?: any;
}

export type RiskLevel = "OK" | "WARNING" | "CRITICAL_RISK";

// ============== ERRORS ==============

export class CNPJNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CNPJNotFoundError";
    }
}

export class CNPJAPIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CNPJAPIError";
    }
}

export class CNPJRateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CNPJRateLimitError";
    }
}

// ============== CNPJ.WS PROVIDER ==============

export class CNPJWSProvider {
    private static BASE_URL_PUBLIC = "https://publica.cnpj.ws/cnpj";
    private static BASE_URL_COMMERCIAL = "https://comercial.cnpj.ws/cnpj";

    private token: string | null;
    private isPaid: boolean;
    private baseUrl: string;
    private lastRequestTime: number | null = null;
    private minInterval = 20000; // 20 segundos entre requests (3/min)

    constructor(token: string | null = null) {
        this.token = token;
        this.isPaid = !!token;
        this.baseUrl = this.isPaid ? CNPJWSProvider.BASE_URL_COMMERCIAL : CNPJWSProvider.BASE_URL_PUBLIC;
    }

    getProviderName(): string {
        return `CNPJ.ws (${this.isPaid ? 'Pago' : 'Grátis'})`;
    }

    async validateCNPJ(cnpj: string): Promise<SupplierData> {
        const cnpjClean = this.cleanCNPJ(cnpj);

        // Rate limiting (apenas versão grátis)
        if (!this.isPaid) {
            await this.applyRateLimit();
        }

        try {
            let url = `${this.baseUrl}/${cnpjClean}`;
            if (this.isPaid && this.token) {
                url += `?token=${this.token}`;
            }

            const response = await fetch(url);

            if (response.status === 429) {
                throw new CNPJRateLimitError("Rate limit atingido. Aguarde alguns segundos.");
            }

            if (response.status === 404) {
                throw new CNPJNotFoundError(`CNPJ ${cnpj} não encontrado na Receita Federal`);
            }

            if (!response.ok) {
                throw new CNPJAPIError(`Erro na API CNPJ.ws: ${response.status}`);
            }

            const data = await response.json();
            return this.normalizeResponse(data, cnpjClean);

        } catch (error) {
            if (error instanceof CNPJNotFoundError ||
                error instanceof CNPJRateLimitError ||
                error instanceof CNPJAPIError) {
                throw error;
            }
            throw new CNPJAPIError(`Erro ao consultar CNPJ.ws: ${(error as Error).message}`);
        }
    }

    private normalizeResponse(data: any, cnpj: string): SupplierData {
        const estabelecimento = data.estabelecimento || {};

        // Mapear situação cadastral
        const situacaoMapCodigo: Record<string, string> = {
            "01": "NULA",
            "02": "ATIVA",
            "03": "SUSPENSA",
            "04": "INAPTA",
            "08": "BAIXADA"
        };

        const situacaoMapTexto: Record<string, string> = {
            "nula": "NULA",
            "ativa": "ATIVA",
            "suspensa": "SUSPENSA",
            "inapta": "INAPTA",
            "baixada": "BAIXADA"
        };

        const situacaoRaw = String(estabelecimento.situacao_cadastral || '02');
        let statusReceita = situacaoMapCodigo[situacaoRaw];
        if (!statusReceita) {
            statusReceita = situacaoMapTexto[situacaoRaw.toLowerCase()] || "DESCONHECIDA";
        }

        // CNAE principal
        const atividade = estabelecimento.atividade_principal || {};
        const cnae: CNAEData = {
            codigo: String(atividade.id || ''),
            descricao: atividade.descricao || ''
        };

        return {
            cnpj,
            razao_social: data.razao_social || '',
            nome_fantasia: estabelecimento.nome_fantasia || null,
            status_receita: statusReceita as SupplierData['status_receita'],
            cnae_principal: cnae,
            logradouro: estabelecimento.logradouro || null,
            municipio: estabelecimento.municipio || null,
            uf: estabelecimento.uf || null,
            data_situacao_cadastral: estabelecimento.data_situacao_cadastral || null,
            provider: this.getProviderName(),
            cached: false,
            raw_data: data
        };
    }

    private async applyRateLimit(): Promise<void> {
        if (this.lastRequestTime) {
            const elapsed = Date.now() - this.lastRequestTime;
            if (elapsed < this.minInterval) {
                const waitTime = this.minInterval - elapsed;
                console.log(`[CNPJ.ws] Rate limit: aguardando ${(waitTime / 1000).toFixed(1)}s...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        this.lastRequestTime = Date.now();
    }

    private cleanCNPJ(cnpj: string): string {
        return cnpj.replace(/\D/g, '');
    }
}

// ============== CNPJ SERVICE (CACHE + PROVIDER) ==============

interface CacheEntry {
    data: SupplierData;
    cachedAt: number;
}

export class CNPJService {
    private provider: CNPJWSProvider;
    private static cache: Map<string, CacheEntry> = new Map();
    private static cacheTTL = 30 * 24 * 60 * 60 * 1000; // 30 dias em ms

    constructor(token?: string) {
        const envToken = token || Deno.env.get('CNPJ_WS_TOKEN') || null;
        this.provider = new CNPJWSProvider(envToken);
    }

    async validateCNPJ(cnpj: string): Promise<SupplierData> {
        const cnpjClean = cnpj.replace(/\D/g, '');

        // Verificar cache
        const cachedData = this.getFromCache(cnpjClean);
        if (cachedData) {
            console.log(`[CNPJ Service] Cache HIT para ${cnpjClean}`);
            return { ...cachedData, cached: true };
        }

        // Consultar provider
        console.log(`[CNPJ Service] Validando CNPJ ${cnpjClean} via ${this.provider.getProviderName()}...`);

        const supplierData = await this.provider.validateCNPJ(cnpjClean);

        // Salvar no cache
        this.saveToCache(cnpjClean, supplierData);

        console.log(`[CNPJ Service] ✅ ${supplierData.razao_social} - Status: ${supplierData.status_receita}`);

        return supplierData;
    }

    isSupplierActive(supplierData: SupplierData): boolean {
        return supplierData.status_receita === "ATIVA";
    }

    getRiskLevel(supplierData: SupplierData): RiskLevel {
        if (supplierData.status_receita === "ATIVA") {
            return "OK";
        } else if (supplierData.status_receita === "SUSPENSA" || supplierData.status_receita === "INAPTA") {
            return "WARNING";
        } else {
            return "CRITICAL_RISK";
        }
    }

    private getFromCache(cnpj: string): SupplierData | null {
        const entry = CNPJService.cache.get(cnpj);
        if (entry) {
            if (Date.now() - entry.cachedAt < CNPJService.cacheTTL) {
                return entry.data;
            } else {
                CNPJService.cache.delete(cnpj);
            }
        }
        return null;
    }

    private saveToCache(cnpj: string, data: SupplierData): void {
        CNPJService.cache.set(cnpj, {
            data,
            cachedAt: Date.now()
        });
        console.log(`[CNPJ Service] Cache SAVE para ${cnpj} (válido por 30 dias)`);
    }

    clearCache(cnpj?: string): void {
        if (cnpj) {
            const cnpjClean = cnpj.replace(/\D/g, '');
            CNPJService.cache.delete(cnpjClean);
            console.log(`[CNPJ Service] Cache cleared para ${cnpjClean}`);
        } else {
            CNPJService.cache.clear();
            console.log(`[CNPJ Service] Cache cleared (all)`);
        }
    }
}
