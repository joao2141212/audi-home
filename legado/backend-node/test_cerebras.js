const fs = require('fs');

// Simula um texto de extrato bancário em base64 (texto puro para teste)
const textoExtrato = `
BANCO EXEMPLO S.A.
EXTRATO DE CONTA CORRENTE

Período: 01/01/2024 a 31/01/2024
Agência: 1234 Conta: 56789-0

DATA        DESCRIÇÃO                      VALOR
---------------------------------------------------------
15/01/2024  PAGTO OTIS ELEVADORES         -1.500,00
18/01/2024  DEPOSITO COBRANÇA              +850,00
20/01/2024  PIX RECEBIDO JARDINS CIA      +450,00
22/01/2024  PAGTO REFORMA HALL            -2.800,00
25/01/2024  PAGTO ELETRICISTA JOSE        -320,00
28/01/2024  TED RECEBIDO TAXA COND       +5.000,00

SALDO ANTERIOR: R$ 10.000,00
SALDO ATUAL: R$ 11.680,00
`;

// Convertendo texto para base64 (simulando PDF text-based)
const base64 = Buffer.from(textoExtrato).toString('base64');

async function testCerebras() {
    console.log('🧪 Testando extração via Cerebras...\n');
    
    const response = await fetch('http://localhost:3001/api/experimental/extract-statement-cerebras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_content_base64: base64 })
    });
    
    const result = await response.json();
    console.log('📊 Resultado:');
    console.log(JSON.stringify(result, null, 2));
}

testCerebras();
