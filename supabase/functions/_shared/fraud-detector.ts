/**
 * Fraud Detector - TypeScript
 * Portado de: backend/app/services/fraud_detector.py
 * 
 * Detecta adulteração, duplicatas e padrões suspeitos em comprovantes.
 */

declare const Deno: any;

// ============== INTERFACES ==============

export interface FraudAnalysisResult {
    fraud_score: number;
    fraud_flags: string[];
    documento_alterado: boolean;
}

export interface BarcodeValidationResult {
    valid: boolean;
    reason?: string;
    barcode_value?: number;
    expected_value?: number;
}

// ============== FRAUD DETECTOR ==============

export class FraudDetector {
    private fraudFlags: string[] = [];
    private fraudScore: number = 0;

    // Software suspeito que indica edição
    private static SUSPICIOUS_SOFTWARE = [
        'photoshop', 'gimp', 'canva', 'pixlr', 'paint.net',
        'ilovepdf', 'smallpdf', 'pdf24', 'sejda', 'foxit',
        'adobe acrobat', 'nitro'
    ];

    // Software confiável de bancos
    private static TRUSTED_BANK_SOFTWARE = [
        'itau', 'bradesco', 'santander', 'banco do brasil',
        'caixa', 'nubank', 'inter', 'sicoob', 'sicredi',
        'btg', 'safra', 'original'
    ];

    /**
     * Análise de metadados simplificada (sem EXIF - Deno não tem PIL)
     * Foca em análise de header do arquivo
     */
    analyze(
        mimeType: string,
        fileSize: number,
        headerContent: string
    ): FraudAnalysisResult {
        this.fraudFlags = [];
        this.fraudScore = 0;

        // 1. Análise de tamanho de arquivo
        this.checkFileSize(mimeType, fileSize);

        // 2. Análise de metadados do PDF (se aplicável)
        if (mimeType === 'application/pdf' || headerContent.includes('%PDF')) {
            this.analyzePDFMetadata(headerContent);
        }

        // Cap score at 100
        this.fraudScore = Math.min(this.fraudScore, 100);

        return {
            fraud_score: this.fraudScore,
            fraud_flags: this.fraudFlags,
            documento_alterado: this.fraudScore > 50
        };
    }

    /**
     * Análise completa assíncrona (com hash para duplicatas)
     */
    async analyzeReceipt(
        fileContent: Uint8Array,
        fileType: string,
        fileHash: string,
        existingHashes: string[]
    ): Promise<FraudAnalysisResult> {
        this.fraudFlags = [];
        this.fraudScore = 0;

        // 1. Detecção de duplicatas
        if (existingHashes.includes(fileHash)) {
            this.fraudFlags.push("duplicate_file");
            this.fraudScore += 40;
        }

        // 2. Análise de tamanho
        const mimeType = fileType.includes('pdf') ? 'application/pdf' : `image/${fileType}`;
        this.checkFileSize(mimeType, fileContent.length);

        // 3. Análise de metadados
        const headerContent = new TextDecoder('latin1').decode(fileContent.slice(0, 2048));

        if (fileType === 'pdf' || headerContent.includes('%PDF')) {
            this.analyzePDFMetadata(headerContent);
        } else if (['jpg', 'jpeg', 'png'].includes(fileType)) {
            this.analyzeImageMetadata(headerContent);
        }

        // Cap score at 100
        this.fraudScore = Math.min(this.fraudScore, 100);

        return {
            fraud_score: this.fraudScore,
            fraud_flags: this.fraudFlags,
            documento_alterado: this.fraudScore > 50
        };
    }

    private checkFileSize(mimeType: string, size: number): void {
        if (mimeType.includes('pdf')) {
            if (size < 10000) { // < 10KB
                this.fraudFlags.push('file_too_small');
                this.fraudScore += 10;
            }
            if (size > 5000000) { // > 5MB
                this.fraudFlags.push('file_too_large');
                this.fraudScore += 10;
            }
        } else if (mimeType.includes('image')) {
            if (size < 5000) { // < 5KB
                this.fraudFlags.push('image_too_small');
                this.fraudScore += 10;
            }
            if (size > 10000000) { // > 10MB
                this.fraudFlags.push('image_too_large');
                this.fraudScore += 10;
            }
        }
    }

    private analyzePDFMetadata(content: string): void {
        // Extrair Creator
        const creatorMatch = content.match(/\/Creator\s*\(([^)]*)\)/i);
        if (creatorMatch) {
            const creator = creatorMatch[1].toLowerCase();

            // Check if created by suspicious software
            if (FraudDetector.SUSPICIOUS_SOFTWARE.some(sus => creator.includes(sus))) {
                this.fraudFlags.push('pdf_created_with_editor');
                this.fraudScore += 35;
            }

            // Check if created by trusted bank software
            if (FraudDetector.TRUSTED_BANK_SOFTWARE.some(bank => creator.includes(bank))) {
                this.fraudScore -= 10; // Bom sinal
            }
        } else {
            this.fraudFlags.push('no_pdf_creator');
            this.fraudScore += 15;
        }

        // Check Producer
        const producerMatch = content.match(/\/Producer\s*\(([^)]*)\)/i);
        if (producerMatch) {
            const producer = producerMatch[1].toLowerCase();
            if (FraudDetector.SUSPICIOUS_SOFTWARE.some(sus => producer.includes(sus))) {
                this.fraudFlags.push('pdf_produced_with_editor');
                this.fraudScore += 25;
            }
        }

        // Check modification date vs creation date
        const modDateMatch = content.match(/\/ModDate\s*\(([^)]*)\)/i);
        const creationDateMatch = content.match(/\/CreationDate\s*\(([^)]*)\)/i);

        if (modDateMatch && creationDateMatch) {
            const modDate = modDateMatch[1];
            const creationDate = creationDateMatch[1];

            if (modDate !== creationDate) {
                this.fraudFlags.push('pdf_modified_after_creation');
                this.fraudScore += 20;
            }
        }
    }

    private analyzeImageMetadata(content: string): void {
        // Verificar se tem assinatura de software de edição no header
        const lowerContent = content.toLowerCase();

        if (FraudDetector.SUSPICIOUS_SOFTWARE.some(sus => lowerContent.includes(sus))) {
            this.fraudFlags.push('image_edited_with_software');
            this.fraudScore += 30;
        }

        // Verificar screenshot (comum em fraudes)
        if (lowerContent.includes('screenshot') || lowerContent.includes('screen capture')) {
            this.fraudFlags.push('screenshot_detected');
            this.fraudScore += 25;
        }

        // Se não tem metadados EXIF básicos (muito simples aqui)
        if (!content.includes('Exif') && !content.includes('JFIF')) {
            this.fraudFlags.push('no_image_metadata');
            this.fraudScore += 10;
        }
    }

    /**
     * Valida código de barras de boleto brasileiro
     */
    validateBarcode(barcode: string, expectedValue?: number): BarcodeValidationResult {
        if (!barcode || ![44, 47, 48].includes(barcode.length)) {
            return { valid: false, reason: 'invalid_length' };
        }

        // Remove espaços e pontos
        const cleanBarcode = barcode.replace(/[\s.]/g, '');

        try {
            if (cleanBarcode.length >= 44) {
                // Valor está nas posições 37-47 (em centavos)
                const valueStr = cleanBarcode.substring(37, 47);
                const valueCentavos = parseInt(valueStr, 10);
                const valueReais = valueCentavos / 100;

                if (expectedValue !== undefined) {
                    const tolerance = expectedValue * 0.01; // 1% tolerância
                    if (Math.abs(valueReais - expectedValue) > tolerance) {
                        return {
                            valid: false,
                            reason: 'value_mismatch',
                            barcode_value: valueReais,
                            expected_value: expectedValue
                        };
                    }
                }

                return {
                    valid: true,
                    barcode_value: valueReais
                };
            }
        } catch {
            return { valid: false, reason: 'parsing_error' };
        }

        return { valid: true };
    }

    /**
     * Checa duplicata semântica (texto similar)
     */
    checkSemanticDuplicate(
        ocrText: string,
        existingTexts: string[],
        similarityThreshold: number = 0.9
    ): boolean {
        if (!ocrText || !existingTexts.length) {
            return false;
        }

        const ocrNormalized = this.normalizeText(ocrText);

        for (const existing of existingTexts) {
            const existingNormalized = this.normalizeText(existing);
            const similarity = this.calculateSimilarity(ocrNormalized, existingNormalized);

            if (similarity >= similarityThreshold) {
                return true;
            }
        }

        return false;
    }

    private normalizeText(text: string): string {
        // Remove números (datas, valores mudam mas estrutura fica igual)
        let normalized = text.replace(/\d+/g, '');
        // Remove caracteres especiais
        normalized = normalized.replace(/[^\w\s]/g, '');
        // Lowercase e trim
        return normalized.toLowerCase().trim();
    }

    private calculateSimilarity(text1: string, text2: string): number {
        if (!text1 || !text2) return 0;

        const words1 = new Set(text1.split(/\s+/));
        const words2 = new Set(text2.split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        if (union.size === 0) return 0;

        return intersection.size / union.size;
    }
}
