# Solução Definitiva - Novo Projeto Supabase

O erro "Database error querying schema" é um problema interno do serviço GoTrue do Supabase que provavelmente foi causado por interferência no schema `auth` quando criamos os usuários via SQL direto.

## Opção 1: Reiniciar o Projeto Atual

1. Acesse: https://supabase.com/dashboard/project/vheqwyakucpvymjojezn/settings/general
2. Role até o final e clique em "Pause Project"
3. Aguarde 1 minuto
4. Clique em "Unpause Project"
5. Tente logar novamente

## Opção 2: Criar Novo Projeto (Recomendado)

1. Vá em https://supabase.com/dashboard e crie um NOVO projeto
2. Anote as novas credenciais:
   - Project URL
   - Anon Key
   - Senha do banco
3. Atualize o arquivo `/frontend/.env` com as novas credenciais
4. Execute o setup inicial no novo banco:

```bash
node frontend/scripts/setup_new_project.cjs
```

Este script irá:
- Criar as tabelas base (administradoras, condominios, perfis, etc.)
- Criar os usuários corretamente via API (não via SQL direto)
- Configurar apenas o que é necessário

## Credenciais Atuais (que serão criadas no novo projeto):

- **Master:** master.audi.home@gmail.com / audi_home_2026
- **Síndico:** sindico.audi.home@gmail.com / audi_home_2026

---

O problema foi aprendizado: **NUNCA criar usuários diretamente via SQL no Supabase**. Sempre usar a API de signup.
