const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function diagnose() {
    console.log('🔍 DIAGNÓSTICO COMPLETO DO SUPABASE AUTH\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Verificar se auth.users existe e tem os usuários
        console.log('1. Verificando auth.users...');
        const usersRes = await client.query(`SELECT id, email, created_at FROM auth.users LIMIT 10`);
        console.log(`   Usuários encontrados: ${usersRes.rows.length}`);
        usersRes.rows.forEach(u => console.log(`   - ${u.email} (${u.id})`));

        // 2. Verificar se public.perfis existe
        console.log('\n2. Verificando public.perfis...');
        const perfisRes = await client.query(`SELECT id, email, role, condominio_id FROM public.perfis LIMIT 10`);
        console.log(`   Perfis encontrados: ${perfisRes.rows.length}`);
        perfisRes.rows.forEach(p => console.log(`   - ${p.email} / ${p.role} / condo:${p.condominio_id}`));

        // 3. Verificar se há triggers no auth.users que podem estar falhando
        console.log('\n3. Verificando Triggers em auth.users...');
        const triggersRes = await client.query(`
            SELECT trigger_name, event_manipulation, action_statement  
            FROM information_schema.triggers 
            WHERE event_object_schema = 'auth' AND event_object_table = 'users'
        `);
        console.log(`   Triggers encontrados: ${triggersRes.rows.length}`);
        triggersRes.rows.forEach(t => console.log(`   - ${t.trigger_name}: ${t.event_manipulation}`));

        // 4. Verificar se o usuário master tem identidade
        console.log('\n4. Verificando auth.identities para master...');
        const masterUser = usersRes.rows.find(u => u.email === 'master@audi.home');
        if (masterUser) {
            const identRes = await client.query(`SELECT * FROM auth.identities WHERE user_id = $1`, [masterUser.id]);
            console.log(`   Identidades para master: ${identRes.rows.length}`);
            if (identRes.rows.length === 0) {
                console.log('   ⚠️  PROBLEMA: Usuário master NÃO TEM identidade!');
                console.log('   ➡️  Isso causa o erro "Database error querying schema".');
                console.log('   ➡️  Solução: Criar identidade ou recriar usuário via Supabase Dashboard.');
            }
        }

        // 5. Verificar se o schema público tem RLS habilitado em perfis
        console.log('\n5. Verificando RLS em public.perfis...');
        const rlsRes = await client.query(`
            SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'perfis'
        `);
        console.log(`   RLS ativo: ${rlsRes.rows[0]?.rowsecurity || false}`);

        // 6. Listar políticas RLS na tabela perfis
        console.log('\n6. Políticas RLS em public.perfis...');
        const policiesRes = await client.query(`
            SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.perfis'::regclass
        `);
        console.log(`   Políticas encontradas: ${policiesRes.rows.length}`);
        policiesRes.rows.forEach(p => console.log(`   - ${p.polname} (${p.polcmd})`));

        console.log('\n✅ Diagnóstico concluído.');

    } catch (e) {
        console.error('❌ Erro no diagnóstico:', e.message);
    } finally {
        await client.end();
    }
}

diagnose();
