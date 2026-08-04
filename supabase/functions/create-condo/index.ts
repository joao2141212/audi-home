import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getSupabasePublishableKey, getSupabaseSecretKey } from '../_shared/supabase-keys.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { nome_condo, cnpj_condo, email_sindico, nome_sindico, senha_temp } = await req.json()

        // Validate required
        if (!nome_condo || !email_sindico || !senha_temp) {
            return new Response(JSON.stringify({ error: 'nome_condo, email_sindico e senha_temp são obrigatórios' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Must be called by master only — validate via JWT
        const authHeader = req.headers.get('Authorization')
        const userSupabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            getSupabasePublishableKey(),
            { global: { headers: { Authorization: authHeader ?? '' } } }
        )
        const { data: { user: caller }, error: authErr } = await userSupabase.auth.getUser()
        if (authErr || !caller) {
            return new Response(JSON.stringify({ error: 'Não autenticado' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Check if caller is master
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            getSupabaseSecretKey()
        )
        const { data: perfil, error: perfilErr } = await adminClient
            .from('perfis')
            .select('role')
            .eq('id', caller.id)
            .single()

        if (perfilErr || perfil?.role !== 'master') {
            return new Response(JSON.stringify({ error: 'Acesso restrito — somente master pode criar condomínios' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 1. Get the administradora from the master's profile
        const { data: masterPerfil } = await adminClient
            .from('perfis')
            .select('administradora_id')
            .eq('id', caller.id)
            .single()

        // 2. Create the condominium
        const { data: novoCondo, error: condoErr } = await adminClient
            .from('condominios')
            .insert({
                nome: nome_condo.trim(),
                cnpj: cnpj_condo?.replace(/\D/g, '') || null,
                ativo: true,
                administradora_id: masterPerfil?.administradora_id || null
            })
            .select('id, nome')
            .single()

        if (condoErr) throw new Error(`Erro ao criar condomínio: ${condoErr.message}`)

        // 3. Create the síndico auth user
        const { data: newUser, error: userErr } = await adminClient.auth.admin.createUser({
            email: email_sindico.toLowerCase().trim(),
            password: senha_temp,
            email_confirm: true, // skip confirmation email for now
            user_metadata: { nome: nome_sindico || email_sindico }
        })

        if (userErr) {
            // Rollback condo creation
            await adminClient.from('condominios').delete().eq('id', novoCondo.id)
            throw new Error(`Erro ao criar usuário: ${userErr.message}`)
        }

        // 4. Create the perfil for the síndico
        const { error: perfilInsErr } = await adminClient
            .from('perfis')
            .insert({
                id: newUser.user!.id,
                nome: nome_sindico || email_sindico,
                role: 'sindico',
                condominio_id: novoCondo.id,
                administradora_id: masterPerfil?.administradora_id || null
            })

        if (perfilInsErr) {
            // Rollback both
            await adminClient.auth.admin.deleteUser(newUser.user!.id)
            await adminClient.from('condominios').delete().eq('id', novoCondo.id)
            throw new Error(`Erro ao criar perfil: ${perfilInsErr.message}`)
        }

        return new Response(JSON.stringify({
            success: true,
            condominio: { id: novoCondo.id, nome: novoCondo.nome },
            sindico: { id: newUser.user!.id, email: email_sindico },
            message: `Condomínio "${nome_condo}" criado com síndico ${email_sindico}`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
