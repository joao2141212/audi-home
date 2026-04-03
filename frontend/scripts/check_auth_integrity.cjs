const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function checkAuthIntegrity() {
    console.log('🔬 VERIFICANDO INTEGRIDADE COMPLETA DO AUTH\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Verificar se todas as foreign keys estão OK
        console.log('1. Verificando Foreign Keys no schema auth...');
        const fkRes = await client.query(`
            SELECT
                tc.constraint_name,
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_schema = 'auth'
        `);
        console.log(`   FKs encontradas: ${fkRes.rows.length}`);
        fkRes.rows.forEach(fk => console.log(`   - ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`));

        // 2. Verificar se há índices corrompidos
        console.log('\n2. Verificando índices em auth.users...');
        const idxRes = await client.query(`
            SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'auth' AND tablename = 'users'
        `);
        idxRes.rows.forEach(i => console.log(`   - ${i.indexname}`));

        // 3. Verificar se o usuário tem instance_id válido
        console.log('\n3. Verificando instance_id dos usuários...');
        const instRes = await client.query(`SELECT id, email, instance_id FROM auth.users`);
        instRes.rows.forEach(u => console.log(`   - ${u.email}: instance_id = ${u.instance_id}`));

        // 4. Verificar se há instâncias configuradas
        console.log('\n4. Verificando auth.instances...');
        const instancesRes = await client.query(`SELECT * FROM auth.instances`);
        console.log(`   Instâncias encontradas: ${instancesRes.rows.length}`);
        instancesRes.rows.forEach(i => console.log(`   - ${i.id}: ${i.uuid}`));

        // 5. Verificar se o is_anonymous está correto (deve ser false para email auth)
        console.log('\n5. Verificando is_anonymous...');
        const anonRes = await client.query(`SELECT email, is_anonymous FROM auth.users`);
        anonRes.rows.forEach(u => console.log(`   - ${u.email}: is_anonymous = ${u.is_anonymous}`));

        // 6. Tentar simular o que o GoTrue faz internamente
        console.log('\n6. Simulando query do GoTrue (buscar usuário por email)...');
        const gotrueRes = await client.query(`
            SELECT 
                u.id, u.email, u.encrypted_password, u.email_confirmed_at, 
                u.aud, u.role, u.raw_app_meta_data, u.raw_user_meta_data,
                u.is_sso_user, u.deleted_at, u.is_anonymous,
                i.provider, i.provider_id, i.identity_data
            FROM auth.users u
            LEFT JOIN auth.identities i ON u.id = i.user_id
            WHERE u.email = 'master@audi.home'
            AND u.deleted_at IS NULL
        `);
        if (gotrueRes.rows[0]) {
            console.log('   ✅ Query funcionou!');
            console.log('   Dados retornados:', JSON.stringify(gotrueRes.rows[0], null, 2));
        } else {
            console.log('   ❌ Nenhum resultado');
        }

        // 7. Verificar se há views customizadas que podem estar quebrando
        console.log('\n7. Verificando views no schema auth...');
        const viewsRes = await client.query(`
            SELECT table_name FROM information_schema.views WHERE table_schema = 'auth'
        `);
        console.log(`   Views encontradas: ${viewsRes.rows.length}`);
        viewsRes.rows.forEach(v => console.log(`   - ${v.table_name}`));

        // 8. Verificar se há triggers customizados
        console.log('\n8. Verificando triggers customizados no schema auth...');
        const trigRes = await client.query(`
            SELECT trigger_name, event_object_table, action_statement 
            FROM information_schema.triggers 
            WHERE trigger_schema = 'auth'
        `);
        console.log(`   Triggers encontrados: ${trigRes.rows.length}`);
        trigRes.rows.forEach(t => console.log(`   - ${t.trigger_name} on ${t.event_object_table}`));

        // 9. Verificar se há políticas RLS no schema auth
        console.log('\n9. Verificando RLS no schema auth...');
        const rlsRes = await client.query(`
            SELECT schemaname, tablename, rowsecurity 
            FROM pg_tables 
            WHERE schemaname = 'auth'
        `);
        rlsRes.rows.forEach(r => console.log(`   - ${r.tablename}: RLS = ${r.rowsecurity}`));

        console.log('\n✅ Verificação concluída.');

    } catch (e) {
        console.error('❌ Erro:', e.message);
        console.error(e.stack);
    } finally {
        await client.end();
    }
}

checkAuthIntegrity();
