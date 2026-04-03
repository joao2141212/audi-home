/**
 * MÓDULO EXPERIMENTAL: Extração de PDF via texto + Cerebras
 * 
 * Este módulo é um TESTE isolado. Pode ser apagado sem quebrar nada.
 * Usa pdf-parse para extrair texto e Cerebras para análise.
 * 
 * QUANDO USAR: PDFs digitais (text-based) - extratos bancários, contratos
 * QUANDO NÃO USAR: Fotos, scans, imagens de notas fiscais
 */

const express = require('express');
const pdfParse = require('pdf-parse');

const router = express.Router();

// Sua API key do Cerebras
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

/**
 * Extrai texto de um PDF base64
 */
async function extractTextFromPDF(base64Data) {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        const data = await pdfParse(buffer);
        return {
            success: true,
            text: data.text,
            pages: data.numpages,
            chars: data.text.length
        };
    } catch (err) {
        return {
            success: false,
            error: err.message,
            text: ''
        };
    }
}

/**
 * Chama Cerebras para analisar o texto extraído
 */
async function analyzeWithCerebras(text, prompt) {
    if (!CEREBRAS_API_KEY) {
        return { success: false, error: 'CEREBRAS_API_KEY não configurada' };
    }

    try {
        const response = await fetch(CEREBRAS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CEREBRAS_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama3.1-8b', // Modelo rápido
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: text }
                ],
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Cerebras API error: ${response.status} - ${errorText}` };
        }

        const result = await response.json();
        return {
            success: true,
            content: result.choices[0].message.content,
            usage: result.usage
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ============ ENDPOINTS DE TESTE ============

/**
 * POST /api/experimental/test-pdf-extraction
 * Testa se um PDF pode ser extraído via texto
 */
router.post('/test-pdf-extraction', async (req, res) => {
    const { file_content_base64 } = req.body;

    if (!file_content_base64) {
        return res.status(400).json({ error: 'file_content_base64 required' });
    }

    const result = await extractTextFromPDF(file_content_base64);

    // Verifica se extraiu texto suficiente
    const isViable = result.success && result.chars > 100;

    res.json({
        viable: isViable,
        method: isViable ? 'CEREBRAS_TEXT' : 'GEMINI_VISION_NEEDED',
        ...result,
        preview: result.text.substring(0, 500) + '...'
    });
});

/**
 * POST /api/experimental/extract-statement-cerebras
 * Extrai transações de um extrato usando Cerebras (texto puro)
 */
router.post('/extract-statement-cerebras', async (req, res) => {
    const { file_content_base64 } = req.body;
    const startTime = Date.now();

    // 1. Extrai texto do PDF
    const extraction = await extractTextFromPDF(file_content_base64);

    if (!extraction.success || extraction.chars < 50) {
        return res.json({
            success: false,
            error: 'PDF não é text-based. Use Gemini Vision.',
            fallback: 'GEMINI'
        });
    }

    // 2. Prompt para Cerebras analisar o texto
    const prompt = `Você é um extrator de extratos bancários brasileiros.
Analise o texto abaixo e extraia TODAS as transações financeiras.

Retorne APENAS JSON válido (sem markdown):
{
  "transacoes": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "descrição completa",
      "valor": -1500.00,
      "tipo": "DEBIT"
    }
  ],
  "periodo_inicio": "YYYY-MM-DD",
  "periodo_fim": "YYYY-MM-DD"
}

REGRAS:
- Valor NEGATIVO = débito (saídas)
- Valor POSITIVO = crédito (entradas)
- tipo: "DEBIT" ou "CREDIT"
- Ignore cabeçalhos e saldos`;

    // 3. Chama Cerebras
    const analysis = await analyzeWithCerebras(extraction.text, prompt);

    if (!analysis.success) {
        return res.json({
            success: false,
            error: analysis.error,
            fallback: 'GEMINI'
        });
    }

    // 4. Parse do JSON
    try {
        let jsonText = analysis.content;
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonText);

        res.json({
            success: true,
            method: 'CEREBRAS',
            time_ms: Date.now() - startTime,
            tokens: analysis.usage,
            ...data
        });
    } catch (parseErr) {
        res.json({
            success: false,
            error: 'Falha ao parsear resposta do Cerebras',
            raw: analysis.content,
            fallback: 'GEMINI'
        });
    }
});

/**
 * GET /api/experimental/status
 * Verifica se o módulo está ativo e configurado
 */
router.get('/status', (req, res) => {
    res.json({
        module: 'experimental-cerebras',
        status: 'active',
        cerebras_configured: !!CEREBRAS_API_KEY,
        pdf_parse: 'installed',
        note: 'Este módulo é experimental e pode ser removido sem afetar o sistema.'
    });
});

module.exports = router;
