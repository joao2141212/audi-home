# PLANO DE PRODUCAO

Data: 2026-04-27

## Objetivo

Deixar o app pronto para entrar em producao nos proximos dias com o minimo de mudanca estrutural.

Arquitetura ativa identificada nesta revisao:

- Frontend: `frontend/` em React + Vite
- Backend principal: `supabase/` com Auth, Postgres, Storage e Edge Functions
- Deploy atual previsto: Netlify + Supabase
- Codigo legado: `legado/` (nao deve ser usado como base de producao)

## Resumo executivo

O projeto esta mais perto de producao do que de prototipo.

O caminho mais seguro e:

1. Manter a arquitetura atual.
2. Consolidar o Supabase como backend oficial.
3. Fechar bloqueadores de seguranca, onboarding e qualidade.
4. Rodar um smoke test de ponta a ponta.

Hoje o app:

- builda no frontend
- tem migrations reais no Supabase
- tem fluxo principal de upload de comprovantes via Edge Function
- tem dashboard master, aprovacao humana, moradores e views de fraude

Mas ainda NAO esta pronto para abrir para cliente sem antes corrigir os itens P0 abaixo.

## Status atual

### Passou

- `frontend`: `npm run build`
- migrations presentes para:
  - `perfis`
  - `condominios`
  - `comprovantes`
  - `transacoes_bancarias`
  - `orcamento_anual`
  - `reserva_config`
  - `reserva_movimentacoes`
  - `view_macro_financeira`
  - `view_fila_revisao`
  - `view_red_flags_master`
  - `view_api_usage`

### Nao passou

- `frontend`: `npm run lint`
  - hoje o script existe, mas nao existe configuracao ESLint
- `frontend`: `npx tsc --noEmit`
  - falha por erros de `noUnusedLocals` e `noUnusedParameters`

## BLOQUEADORES REAIS DE PRODUCAO

### P0. Segredos e chaves expostas no repositorio

Problema:

- Existe chave do Google em `frontend/.env`
- Existe URL e anon key do Supabase em `frontend/.env`

Risco:

- exposicao de credenciais
- uso indevido de quota
- dificuldade de rotacionar ambiente depois que cliente entrar

Acao minima:

- remover secrets versionados
- criar `.env.example`
- rotacionar chaves atuais
- configurar variaveis no Netlify e no Supabase

### P0. Bucket de comprovantes esta publico

Arquivo:

- `supabase/migrations/20260403020000_storage_bucket.sql`

Problema:

- bucket `comprovantes` foi criado com `public = true`
- frontend usa `getPublicUrl`

Risco:

- documentos financeiros acessiveis por URL publica
- exposicao de notas, recibos e comprovantes de moradores e fornecedores

Acao minima:

- tornar bucket privado
- trocar `publicUrl` por acesso autenticado ou signed URL
- revisar policy de leitura

Observacao:

- isso e bloqueador direto de producao

### P0. Onboarding master provavelmente quebra ao criar novo cliente

Arquivo:

- `supabase/functions/create-condo/index.ts`

Problema:

- a funcao tenta inserir `ativo: true` em `public.perfis`
- a tabela `perfis` das migrations revisadas nao tem coluna `ativo`

Risco:

- master nao consegue criar novo condominio / sindico
- onboarding comercial quebra no momento mais sensivel

Acao minima:

- ou remover esse campo da Edge Function
- ou criar migration adicionando `ativo` em `perfis`

### P0. Ainda existe OCR/Gemini sendo chamado direto do frontend

Arquivo principal:

- `frontend/src/features/statements/StatementUpload.tsx`

Problema:

- extrato ainda chama Gemini direto com `VITE_GOOGLE_API_KEY`

Risco:

- chave exposta no browser
- abuso de API
- custo imprevisivel
- comportamento diferente entre modulos

Acao minima:

- mover esse fluxo para Edge Function
- deixar Gemini somente server-side

### P0. Falta trilha minima de qualidade antes do deploy

Problema:

- lint nao existe de verdade
- TypeScript estrito nao passa

Risco:

- deploy com regressao boba
- time sem gate minimo de release

Acao minima:

- criar configuracao de ESLint
- zerar erros atuais do `tsc`

## RISCOS ALTOS MAS RESOLVIVEIS RAPIDO

### P1. IDs hardcoded e fluxos demo ainda espalhados

Arquivos encontrados:

- `frontend/src/features/audit/ExpenseAudit.tsx`
- `frontend/src/features/statements/AddTransactionForm.tsx`
- `frontend/src/features/reconciliation/ReconciliationQueueRefactored.tsx`
- `frontend/src/features/comprovantes/UploadComprovantes.tsx`

Problema:

- ainda existem `demo_condo_1` e `condominioId` fixo

Risco:

- telas auxiliares podem funcionar com dados errados
- confusao no time
- risco de publicar fluxo legado por engano

Acao minima:

- remover da navegacao tudo que for demo
- ou adaptar para usar `AuthContext`

### P1. Duplicate detection de comprovante ainda nao usa hash real do arquivo

Arquivo:

- `frontend/src/features/receipts/ReceiptUpload.tsx`

Problema:

- `arquivo_hash` esta recebendo `storagePath`, nao hash de verdade

Risco:

- camada de anti-duplicidade enfraquecida

Acao minima:

- gerar hash SHA-256 do arquivo no cliente ou na Edge Function
- salvar hash real

### P1. Testes existem, mas o projeto nao tem rotina clara de validacao

Problema:

- pasta `tests/` existe
- `tests/package.json` nao tem script util
- nao existe checklist automatizado unico de release

Acao minima:

- criar script de smoke test unico
- documentar ordem de validacao

## O QUE JA ESTA BOM O SUFICIENTE PARA MANTER

Nao recomendo refatorar agora:

- React + Vite
- Supabase como backend principal
- Edge Function `process-comprovante`
- dashboard master
- fila de aprovacao humana
- modelagem base de multi-tenant

Ou seja:

- o problema principal nao e arquitetura
- o problema principal e hardening de producao

## PLANO MINIMO PARA OS PROXIMOS DIAS

### Dia 1

- remover secrets do repo
- criar `.env.example`
- rotacionar chaves
- configurar envs no Netlify e Supabase
- corrigir `create-condo`

### Dia 2

- tornar bucket privado
- ajustar upload e leitura de comprovantes
- mover `StatementUpload` para Edge Function
- revisar policies do storage

### Dia 3

- criar ESLint
- zerar `npx tsc --noEmit`
- esconder ou corrigir componentes demo/hardcoded

### Dia 4

- rodar smoke test completo:
  - login
  - criar condominio
  - upload comprovante
  - processamento OCR
  - fila de aprovacao
  - dashboard master
  - upload de extrato
  - reconciliacao

### Dia 5

- deploy em ambiente de staging
- validar com dados reais controlados
- abrir producao

## CHECKLIST DE GO-LIVE

Antes de abrir para cliente, tudo abaixo precisa estar verdadeiro:

- secrets removidos do repo
- chaves rotacionadas
- bucket de comprovantes privado
- onboarding de novo condominio funcionando
- upload de comprovante funcionando de ponta a ponta
- extrato nao chamando Gemini no browser
- `npm run build` ok
- `npm run lint` ok
- `npx tsc --noEmit` ok
- smoke test manual completo ok
- usuario master ok
- usuario sindico ok
- RLS validado com pelo menos 2 condominios

## Recomendacao final

Se a meta e entrar em producao em poucos dias, eu faria assim:

- foco total em um caminho feliz fechado
- nao abrir todos os modulos ao mesmo tempo

Escopo minimo de producao recomendado:

1. login
2. onboarding master
3. upload de comprovantes
4. OCR + score de fraude
5. fila de aprovacao
6. dashboard master

Escopo que pode esperar alguns dias sem travar o contrato:

- add transaction manual
- fluxo refactored de reconciliacao
- componentes demo de open finance
- qualquer tela que ainda use condo fixo

## Definicao honesta do estado atual

Hoje eu classificaria o app assim:

- produto: bem encaminhado
- arquitetura: suficiente
- backend Supabase: aproveitavel
- seguranca: ainda nao pronto
- qualidade de release: ainda nao pronta

Traduzindo para decisao pratica:

Nao precisa refazer o app.
Precisa fechar os P0 e P1 acima antes de chamar de producao.
