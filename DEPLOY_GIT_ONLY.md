# Deploy e build: Git only

Data da decisao: 2026-05-08

## Regra principal

Nao usar Netlify para buildar ou publicar este projeto.

O Netlify foi removido do fluxo porque estava causando problemas recorrentes de versionamento. A partir de agora, a fonte de verdade e o GitHub.

## Fluxo oficial

1. Trabalhar localmente na branch adequada.
2. Rodar validacao local antes de subir:
   - `cd frontend && npm run build`
   - `cd frontend && npx tsc --noEmit`
   - `cd frontend && npm run lint`
3. Corrigir tudo que quebrar antes do push.
4. Commitar na branch correta.
5. Subir direto para o GitHub.
6. Para producao, usar apenas commit validado na `main`.

## Branches

- `main`: branch principal e base de release.
- `codex/*`: permitido para trabalho temporario quando fizer sentido.
- Evitar depender de build externo automatico para descobrir erro.

## Supabase

O backend oficial continua sendo Supabase:

- Auth
- Postgres
- Storage
- Edge Functions

Migrations e Edge Functions devem ser aplicadas/publicadas no Supabase conscientemente, depois do commit estar validado no GitHub.

## O que foi removido

- `netlify.toml`
- instrucoes antigas para configurar variaveis no Netlify

## Checklist antes de push

- `git status --short` revisado
- `npm run build` passou
- `npx tsc --noEmit` passou
- `npm run lint` passou
- alteracoes commitadas
- push feito para GitHub

## Observacao

Se algum servico de hospedagem for escolhido depois, ele deve consumir um commit ja validado. Ele nao deve ser usado como ambiente principal de build/debug.
