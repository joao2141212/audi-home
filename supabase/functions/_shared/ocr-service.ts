/**
 * OCR Service - TypeScript
 * Portado de: backend/app/services/ocr_service.py
 * 
 * Usa Google Gemini para extração de dados de comprovantes (imagens/PDFs)
 */

declare const Deno: any;

// ============== INTERFACES ==============

export interface OCRResult {
    ocr_processado: boolean;
    ocr_confianca: number;
    ocr_valor: number | null;
    ocr_data: string | null; // YYYY-MM-DD
    ocr_nsu: string | null;
    ocr_codigo_barras: string | null;
    ocr_cnpj: string | null;
    ocr_razao_social: string | null;
    ocr_texto_completo: string | null;
    ocr_erro: string | null;
    tokens_used: number;
}

// ============== OCR SERVICE ==============

export class OCRService {
    private apiKey: string;

    constructor() {
        this.apiKey = Deno.env.get('GOOGLE_API_KEY') || '';
        if (!this.apiKey) {
            console.warn("⚠️ GOOGLE_API_KEY não configurada. OCR não funcionará.");
        }
    }

    /**
     * Processa comprovante usando Gemini Vision
     */
    async processReceipt(base64Content: string, mimeType: string): Promise<OCRResult> {
        if (!this.apiKey) {
            return {
                ocr_processado: false,
                ocr_confianca: 0,
                ocr_valor: null,
                ocr_data: null,
                ocr_nsu: null,
                ocr_codigo_barras: null,
                ocr_cnpj: null,
                ocr_razao_social: null,
                ocr_texto_completo: null,
                ocr_erro: 'GOOGLE_API_KEY não configurada',
                tokens_used: 0
            };
        }

        try {
            const prompt = `Você é um especialista em análise de documentos financeiros brasileiros.
Analise este documento (comprovante de pagamento, nota fiscal, recibo, boleto) e extraia os dados.

Retorne APENAS JSON válido (sem markdown, sem \`\`\`):
{
  "valor": 1234.56,
  "data": "YYYY-MM-DD",
  "nsu": "123456",
  "codigo_barras": "23793.12345 12345.678901 12345.678901 1 12340000012345",
  "cnpj": "12345678000199",
  "razao_social": "Nome da Empresa",
  "tipo_documento": "comprovante_pix|boleto|nota_fiscal|recibo|transferencia",
  "confianca": 85
}

REGRAS:
- valor: Valor total pago (float, sem R$)
- data: Data do pagamento no formato YYYY-MM-DD
- nsu: Número Sequencial Único (se existir)
- codigo_barras: Código de barras do boleto (se existir)
- cnpj: CNPJ do recebedor/emissor (14 dígitos, sem formatação)
- razao_social: Nome da empresa
- confianca: Sua confiança de 0-100 nos dados extraídos

Se não encontrar algum campo, use null.`;

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inline_data: { mime_type: mimeType, data: base64Content } }
                            ]
                        }]
                    })
                }
            );

            const result = await response.json();
            const tokens = (result.usageMetadata?.promptTokenCount || 0) +
                (result.usageMetadata?.candidatesTokenCount || 0);

            if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                const jsonText = result.candidates[0].content.parts[0].text
                    .replace(/```json\s*/g, '')
                    .replace(/```/g, '')
                    .trim();

                try {
                    const parsed = JSON.parse(jsonText);

                    return {
                        ocr_processado: true,
                        ocr_confianca: parsed.confianca || 70,
                        ocr_valor: parsed.valor || null,
                        ocr_data: parsed.data || null,
                        ocr_nsu: parsed.nsu || null,
                        ocr_codigo_barras: parsed.codigo_barras || null,
                        ocr_cnpj: parsed.cnpj || null,
                        ocr_razao_social: parsed.razao_social || null,
                        ocr_texto_completo: jsonText,
                        ocr_erro: null,
                        tokens_used: tokens
                    };
                } catch (parseError) {
                    console.error("Falha ao parsear JSON do Gemini:", parseError);
                    // Tentar extrair com regex
                    return {
                        ...this.extractWithRegex(jsonText),
                        ocr_processado: true,
                        ocr_confianca: 50,
                        ocr_texto_completo: jsonText,
                        ocr_erro: 'JSON parse failed, usando regex',
                        tokens_used: tokens
                    };
                }
            }

            return {
                ocr_processado: false,
                ocr_confianca: 0,
                ocr_valor: null,
                ocr_data: null,
                ocr_nsu: null,
                ocr_codigo_barras: null,
                ocr_cnpj: null,
                ocr_razao_social: null,
                ocr_texto_completo: null,
                ocr_erro: 'Gemini não retornou resposta válida',
                tokens_used: tokens
            };

        } catch (error) {
            return {
                ocr_processado: false,
                ocr_confianca: 0,
                ocr_valor: null,
                ocr_data: null,
                ocr_nsu: null,
                ocr_codigo_barras: null,
                ocr_cnpj: null,
                ocr_razao_social: null,
                ocr_texto_completo: null,
                ocr_erro: (error as Error).message,
                tokens_used: 0
            };
        }
    }

    /**
     * Extrai dados usando regex (fallback)
     */
    private extractWithRegex(text: string): Partial<OCRResult> {
        const result: Partial<OCRResult> = {
            ocr_valor: null,
            ocr_data: null,
            ocr_nsu: null,
            ocr_codigo_barras: null,
            ocr_cnpj: null,
            ocr_razao_social: null
        };

        // Extrair valor
        const valorPatterns = [
            /R\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
            /valor[:\s]+R?\$?\s*(\d+[,\.]\d{2})/i,
        ];
        for (const pattern of valorPatterns) {
            const match = text.match(pattern);
            if (match) {
                const valorStr = match[1].replace(/\./g, '').replace(',', '.');
                result.ocr_valor = parseFloat(valorStr);
                break;
            }
        }

        // Extrair data
        const dataPatterns = [
            /(\d{2}[/-]\d{2}[/-]\d{4})/,
            /(\d{4}[/-]\d{2}[/-]\d{2})/,
        ];
        for (const pattern of dataPatterns) {
            const match = text.match(pattern);
            if (match) {
                result.ocr_data = this.parseDate(match[1]);
                break;
            }
        }

        // Extrair NSU
        const nsuMatch = text.match(/NSU[:\s]+(\d{6,})/i);
        if (nsuMatch) {
            result.ocr_nsu = nsuMatch[1];
        }

        // Extrair código de barras
        const barcodeMatch = text.match(/(\d{44,48})/);
        if (barcodeMatch) {
            result.ocr_codigo_barras = barcodeMatch[1];
        }

        // Extrair CNPJ
        const cnpjMatch = text.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
        if (cnpjMatch) {
            result.ocr_cnpj = cnpjMatch[1].replace(/\D/g, '');
        }

        return result;
    }

    private parseDate(dateStr: string): string | null {
        const formats = [
            { regex: /^(\d{4})-(\d{2})-(\d{2})$/, order: [1, 2, 3] },
            { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: [3, 2, 1] },
            { regex: /^(\d{2})-(\d{2})-(\d{4})$/, order: [3, 2, 1] },
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
}
