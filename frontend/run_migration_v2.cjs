const pg = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260113130000_audi_home_hierarchy_v2.sql');
        console.log(`📖 Lendo migração de: ${migrationPath}`);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('🔌 Conectando ao Supabase...');
        await client.connect();
        console.log('✅ Conectado!');

        console.log('🔨 Executando migração consolidated (Hierarquia + RLS)...');
        await client.query(sql);
        console.log('🚀 Migração concluída com sucesso no Supabase!');

    } catch (err) {
        console.error('❌ Erro durante a migração:', err.message);
        if (err.detail) console.error('Detalhe:', err.detail);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
