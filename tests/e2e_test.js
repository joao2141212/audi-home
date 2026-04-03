const { createClient } = require('@supabase/supabase-js');

// Config do novo DB provisionado
const supabaseUrl = 'https://nziggqeoeqaenugixtwr.supabase.co';
const supabaseKey = 'sb_publishable_ncad_WpHrzu4nhwkMCgrog_fnZpHIkM'; // A chave anon/publishable enviada

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log("================================");
  console.log("AUDITCONDO - E2E SUPABASE TEST");
  console.log("================================\n");

  console.log("1. Conexão Base (Modo Anônimo) - Testando RLS em public.condominios");
  console.log("   --> Deve retornar array vazio porque RLS bloqueia o acesso anônimo.");
  const { data: conds, error: errConds } = await supabase.from('condominios').select('*');
  if (errConds) {
    console.error("   ❌ Erro:", errConds.message || errConds);
  } else {
    console.log(`   ✅ Sucesso! Encontrou ${conds.length} condomínios (Esperado: 0 por causa do RLS)`);
  }

  console.log("\n2. Testando tabela sem RLS ou leitura pública: public.fornecedores");
  const { data: forn, error: errForn } = await supabase.from('fornecedores').select('cnpj').limit(1);
  if (errForn) {
    console.error("   ❌ Erro no cache de fornecedores:", errForn.message || errForn);
  } else {
    console.log(`   ✅ Sucesso! Cache de fornecedores acessível. Retornou ${forn.length}.`);
  }
}

testConnection().catch(console.error);
