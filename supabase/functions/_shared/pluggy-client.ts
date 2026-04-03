/**
 * Pluggy Client - TypeScript (COMPLETO)
 * Portado de: backend/app/services/pluggy_service.py + adapters/pluggy.py
 * 
 * Service para integração com Pluggy API (Open Finance).
 */

declare const Deno: any;

// ============== INTERFACES ==============

export interface PluggyTransaction {
    id: string;
    description: string;
    amount: number;
    date: string;
    type: 'CREDIT' | 'DEBIT';
    category?: string;
    paymentData?: any;
    status?: string;
}

export interface PluggyAccount {
    id: string;
    itemId: string;
    type: string;
    subtype: string;
    number: string;
    name: string;
    balance: number;
    currencyCode: string;
    bankData?: any;
}

export interface StandardTransaction {
    id: string;
    amount: number;
    date: string;
    description: string;
    type: 'CREDIT' | 'DEBIT';
    provider_original_id: string;
    provider_name: string;
    metadata?: Record<string, any>;
}

export interface ConnectTokenResult {
    access_token: string;
    widget_url: string;
}

// ============== PLUGGY CLIENT ==============

export class PluggyClient {
    private baseUrl = "https://api.pluggy.ai";
    private clientId: string;
    private clientSecret: string;
    private accessToken: string | null = null;

    constructor() {
        this.clientId = Deno.env.get('PLUGGY_CLIENT_ID') || '';
        this.clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET') || '';

        if (!this.clientId || !this.clientSecret) {
            console.warn("⚠️ PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET não definidos");
        }
    }

    /**
     * Autentica com Pluggy e retorna o API Key
     */
    private async authenticate(): Promise<string> {
        if (this.accessToken) return this.accessToken;

        console.log(`[Pluggy] Autenticando com Client ID: ${this.clientId.substring(0, 8)}...`);

        const response = await fetch(`${this.baseUrl}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: this.clientId,
                clientSecret: this.clientSecret
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Pluggy auth failed: ${response.status} - ${error}`);
        }

        const data = await response.json();
        this.accessToken = data.apiKey;
        console.log(`[Pluggy] ✅ Autenticado com sucesso!`);

        return this.accessToken!;
    }

    /**
     * Cria um Connect Token para o Widget
     */
    async createConnectToken(itemId?: string, userId?: string): Promise<ConnectTokenResult> {
        const apiKey = await this.authenticate();

        console.log(`[Pluggy] Criando Connect Token...`);

        const payload: any = {};
        if (itemId) {
            payload.itemId = itemId;
        }
        if (userId) {
            payload.clientUserId = userId;
        }

        const response = await fetch(`${this.baseUrl}/connect_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to create connect token: ${response.status} - ${error}`);
        }

        const data = await response.json();
        console.log(`[Pluggy] ✅ Connect Token criado!`);

        return {
            access_token: data.accessToken,
            widget_url: `https://connect.pluggy.ai?connectToken=${data.accessToken}`
        };
    }

    /**
     * Busca transações de uma conta
     */
    async getTransactions(accountId: string, fromDate?: string): Promise<PluggyTransaction[]> {
        const apiKey = await this.authenticate();

        // Default: últimos 30 dias
        if (!fromDate) {
            const date = new Date();
            date.setDate(date.getDate() - 30);
            fromDate = date.toISOString().split('T')[0];
        }

        const params = new URLSearchParams({
            accountId,
            from: fromDate,
            pageSize: '500'
        });

        const response = await fetch(`${this.baseUrl}/transactions?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch transactions: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.results;
    }

    /**
     * Busca transações normalizadas (formato padrão)
     */
    async getStandardTransactions(accountId: string, fromDate?: string): Promise<StandardTransaction[]> {
        const transactions = await this.getTransactions(accountId, fromDate);

        return transactions.map(tx => this.toStandardTransaction(tx));
    }

    /**
     * Busca contas de um item (conexão)
     */
    async getAccounts(itemId: string): Promise<PluggyAccount[]> {
        const apiKey = await this.authenticate();

        const params = new URLSearchParams({ itemId });

        const response = await fetch(`${this.baseUrl}/accounts?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch accounts: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.results;
    }

    /**
     * Busca saldo de uma conta
     */
    async getBalance(accountId: string): Promise<number> {
        const apiKey = await this.authenticate();

        const response = await fetch(`${this.baseUrl}/accounts/${accountId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch balance: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.balance;
    }

    /**
     * Busca informações de um item
     */
    async getItem(itemId: string): Promise<any> {
        const apiKey = await this.authenticate();

        const response = await fetch(`${this.baseUrl}/items/${itemId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch item: ${response.status} - ${error}`);
        }

        return await response.json();
    }

    /**
     * Lista conectores (bancos) disponíveis
     */
    async getConnectors(sandbox: boolean = true): Promise<any[]> {
        const apiKey = await this.authenticate();

        const params = new URLSearchParams({ sandbox: sandbox.toString() });

        const response = await fetch(`${this.baseUrl}/connectors?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch connectors: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.results;
    }

    /**
     * Converte transação Pluggy para formato padrão
     */
    private toStandardTransaction(pluggyTx: PluggyTransaction): StandardTransaction {
        const amount = pluggyTx.amount;
        const txType: 'CREDIT' | 'DEBIT' = amount > 0 ? 'CREDIT' : 'DEBIT';

        return {
            id: pluggyTx.id,
            amount: Math.abs(amount),
            date: pluggyTx.date.split('T')[0], // YYYY-MM-DD
            description: pluggyTx.description,
            type: txType,
            provider_original_id: pluggyTx.id,
            provider_name: 'pluggy',
            metadata: {
                category: pluggyTx.category,
                paymentData: pluggyTx.paymentData
            }
        };
    }
}

// ============== OPEN FINANCE SERVICE ==============

export class OpenFinanceService {
    private provider: PluggyClient;
    private providerName: string = 'pluggy';

    constructor(provider: string = 'pluggy') {
        this.providerName = provider;

        if (provider === 'pluggy') {
            this.provider = new PluggyClient();
        } else {
            throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Cria conexão bancária para o usuário
     */
    async createBankConnection(userId: string): Promise<ConnectTokenResult> {
        return await this.provider.createConnectToken(undefined, userId);
    }

    /**
     * Sincroniza transações do banco
     */
    async syncTransactions(accountId: string, daysBack: number = 30): Promise<StandardTransaction[]> {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - daysBack);

        return await this.provider.getStandardTransactions(
            accountId,
            fromDate.toISOString().split('T')[0]
        );
    }

    /**
     * Busca saldo em tempo real
     */
    async getRealTimeBalance(accountId: string): Promise<number> {
        return await this.provider.getBalance(accountId);
    }
}
