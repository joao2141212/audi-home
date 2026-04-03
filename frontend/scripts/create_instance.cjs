const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function createInstance() {
    console.log('🔧 CRIANDO INSTÂNCIA AUTH FALTANTE\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // Verificar estrutura da tabela instances
        console.log('1. Verificando colunas de auth.instances...');
        const colsRes = await client.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'auth' AND table_name = 'instances'
            ORDER BY ordinal_position
        `);
        colsRes.rows.forEach(c => console.log(`   - ${c.column_name}: ${c.data_type}`));

        // Criar a instância com o UUID que os usuários esperam
        console.log('\n2. Inserindo instância...');
        await client.query(`
            INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
            VALUES (
                '00000000-0000-0000-0000-000000000000',
                '00000000-0000-0000-0000-000000000000',
                '{}',
                now(),
                now()
            )
            ON CONFLICT (id) DO NOTHING
        `);
        console.log('   ✅ Instância criada!');

        // Verificar
        const checkRes = await client.query(`SELECT * FROM auth.instances`);
        console.log('\n3. Instâncias agora:', checkRes.rows.length);
        checkRes.rows.forEach(i => console.log(`   - id: ${i.id}, uuid: ${i.uuid}`));

        console.log('\n✅ Concluído. Tente logar novamente.');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

createInstance();
