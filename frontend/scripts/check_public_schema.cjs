const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function checkPublicSchema() {
    console.log('🔬 VERIFICANDO INTERFERÊNCIAS NO SCHEMA PUBLIC\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Verificar funções no public que referenciam auth
        console.log('1. Funções no schema public que podem interferir:');
        const funcsRes = await client.query(`
            SELECT p.proname, 
                   pg_get_function_arguments(p.oid) as args,
                   pg_get_functiondef(p.oid) as definition
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
            AND pg_get_functiondef(p.oid) LIKE '%auth%'
        `);
        console.log(`   Funções encontradas: ${funcsRes.rows.length}`);
        funcsRes.rows.forEach(f => {
            console.log(`\n   📌 ${f.proname}:`);
            console.log('   ' + f.definition.substring(0, 200) + '...');
        });

        // 2. Verificar triggers no public
        console.log('\n\n2. Triggers no schema public:');
        const trigRes = await client.query(`
            SELECT trigger_name, event_object_table, action_statement 
            FROM information_schema.triggers 
            WHERE trigger_schema = 'public'
        `);
        console.log(`   Triggers encontrados: ${trigRes.rows.length}`);
        trigRes.rows.forEach(t => console.log(`   - ${t.trigger_name} on ${t.event_object_table}`));

        // 3. Verificar se perfis tem trigger problemático
        console.log('\n3. Triggers especificamente na tabela perfis:');
        const perfisTrigRes = await client.query(`
            SELECT tgname, tgrelid::regclass, pg_get_triggerdef(oid) as def
            FROM pg_trigger
            WHERE tgrelid = 'public.perfis'::regclass
        `);
        perfisTrigRes.rows.forEach(t => {
            console.log(`   - ${t.tgname}`);
            console.log(`     ${t.def}`);
        });

        // 4. Verificar RLS policies que referenciam auth.uid()
        console.log('\n4. Políticas RLS que usam auth.uid():');
        const polRes = await client.query(`
            SELECT polrelid::regclass as table_name, polname, pg_get_expr(polqual, polrelid) as policy_expr
            FROM pg_policy
            WHERE pg_get_expr(polqual, polrelid) LIKE '%auth%'
        `);
        polRes.rows.forEach(p => {
            console.log(`   - ${p.table_name}: ${p.polname}`);
            console.log(`     ${p.policy_expr}`);
        });

        // 5. Tentar dropar e recriar as funções problemáticas
        console.log('\n5. Verificando se get_auth_role causa erro...');
        try {
            await client.query(`SELECT public.get_auth_role()`);
            console.log('   get_auth_role() - executou sem erro');
        } catch (e) {
            console.log(`   get_auth_role() - ❌ erro: ${e.message}`);
        }

        console.log('\n✅ Verificação concluída.');

    } catch (e) {
        console.error('❌ Erro geral:', e.message);
    } finally {
        await client.end();
    }
}

checkPublicSchema();
