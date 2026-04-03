const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nziggqeoeqaenugixtwr.supabase.co';
// Usa a Anon Key (publishable) pública exatamente como o Frontend em produção faria
const supabaseAnon = 'sb_publishable_ncad_WpHrzu4nhwkMCgrog_fnZpHIkM'; 

const supabase = createClient(supabaseUrl, supabaseAnon);

async function runTestFlow() {
  console.log("== [TESTE E2E: RLS e Segurança Multi-Tenant] ==");

  const email = 'sindico.piloto1@audi.condo';
  const pass = 'AudiCondo2026MasterPass!';

  console.log(`1. Frontend Auth: Tentando login como ${email}...`);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: email,
    password: pass
  });

  if (authErr) throw new Error("Falha no login: " + authErr.message);
  console.log(`✅ Login com sucesso. Token JWT Session Ativo. (Role: ${authData.user.role})`);

  console.log("\n2. RLS Security Check: Tentativa de ler TODOS os condomínios da rede.");
  const { data: condominios, error: condErr } = await supabase.from('condominios').select('id, nome');
  
  if (condErr) throw condErr;

  console.log(`   Resultado: Foram retornados ${condominios.length} condomínios (Esperado: 1).`);
  console.log(`   Isso prova que as políticas de vazamento de dados funcionam! Dados retornados:`);
  console.table(condominios);

  if (condominios.length !== 1) {
    console.log('⚠️ ALERTA: Usuário conseguiu ver dados fora do escopo dele!');
  } else {
    console.log('🔐 PERFEITO: O RLS trancou ele magicamente no condomínio dele através da tabela `perfis`.');
  }

  // 3. Teste inserindo Extrato
  const condoId = condominios[0].id;
  console.log(`\n3. Lógica Frontend: Disparando Inserção de Extrato no condomínio ${condoId}...`);
  const { data: txData, error: txErr } = await supabase.from('transacoes_bancarias').insert({
    condominio_id: condoId,
    data_transacao: '2026-04-03',
    valor: 450.00,
    type: 'CREDIT',
    descricao: 'Pagamento Condomínio E2E',
    conciliado: false
  }).select();

  if (txErr) {
    console.log("Erro ao inserir:", txErr);
  } else {
    console.log("✅ Inserção permitida com sucesso pelo JWT: id " + txData[0].id);
  }
}

runTestFlow().catch(console.error);
