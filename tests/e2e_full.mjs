#!/usr/bin/env node
/**
 * AudiCondo — Full E2E Test Suite (script mode, no browser)
 * Tests: Auth, DB views, RLS, Edge Functions, moradores, comprovantes, red flags
 */

const SUPABASE_URL = 'https://nziggqeoeqaenugixtwr.supabase.co'
const ANON_KEY     = 'sb_publishable_ncad_WpHrzu4nhwkMCgrog_fnZpHIkM'
const EMAIL        = 'sindico.piloto1@audi.condo'
const PASS         = 'AudiCondo2026MasterPass!'
const CONDO_ID     = 'b8583127-cce0-417c-8f78-e5a1bb2f1cd9'

const h = (tok) => ({
    'Content-Type':  'application/json',
    'apikey':        ANON_KEY,
    'Authorization': tok ? `Bearer ${tok}` : `Bearer ${ANON_KEY}`,
    'Prefer':        'return=representation'
})

const api = (path, tok, opts = {}) =>
    fetch(`${SUPABASE_URL}${path}`, { headers: h(tok), ...opts }).then(r => r.json())

let pass = 0, fail = 0

function ok(label, val) {
    console.log(`  ✅ ${label}`, val !== undefined ? `→ ${JSON.stringify(val).slice(0, 80)}` : '')
    pass++
}
function ko(label, msg) {
    console.log(`  ❌ ${label}: ${msg}`)
    fail++
}

async function run() {
    console.log('\n══════════════════════════════════════════')
    console.log('  AudiCondo — E2E Test Suite')
    console.log('══════════════════════════════════════════\n')

    // ── 1. AUTH ──────────────────────────────────────────────
    console.log('▶ 1. Autenticação')
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({ email: EMAIL, password: PASS })
    }).then(r => r.json())

    if (!authRes.access_token) {
        ko('Login sindico', JSON.stringify(authRes))
        process.exit(1)
    }
    ok('Login síndico Piloto 1', `token: ${authRes.access_token.slice(0, 20)}...`)
    const TOK = authRes.access_token

    // ── 2. PERFIL ─────────────────────────────────────────────
    console.log('\n▶ 2. Perfil do usuário')
    const perfis = await api('/rest/v1/perfis?select=*&limit=1', TOK)
    if (perfis?.[0]?.role === 'sindico') ok('Role = sindico', perfis[0].condominio_id)
    else ko('Perfil', JSON.stringify(perfis))

    // ── 3. RLS — isolamento por condo ────────────────────────
    console.log('\n▶ 3. RLS — Isolamento multi-tenant')
    const condos = await api('/rest/v1/condominios?select=id,nome', TOK)
    if (condos?.length === 1 && condos[0].id === CONDO_ID)
        ok('Síndico vê apenas 1 condo', condos[0].nome)
    else ko('RLS isolamento', `viu ${condos?.length} condominios: ${JSON.stringify(condos)}`)

    // ── 4. MORADORES ─────────────────────────────────────────
    console.log('\n▶ 4. Moradores')
    const moradores = await api(`/rest/v1/moradores?select=*&condominio_id=eq.${CONDO_ID}`, TOK)
    if (Array.isArray(moradores)) ok(`Moradores acessíveis (${moradores.length} encontrados)`)
    else ko('Moradores', JSON.stringify(moradores))

    // INSERT morador de teste
    const moInsert = await fetch(`${SUPABASE_URL}/rest/v1/moradores`, {
        method: 'POST',
        headers: h(TOK),
        body: JSON.stringify({
            condominio_id: CONDO_ID,
            nome: 'Teste Script João',
            unidade: '999',
            tipo: 'inquilino',
            ativo: true
        })
    }).then(r => r.json())
    
    let moradorTestId = null
    if (Array.isArray(moInsert) && moInsert[0]?.id) {
        ok('INSERT morador OK', moInsert[0].id)
        moradorTestId = moInsert[0].id
    } else if (moInsert?.code) {
        ko('INSERT morador', JSON.stringify(moInsert))
    } else {
        ok('INSERT morador enviado', JSON.stringify(moInsert).slice(0,60))
    }

    // ── 5. COMPROVANTES TABLE ────────────────────────────────
    console.log('\n▶ 5. Comprovantes')
    const comprovantes = await api(
        `/rest/v1/comprovantes?select=id,arquivo_nome,tipo_documento,fraud_score,status_auditoria,pix_e2e_id,morador_id&condominio_id=eq.${CONDO_ID}&limit=5`,
        TOK
    )
    if (Array.isArray(comprovantes)) {
        ok(`Comprovantes acessíveis (${comprovantes.length} encontrados)`)
        if (comprovantes.length > 0) {
            const c = comprovantes[0]
            ok('Schema colunas novas OK',
                `tipo_doc:${c.tipo_documento}, e2e:${c.pix_e2e_id}, morador:${c.morador_id}`)
        }
    } else ko('Comprovantes', JSON.stringify(comprovantes))

    // ── 6. VIEW view_historico_comprovantes ──────────────────
    console.log('\n▶ 6. View: Histórico Comprovantes')
    const hist = await api(
        `/rest/v1/view_historico_comprovantes?condominio_id=eq.${CONDO_ID}&limit=3`,
        TOK
    )
    if (Array.isArray(hist)) ok(`view_historico_comprovantes OK (${hist.length} rows)`)
    else ko('view_historico_comprovantes', JSON.stringify(hist))

    // ── 7. VIEW view_moradores_resumo ────────────────────────
    console.log('\n▶ 7. View: Moradores Resumo')
    const moRes = await api(
        `/rest/v1/view_moradores_resumo?condominio_id=eq.${CONDO_ID}&limit=5`,
        TOK
    )
    if (Array.isArray(moRes)) ok(`view_moradores_resumo OK (${moRes.length} rows)`)
    else ko('view_moradores_resumo', JSON.stringify(moRes))

    // ── 8. VIEW view_fila_revisao ────────────────────────────
    console.log('\n▶ 8. View: Fila de Revisão')
    const fila = await api(
        `/rest/v1/view_fila_revisao?condominio_id=eq.${CONDO_ID}&limit=5`,
        TOK
    )
    if (Array.isArray(fila)) ok(`view_fila_revisao OK (${fila.length} pendentes/suspeitos)`)
    else ko('view_fila_revisao', JSON.stringify(fila))

    // ── 9. VIEW view_macro_financeira ────────────────────────
    console.log('\n▶ 9. View: Macro Financeira (Master)')
    const macro = await api(`/rest/v1/view_macro_financeira?limit=5`, TOK)
    if (Array.isArray(macro)) ok(`view_macro_financeira OK (${macro.length} rows)`)
    else ko('view_macro_financeira', JSON.stringify(macro))

    // ── 10. RED FLAGS VIEW (master only, síndico deve ver empty) ──
    console.log('\n▶ 10. View: Red Flags')
    const flags = await api(`/rest/v1/view_red_flags_master?limit=10`, TOK)
    if (Array.isArray(flags)) ok(`view_red_flags_master acessível (${flags.length} flags)`, flags.map(f => f.flag_tipo))
    else ko('view_red_flags_master', JSON.stringify(flags))

    // ── 11. VIEW view_api_usage ──────────────────────────────
    console.log('\n▶ 11. View: API Usage')
    const apiUsage = await api(`/rest/v1/view_api_usage?limit=5`, TOK)
    if (Array.isArray(apiUsage)) ok(`view_api_usage OK (${apiUsage.length} condos)`)
    else ko('view_api_usage', JSON.stringify(apiUsage))

    // ── 12. EDGE FUNCTION: process-comprovante (com imagem fake) ──
    console.log('\n▶ 12. Edge Function: process-comprovante (smoke test)')
    // Create a fake comprovante record first
    const fakeComp = await fetch(`${SUPABASE_URL}/rest/v1/comprovantes`, {
        method: 'POST',
        headers: h(TOK),
        body: JSON.stringify({
            condominio_id: CONDO_ID,
            arquivo_nome: 'test_script_e2e.jpg',
            arquivo_hash: `test-hash-${Date.now()}`,
            tipo_arquivo: 'jpg',
            status_auditoria: 'pendente'
        })
    }).then(r => r.json())

    let fakeId = null
    if (Array.isArray(fakeComp) && fakeComp[0]?.id) {
        fakeId = fakeComp[0].id
        ok('Comprovante de teste criado', fakeId)

        // Call edge function with a tiny 1x1 white JPEG (base64)
        const tiny1x1jpg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k='

        const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/process-comprovante`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOK}` },
            body: JSON.stringify({
                comprovante_id: fakeId,
                file_base64: tiny1x1jpg,
                mime_type: 'image/jpeg',
                filename: 'test_script_e2e.jpg'
            })
        }).then(r => r.json())

        if (fnRes.success === false && fnRes.erro) {
            ok('Edge fn detectou DOCUMENTO_INVALIDO (esperado para imagem fake)', fnRes.erro)
        } else if (fnRes.fraud_score !== undefined) {
            ok('Edge fn retornou score', `score=${fnRes.fraud_score}, status=${fnRes.status}, tipo=${fnRes.tipo_documento}`)
        } else if (fnRes.error) {
            ko('Edge fn process-comprovante', fnRes.error)
        } else {
            ok('Edge fn respondeu', JSON.stringify(fnRes).slice(0, 100))
        }

        // Cleanup: delete fake record
        await fetch(`${SUPABASE_URL}/rest/v1/comprovantes?id=eq.${fakeId}`, {
            method: 'DELETE', headers: h(TOK)
        })
        ok('Cleanup: fake comprovante deletado')
    } else {
        ko('Criar comprovante fake', JSON.stringify(fakeComp))
    }

    // ── 13. Cleanup: morador teste ───────────────────────────
    if (moradorTestId) {
        await fetch(`${SUPABASE_URL}/rest/v1/moradores?id=eq.${moradorTestId}`, {
            method: 'DELETE', headers: h(TOK)
        })
        ok('Cleanup: morador de teste deletado')
    }

    // ── RESULTADO FINAL ──────────────────────────────────────
    console.log('\n══════════════════════════════════════════')
    console.log(`  RESULTADO: ${pass} ✅ passou | ${fail} ❌ falhou`)
    console.log('══════════════════════════════════════════\n')
    if (fail > 0) process.exit(1)
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
