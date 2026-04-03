# STATUS DE RETOMADA PARA SWARM

Data da avaliacao: 2026-03-05

## Objetivo deste documento

Este arquivo resume o estado real do app hoje para que a retomada seja objetiva.
O foco aqui e responder quatro perguntas:

1. O que ja funciona de verdade.
2. O que so funciona porque ainda existe uma instancia antiga do Supabase.
3. O que esta incompleto ou inconsistente.
4. Qual e o menor caminho para voltar a desenvolver sem refatoracao grande.

## Resumo executivo

O projeto tem uma base boa de produto e interface, mas ainda nao esta pronto para retomada "plug and play".

Hoje o estado e este:

- O frontend em Vite/React compila.
- O backend local em Node/SQLite sobe e responde.
- A interface principal esta montada e cobre os modulos centrais do produto.
- O contrato de dados ainda esta inconsistente entre frontend, backend local e Supabase.
- Algumas dependencias criticas do banco nao estao versionadas nas migrations.
- O login e o bootstrap do app continuam fortemente acoplados ao Supabase.

Conclusao pratica:

- O app nao esta perdido.
- O caminho com menor mudanca e manter o frontend atual e consolidar o Supabase como backend principal.
- O backend local deve ser tratado como fallback de desenvolvimento, nao como fonte oficial de verdade.

## Arquitetura atual

### Frontend

- Pasta: `frontend/`
- Stack: React 18 + Vite + TypeScript + React Query + Supabase JS
- Ponto de entrada: `frontend/src/App.tsx`
- Auth atual: `frontend/src/contexts/AuthContext.tsx`
- Cliente de dados: `frontend/src/lib/api.ts`

### Backend local

- Pasta: `backend-node/`
- Stack: Express + SQLite
- Servidor principal atual: `backend-node/server-modular.js`
- Banco local: `backend-node/local_audi_home.db`

### Supabase

- Pasta: `supabase/`
- Contem schema, funcoes e migrations
- Ainda e a dependencia principal do frontend

## O que foi validado nesta revisao

### Funcionou

- `frontend`: `npm run build`
- `backend-node`: `node server-modular.js`
- `backend-node`: `GET /health`
- `backend-node`: `POST /api/auth/login` com usuario local

### Nao passou

- `frontend`: `npm run lint`
  Motivo: nao existe configuracao do ESLint, apesar do script estar no `package.json`.
- `frontend`: `npx tsc --noEmit`
  Motivo: varios erros de `noUnusedLocals` e `noUnusedParameters`.

## Matriz de status por modulo

### 1. Login e sessao

Status: PARCIAL

O que existe:

- Tela de login pronta.
- Persistencia local de sessao via `localStorage`.
- Login via RPC `login_simples`.

Risco:

- O login depende do Supabase e da funcao `login_simples`.
- Essa funcao nao esta nas migrations oficiais do banco.
- Se o banco for recriado do zero, o login pode parar mesmo com o frontend intacto.

Conclusao:

- A UX existe.
- O contrato de banco ainda nao esta fechado.

### 2. Dashboard da unidade

Status: PARCIAL

O que existe:

- Tela pronta.
- Leitura de transacoes, reserva e alertas.

Risco:

- Leitura direta do Supabase fora da camada `api.ts`.
- Depende de tabelas que hoje nao estao integralmente versionadas.

Conclusao:

- A tela existe e pode funcionar.
- Ainda nao e um modulo confiavel para retomada sem revisar schema.

### 3. Dashboard master

Status: BLOQUEADO POR CONTRATO DE DADOS

O que existe:

- Tela pronta.
- Estrutura boa para visao macro.

Risco:

- Depende da view `view_macro_financeira`.
- Essa view nao foi encontrada no schema e nas migrations versionadas.

Conclusao:

- Sem versionar essa view, a tela master nao e reproduzivel.

### 4. Extratos e transacoes

Status: PARCIAL

O que existe:

- Upload de extrato.
- Extracao via Gemini.
- Gravacao de extrato e transacoes.
- Historico de transacoes.

Risco:

- O frontend mistura nomes de coluna `tipo` e `type`.
- Parte do schema antigo usa `tipo`; parte do mais novo usa `type`.

Conclusao:

- O fluxo esta desenhado.
- Precisa unificar contrato antes de confiar em producao.

### 5. Comprovantes

Status: PARCIAL

O que existe:

- Upload de comprovante.
- OCR via Gemini.
- Validacao basica de CNPJ via BrasilAPI.
- Salvamento e historico.

Risco:

- O fluxo salva no Supabase, mas o relacionamento com fornecedor e auditoria ainda nao esta consolidado entre os ambientes.
- O backend local tem logica relevante de anti-duplicidade que nao esta refletida de forma clara no frontend principal.

Conclusao:

- O produto aparece bem.
- O contrato de persistencia ainda precisa ser consolidado.

### 6. Reconciliacao

Status: PARCIAL COM INCONSISTENCIA DE SCHEMA

O que existe:

- Fila de comprovantes pendentes.
- Busca de matches por valor.
- Acao de vincular comprovante com transacao.

Risco:

- A funcao `find_reconciliation_matches` usa `tipo` em vez de `type`.
- O frontend espera `score`, mas a funcao retorna `match_score`.

Conclusao:

- A ideia do modulo esta pronta.
- O contrato precisa ser corrigido antes da retomada.

### 7. Auditoria de despesas

Status: PARCIAL

O que existe:

- Lista de despesas.
- Modal de auditoria de fornecedor.
- Consulta de CNPJ na BrasilAPI.

Risco:

- O modulo usa `condominioId` fixo em vez do usuario autenticado.
- O salvar da auditoria ainda nao esta implementado de verdade.

Conclusao:

- Serve para demonstrar a feature.
- Ainda nao serve como fluxo final.

### 8. Receitas

Status: PARCIAL

O que existe:

- Tela pronta.
- Leitura de creditos.
- Bloco visual de antecipacao.

Risco:

- O modulo deriva "boletos" de transacoes e mistura conceitos de receita, credito e boleto.
- O backend local tem endpoints melhores para receita, mas o frontend principal esta apontado para o Supabase.

Conclusao:

- O modulo esta visualmente adiantado.
- A modelagem de dados precisa ser fechada.

### 9. Orcamento

Status: BLOQUEADO POR SCHEMA INCOMPLETO

O que existe:

- Tela pronta.
- Inclusao de categorias e comparacao orcado x realizado.

Risco:

- O frontend consulta `orcamento_anual`.
- A tabela nao foi encontrada no schema e nas migrations versionadas do Supabase.

Conclusao:

- A interface existe.
- O banco versionado ainda nao suporta o modulo de forma confiavel.

### 10. Fundo de reserva

Status: BLOQUEADO POR SCHEMA INCOMPLETO

O que existe:

- Tela pronta.
- Leitura de configuracao e movimentacoes.

Risco:

- O frontend depende de `reserva_config` e `reserva_movimentacoes`.
- Essas tabelas e contratos nao apareceram no schema versionado do Supabase.

Conclusao:

- A tela esta pronta para produto.
- O banco oficial ainda nao esta fechado.

### 11. Compliance

Status: PARCIAL

O que existe:

- Tela pronta.
- Leitura de pagamentos sem comprovante.

Risco:

- Usa Supabase direto.
- Depende da consistencia de `type`, `conciliado` e `status_auditoria`.

Conclusao:

- Boa base de produto.
- Ainda depende de consolidacao do contrato de dados.

### 12. Open Finance

Status: NAO PRIORIZADO

Observacao:

- Existem componentes e artefatos relacionados.
- O modulo nao esta exposto como fluxo principal no `App.tsx`.
- Nao parece ser o melhor ponto de retomada agora.

## O que esta funcionando de verdade hoje

Se alguem perguntar "o que da para mostrar hoje?", a resposta segura e:

- Interface principal do produto.
- Navegacao entre modulos.
- Build do frontend.
- Backend local subindo e respondendo.
- Login local no backend SQLite.
- Fluxos de demonstracao para extratos, comprovantes, despesas, receitas e dashboards.

Se alguem perguntar "o que esta pronto para operar com confianca?", a resposta correta hoje e:

- Ainda nenhum modulo esta 100% fechado para operacao real sem revisar o contrato de dados.

## Principais bloqueios para retomada

### 1. Dependencia estrutural do Supabase

Hoje o frontend nao sobe sem variaveis do Supabase e sem os objetos de banco esperados.

### 2. Objetos de banco fora das migrations

Itens mais importantes:

- `login_simples`
- `view_macro_financeira`
- tabelas de orcamento
- tabelas de fundo de reserva

### 3. Drift de schema

Pontos visiveis:

- `tipo` x `type`
- `score` x `match_score`

### 4. Dois backends com contratos diferentes

Hoje existem tres camadas de verdade concorrendo:

- frontend falando com Supabase
- backend local em Node/SQLite
- migrations/funcoes do Supabase

Enquanto os tres nao convergirem, a retomada fica cara e confusa.

### 5. Qualidade estatica incompleta

- build passa
- TypeScript estrito nao passa
- lint nao existe de verdade

### 6. Segredos no repositorio

Existem credenciais em arquivos versionados e scripts locais.
Antes de qualquer retomada seria correto rotacionar tudo e substituir por `.env.example`.

## Menor caminho para retomar sem mudar muita coisa

Se a prioridade e nao reescrever o app, a recomendacao e esta:

### Decisao principal

Usar o Supabase como backend oficial e o `backend-node` apenas como apoio local.

Motivo:

- O frontend ja esta majoritariamente escrito para Supabase.
- Refazer a aplicacao para depender do backend local geraria mais trabalho do que consolidar o banco atual.
- O produto ja esta modelado em cima de tabelas, views e RPCs do Supabase.

### O que fazer primeiro

1. Versionar no `supabase/` tudo que o frontend espera.
2. Corrigir o drift de colunas e nomes de retorno.
3. Padronizar uma unica camada de acesso a dados no frontend.
4. Fechar qualidade minima com TypeScript e ESLint.
5. Rotacionar segredos.

## Backlog minimo para Swarm

### SWARM 1. Banco e autenticacao

Objetivo:

- Deixar o Supabase recriavel do zero.

Entregas:

- migration para `login_simples`
- migration para `view_macro_financeira`
- migrations para `orcamento_anual`
- migrations para `reserva_config`
- migrations para `reserva_movimentacoes`
- script de seed minimo para usuarios e condominio

Criterio de pronto:

- Um ambiente novo consegue subir banco, criar usuario seed e logar sem script manual fora de migration.

### SWARM 2. Contrato de dados

Objetivo:

- Eliminar inconsistencias entre frontend e banco.

Entregas:

- escolher `type` ou `tipo` e usar um so
- alinhar retorno de reconciliacao para `match_score` ou `score`
- revisar nomes de campos de comprovantes, despesas e receita

Criterio de pronto:

- Todas as telas principais usam o mesmo contrato de dados.

### SWARM 3. Camada de API do frontend

Objetivo:

- Parar de misturar leitura direta do Supabase com `api.ts`.

Entregas:

- migrar `Dashboard`, `ComplianceReport` e pontos soltos para uma unica camada
- remover hardcode de `condominioId` da auditoria de despesas

Criterio de pronto:

- Todo acesso a dados passa por uma interface unica.

### SWARM 4. Qualidade minima

Objetivo:

- Criar trilho de retomada confiavel.

Entregas:

- criar configuracao ESLint
- zerar erros de `npx tsc --noEmit`
- adicionar smoke test minimo

Criterio de pronto:

- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`

todos passando.

### SWARM 5. Seguranca e ambiente

Objetivo:

- Tirar risco operacional desnecessario.

Entregas:

- rotacionar chaves expostas
- remover credenciais de arquivos versionados
- criar `.env.example`
- documentar setup local

Criterio de pronto:

- o repositorio pode ser compartilhado sem expor credenciais reais.

## Ordem recomendada de execucao

1. SWARM 5
2. SWARM 1
3. SWARM 2
4. SWARM 3
5. SWARM 4

## O que nao precisa mudar agora

Para ganhar velocidade, eu nao mudaria estes pontos neste momento:

- Vite + React no frontend
- React Query
- desenho geral das telas
- organizacao por features

Ou seja:

- o problema principal nao e a interface
- o problema principal e fechar o contrato de dados e o ambiente

## Definicao honesta do estado atual

Se precisar resumir para time, parceiro ou gestor:

"O app ja tem boa parte da experiencia pronta e uma arquitetura viavel, mas ainda esta em fase de consolidacao de backend. O frontend compila, o backend local sobe, e os modulos principais ja existem. Para operar com seguranca, falta versionar objetos criticos do Supabase, alinhar schema e fechar o pipeline minimo de qualidade."

## Recomendacao final

Nao recomendo refatoracao grande agora.

Recomendo:

- congelar a arquitetura atual
- consolidar o Supabase como fonte principal
- usar Swarm para fechar banco, contrato, qualidade e ambiente

Se isso for feito nessa ordem, a retomada pode acontecer sem jogar fora o trabalho que ja foi feito.
