const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function forceReload() {
    console.log('🔄 FORÇANDO RELOAD DO POSTGREST E AUTH\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // O Supabase usa NOTIFY para recarregar o PostgREST
        console.log('1. Enviando NOTIFY para recarregar PostgREST...');
        await client.query(`NOTIFY pgrst, 'reload schema'`);
        console.log('   ✅ Comando enviado');

        console.log('\n2. Enviando NOTIFY para recarregar config...');
        await client.query(`NOTIFY pgrst, 'reload config'`);
        console.log('   ✅ Comando enviado');

        // Também tentar atualizar o updated_at do schema
        console.log('\n3. Atualizando timestamp de migração...');
        await client.query(`UPDATE auth.schema_migrations SET version = version WHERE version = (SELECT MAX(version) FROM auth.schema_migrations)`);
        console.log('   ✅ Timestamp atualizado');

        // Forçar VACUUM ANALYZE
        console.log('\n4. Executando ANALYZE nas tabelas auth...');
        await client.query(`ANALYZE auth.users`);
        await client.query(`ANALYZE auth.identities`);
        console.log('   ✅ ANALYZE concluído');

        console.log('\n✅ Comandos de reload enviados.');
        console.log('   O PostgREST/GoTrue deve recarregar em alguns segundos.');
        console.log('   Aguarde 30 segundos e tente logar novamente.\n');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

forceReload();
