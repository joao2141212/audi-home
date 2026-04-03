// Teste direto da API Cerebras (sem PDF)
const CEREBRAS_API_KEY = 'csk-3xxwctfe2e4w8my3nfjpjfedfc4yk9n83ndcd2yn5rj535jm';

const textoExtrato = `
BANCO EXEMPLO S.A.
EXTRATO DE CONTA CORRENTE
Período: 01/01/2024 a 31/01/2024

DATA        DESCRIÇÃO                      VALOR
15/01/2024  PAGTO OTIS ELEVADORES         -1500.00
18/01/2024  DEPOSITO COBRANÇA              +850.00
20/01/2024  PIX RECEBIDO JARDINS CIA      +450.00
22/01/2024  PAGTO REFORMA HALL            -2800.00
25/01/2024  PAGTO ELETRICISTA JOSE        -320.00
`;

const prompt = `Você é um extrator de extratos bancários.
Analise o texto e extraia as transações.

Retorne APENAS JSON válido:
{
  "transacoes": [
    {"data": "YYYY-MM-DD", "descricao": "texto", "valor": -1500.00, "tipo": "DEBIT"}
  ],
  "periodo_inicio": "YYYY-MM-DD",
  "periodo_fim": "YYYY-MM-DD"
}

REGRAS:
- Valor NEGATIVO = DEBIT
- Valor POSITIVO = CREDIT`;

async function test() {
    console.log('🚀 Chamando Cerebras diretamente...\n');
    const start = Date.now();
    
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CEREBRAS_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama3.1-8b',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: textoExtrato }
            ],
            max_tokens: 2000,
            temperature: 0.1
        })
    });
    
    const elapsed = Date.now() - start;
    console.log(`⏱️ Tempo: ${elapsed}ms`);
    
    const result = await response.json();
    
    if (result.choices) {
        console.log('\n✅ Resposta do Cerebras:');
        console.log(result.choices[0].message.content);
        console.log('\n📊 Tokens:', result.usage);
    } else {
        console.log('❌ Erro:', JSON.stringify(result, null, 2));
    }
}

test();
