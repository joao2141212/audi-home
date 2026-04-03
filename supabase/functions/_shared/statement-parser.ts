/**
 * Statement Parser - TypeScript
 * Portado de: backend/app/services/statement_parser.py
 * 
 * Parseia extratos bancários em múltiplos formatos (CSV, OFX, PDF via IA)
 */

declare const Deno: any;

// ============== INTERFACES ==============

export interface Transaction {
    data_transacao: string; // YYYY-MM-DD
    valor: number;
    tipo: 'credito' | 'debito' | 'CREDIT' | 'DEBIT';
    descricao: string | null;
    nsu: string | null;
    codigo_barras: string | null;
    conta_origem: string | null;
    conta_destino: string | null;
}

export interface ParseResult {
    transactions: Transaction[];
    periodo_inicio: string | null;
    periodo_fim: string | null;
    file_hash: string;
}

// ============== STATEMENT PARSER ==============

export class StatementParser {
    private supportedFormats = ['csv', 'ofx', 'pdf', 'txt'];

    /**
     * Calcula hash SHA-256 do arquivo para deduplicação
     */
    async calculateFileHash(fileContent: Uint8Array): Promise<string> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', fileContent);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Parse CSV de extrato bancário
     */
    parseCSV(content: string): ParseResult {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV vazio ou inválido');
        }

        // Detectar delimitador (vírgula ou ponto-e-vírgula)
        const delimiter = lines[0].includes(';') ? ';' : ',';

        // Parse header
        const headers = lines[0].split(delimiter).map(h => this.normalizeColumnName(h));

        // Mapear colunas
        const columnMapping: Record<string, string[]> = {
            'data': ['data', 'date', 'data_transacao', 'dt_transacao', 'dt'],
            'descricao': ['descricao', 'historico', 'description', 'desc', 'lancamento'],
            'valor': ['valor', 'value', 'amount', 'montante', 'vlr'],
            'tipo': ['tipo', 'type', 'natureza', 'dc', 'd/c']
        };

        const actualColumns: Record<string, number> = {};
        for (const [key, variations] of Object.entries(columnMapping)) {
            for (const variation of variations) {
                const idx = headers.indexOf(variation);
                if (idx !== -1) {
                    actualColumns[key] = idx;
                    break;
                }
            }
        }

        if (actualColumns['data'] === undefined || actualColumns['valor'] === undefined) {
            throw new Error("CSV deve conter pelo menos colunas 'data' e 'valor'");
        }

        // Parse transações
        const transactions: Transaction[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(delimiter);
            if (values.length < headers.length) continue;

            const dataStr = values[actualColumns['data']]?.trim();
            const valorStr = values[actualColumns['valor']]?.trim();

            const dataParsed = this.parseDate(dataStr);
            if (!dataParsed) continue;

            const valor = this.parseDecimal(valorStr);
            if (valor === null) continue;

            // Determinar tipo (crédito/débito)
            let tipo: Transaction['tipo'] = valor >= 0 ? 'credito' : 'debito';
            if (actualColumns['tipo'] !== undefined) {
                const tipoStr = values[actualColumns['tipo']]?.toLowerCase().trim();
                if (['c', 'credito', 'credit', 'cr'].includes(tipoStr)) {
                    tipo = 'credito';
                } else if (['d', 'debito', 'debit', 'db'].includes(tipoStr)) {
                    tipo = 'debito';
                }
            }

            const descricao = actualColumns['descricao'] !== undefined
                ? values[actualColumns['descricao']]?.trim() || null
                : null;

            transactions.push({
                data_transacao: dataParsed,
                valor: Math.abs(valor),
                tipo,
                descricao,
                nsu: null,
                codigo_barras: null,
                conta_origem: null,
                conta_destino: null
            });
        }

        // Determinar período
        const dates = transactions.map(t => t.data_transacao).sort();
        const periodo_inicio = dates.length > 0 ? dates[0] : null;
        const periodo_fim = dates.length > 0 ? dates[dates.length - 1] : null;

        return {
            transactions,
            periodo_inicio,
            periodo_fim,
            file_hash: ''
        };
    }

    /**
     * Parse OFX (Open Financial Exchange)
     * Formato estruturado usado por bancos
     */
    parseOFX(content: string): ParseResult {
        const transactions: Transaction[] = [];

        // Extrair transações do formato OFX
        // OFX usa tags SGML/XML
        const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
        let match;

        while ((match = stmtTrnRegex.exec(content)) !== null) {
            const block = match[1];

            // Extrair campos
            const trntype = this.extractOFXTag(block, 'TRNTYPE');
            const dtposted = this.extractOFXTag(block, 'DTPOSTED');
            const trnamt = this.extractOFXTag(block, 'TRNAMT');
            const memo = this.extractOFXTag(block, 'MEMO') || this.extractOFXTag(block, 'NAME');

            if (!dtposted || !trnamt) continue;

            // Parse data OFX (YYYYMMDD ou YYYYMMDDHHMMSS)
            const year = dtposted.substring(0, 4);
            const month = dtposted.substring(4, 6);
            const day = dtposted.substring(6, 8);
            const dataParsed = `${year}-${month}-${day}`;

            const valor = parseFloat(trnamt);
            if (isNaN(valor)) continue;

            const tipo: Transaction['tipo'] = valor >= 0 ? 'CREDIT' : 'DEBIT';

            transactions.push({
                data_transacao: dataParsed,
                valor: Math.abs(valor),
                tipo,
                descricao: memo,
                nsu: null,
                codigo_barras: null,
                conta_origem: null,
                conta_destino: null
            });
        }

        const dates = transactions.map(t => t.data_transacao).sort();

        return {
            transactions,
            periodo_inicio: dates.length > 0 ? dates[0] : null,
            periodo_fim: dates.length > 0 ? dates[dates.length - 1] : null,
            file_hash: ''
        };
    }

    private extractOFXTag(block: string, tagName: string): string | null {
        const regex = new RegExp(`<${tagName}>([^<\\n]+)`, 'i');
        const match = block.match(regex);
        return match ? match[1].trim() : null;
    }

    private normalizeColumnName(col: string): string {
        return col.toLowerCase().trim().replace(/\s+/g, '_').replace(/['"]/g, '');
    }

    private parseDate(dateStr: string): string | null {
        if (!dateStr) return null;

        const formats = [
            // YYYY-MM-DD
            { regex: /^(\d{4})-(\d{2})-(\d{2})$/, order: [1, 2, 3] },
            // DD/MM/YYYY
            { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: [3, 2, 1] },
            // DD-MM-YYYY
            { regex: /^(\d{2})-(\d{2})-(\d{4})$/, order: [3, 2, 1] },
            // MM/DD/YYYY
            { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: [3, 1, 2] },
        ];

        for (const fmt of formats) {
            const match = dateStr.match(fmt.regex);
            if (match) {
                const year = match[fmt.order[0]];
                const month = match[fmt.order[1]].padStart(2, '0');
                const day = match[fmt.order[2]].padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        }

        return null;
    }

    private parseDecimal(valueStr: string): number | null {
        if (!valueStr) return null;

        try {
            // Remover símbolos de moeda e espaços
            let cleaned = valueStr.replace(/[R$\s]/g, '');

            // Tratar formato brasileiro (1.234,56) vs americano (1,234.56)
            if (cleaned.includes(',') && !cleaned.includes('.')) {
                // Formato: 123,45
                cleaned = cleaned.replace(',', '.');
            } else if (cleaned.includes(',') && cleaned.includes('.')) {
                // Formato europeu/brasileiro: 1.234,56
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            }

            const value = parseFloat(cleaned);
            return isNaN(value) ? null : value;
        } catch {
            return null;
        }
    }
}
