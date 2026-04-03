const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function fixInstanceId() {
    console.log('🔧 CORRIGINDO INSTANCE_ID\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // Verificar se há algum instance válido
        console.log('1. Verificando auth.instances...');
        const instRes = await client.query(`SELECT * FROM auth.instances`);
        console.log(`   Instâncias: ${instRes.rows.length}`);
        instRes.rows.forEach(i => console.log(`   - ${i.id}`));

        // Se não houver instância, verificar qual é a UUID correta no projeto
        // Normalmente o Supabase usa uma instância específica

        // Vamos verificar o que as configurações do projeto esperam
        console.log('\n2. Tentando criar instância se não existir...');
        try {
            // Supabase espera instance_id como null em projetos novos
            // Vamos setar os users para ter instance_id = null
            await client.query(`
                UPDATE auth.users 
                SET instance_id = null 
                WHERE instance_id = '00000000-0000-0000-0000-000000000000'
            `);
            console.log('   ✅ instance_id setado para NULL');
        } catch (e) {
            console.log(`   ❌ erro: ${e.message}`);
        }

        // Verificar resultado
        console.log('\n3. Verificando após correção...');
        const checkRes = await client.query(`SELECT id, email, instance_id FROM auth.users`);
        checkRes.rows.forEach(u => console.log(`   - ${u.email}: instance_id = ${u.instance_id}`));

        console.log('\n✅ Tente logar novamente.');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

fixInstanceId();
