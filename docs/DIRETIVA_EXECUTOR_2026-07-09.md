# DIRETIVA DO EXECUTOR — Fechar a ponta de validação (auditoria de balancete)

Data: 2026-07-08. Autor: sessão de planejamento (Fable 5).
Leitor: agente executor. **Nada aqui é opcional e nada pode ser inferido.**
Se algo estiver ambíguo, pare e pergunte ao Pedro. Não invente fluxo.

---

## 0. Leitura obrigatória antes de tocar em código

1. `MAPA_FLUXOS_AUDITORIA_CONDOMINIO.md` (raiz) — o produto inteiro.
2. `PLANO_PRODUCAO_2026-04-27.md` (raiz) — bloqueadores P0/P1.
3. `docs/WINKER_INTEGRATION.md` — integração Winker e limite conhecido (download 404).
4. `winker_exports/Demonstrativo de Receitas e Despesas 06.2025.txt` — o balancete real de exemplo.
5. Este arquivo, inteiro.

---

## 1. O DOMÍNIO, DESTILADO (o que "auditoria de condomínio" significa aqui)

O Pedro não conhece o domínio contábil. Então o domínio está fixado AQUI,
com exemplo numérico real do condomínio Hermínio Jacques, 06/2025.
O executor NÃO redefine essas regras. Elas são o contrato do produto.

### 1.1 O documento central é o BALANCETE mensal

Estrutura (exatamente como no txt de exemplo):

```txt
SALDO ANTERIOR (por conta bancária)          98.807,98
+ TOTAL RECEITAS (por categoria)             47.409,46
- TOTAL DESPESAS (por categoria)             38.337,91
= SALDO ATUAL (por conta bancária)          107.879,53
```

### 1.2 As 6 validações que fecham a auditoria (A PONTA DE VALIDAÇÃO)

| # | Nome | Regra exata | Fonte dos dados |
|---|------|-------------|-----------------|
| V1 | Equação do balancete | `saldo_anterior + total_receitas - total_despesas = saldo_atual`, tolerância R$ 0,01 | só o balancete |
| V2 | Soma interna | soma dos itens de cada categoria = subtotal da categoria; soma dos subtotais = total | só o balancete |
| V3 | Continuidade | `saldo_atual` do mês N = `saldo_anterior` do mês N+1, por conta bancária | dois balancetes consecutivos |
| V4 | Lastro bancário | `saldo_atual` declarado = saldo do extrato bancário no fim do período | balancete × `transacoes_bancarias`/extrato |
| V5 | Despesa com documento | cada item de despesa do balancete tem comprovante em `comprovantes` (match por valor exato + data no mês; segundo passo: descrição/CNPJ) | balancete × `comprovantes` |
| V6 | Despesa no extrato | cada item de despesa tem débito correspondente em `transacoes_bancarias` (valor exato + data ±5 dias dentro do período) | balancete × extrato |

Resultado de cada validação: `ok`, `divergente` (com valor esperado × encontrado)
ou `sem_dados` (ex.: não há extrato do período). **`sem_dados` nunca vira `ok`.**

Item de despesa sem comprovante E sem transação = **`sem_lastro`** = red flag.
Essa é a fraude clássica de condomínio: despesa declarada que não existiu.

### 1.3 O que NÃO entra nesta diretiva

Receita por morador/cobranças, orçamento anual, fundo de reserva.
São os Fluxos 7/8/9 do mapa. Ficam para depois. Não abrir essas frentes.

---

## 2. INSUMOS REAIS DISPONÍVEIS

- `winker_exports/Demonstrativo de Receitas e Despesas 06.2025.txt` — balancete
  06/2025 COM texto extraído. É o caso de teste canônico.
- `winker_exports/Demonstrativo de Receitas e Despesas 06.2025.pdf` — o mesmo, PDF.
- `winker_exports/Balancete Digitalizado 06-2025.pdf` — ESCANEADO, txt vazio.
  Precisa de OCR visual (Gemini vision), igual ao pipeline de comprovantes.
- `winker_exports/winker_documents_8837.json` — 133 documentos do portal 8837,
  79 relevantes (balancetes, prestação de contas, demonstrativos).
- Pipeline Gemini já existente: `supabase/functions/process-comprovante/index.ts`
  e `supabase/functions/_shared/ocr-service.ts`. REUSAR o padrão, não recriar.

Números-gabarito do caso 06/2025 (conferidos manualmente no txt):

```txt
saldo_anterior = 98.807,98
total_receitas = 47.409,46
total_despesas = 38.337,91
saldo_atual    = 107.879,53
Contas: SICREDI 0226|33280-9; SICREDI CONTA CAPITAL (558,14);
        SICREDI POUPANÇA FUNDO DE RESERVA; SICREDI POUPANÇA FUNDO DE OBRA
Categorias de despesa: DESPESA COM PESSOAL 14.724,29; ENCARGOS SOCIAIS 6.490,91;
UTILIDADES/SERVIÇOS 7.061,52; DESPESAS C/ MANUTENÇAO 3.229,52;
DESPESAS C/ SERVIÇOS 3.527,30; DESPESAS DE AQUISIÇOES 810,00;
DESPESAS COM MATERIAIS 1.889,89; IMPOSTOS/TAXAS 470,34; DESPESAS BANCARIAS 134,14
```

Se o parser extrair 06/2025 e esses números não baterem, o parser está errado,
não o documento.

---

## 3. TAREFAS, EM ORDEM. Cada uma tem PROVA DE ACEITE obrigatória.

### T1 — Migration: tabelas de balancete

Arquivo novo: `supabase/migrations/20260709010000_balancetes.sql`

```sql
-- balancetes: um por condominio+competencia
--   id uuid pk, condominio_id fk condominios, competencia date (dia 1 do mês),
--   fonte text ('winker'|'upload_manual'), winker_document_id text null,
--   arquivo_storage_path text null, arquivo_hash text null,
--   saldo_anterior numeric, total_receitas numeric, total_despesas numeric,
--   saldo_atual numeric, extracao_raw jsonb, status_validacao text
--   ('pendente'|'ok'|'divergente'|'sem_dados'), criado_em, criado_por
--   UNIQUE (condominio_id, competencia, fonte)
-- balancete_itens:
--   id uuid pk, balancete_id fk, natureza text ('receita'|'despesa'|'saldo'),
--   categoria text, descricao text, valor numeric,
--   status_lastro text ('pendente'|'comprovado'|'so_extrato'|'so_comprovante'|'sem_lastro'),
--   comprovante_id uuid null fk comprovantes,
--   transacao_id uuid null fk transacoes_bancarias
-- balancete_validacoes:
--   id, balancete_id fk, check_nome text (V1..V6), resultado text
--   ('ok'|'divergente'|'sem_dados'), esperado numeric null, encontrado numeric null,
--   detalhe jsonb, executado_em
```

RLS igual às tabelas existentes: isolamento por `condominio_id` (copiar o padrão
de `comprovantes` na migration `20260403000000_auditcondo_schema_v1.sql`).
Índice em `balancetes(condominio_id, competencia)` e `balancete_itens(balancete_id)`.

**Prova T1**: aplicar a migration no Supabase (mesmo caminho usado pelas demais)
sem erro; `select` nas 3 tabelas retorna vazio, não erro.

### T2 — Edge Function `process-balancete`

Arquivo novo: `supabase/functions/process-balancete/index.ts`.
Copiar o esqueleto de auth/validação de `process-extrato/index.ts`.

Input: `{ condominio_id, storage_path }` (PDF já no bucket) ou
`{ condominio_id, texto }` (texto já extraído, pro caso de teste).
Se o PDF tem camada de texto, parsear direto; se escaneado, Gemini vision
(mesmo padrão de `process-comprovante`).

Output do Gemini: JSON estrito neste schema (colocar no prompt):

```json
{
  "competencia": "2025-06",
  "condominio_nome": "...",
  "saldo_anterior": { "total": 0, "contas": [{"nome": "...", "valor": 0}] },
  "receitas": [{ "categoria": "...", "itens": [{"descricao": "...", "valor": 0}] }],
  "despesas": [{ "categoria": "...", "itens": [{"descricao": "...", "valor": 0}] }],
  "saldo_atual": { "total": 0, "contas": [{"nome": "...", "valor": 0}] }
}
```

Grava `balancetes` + `balancete_itens` (raw em `extracao_raw`).
Valores em formato BR ("98.807,98") viram numeric. Cuidado: ponto de milhar
e vírgula decimal.

**Prova T2**: rodar com o texto de
`winker_exports/Demonstrativo de Receitas e Despesas 06.2025.txt`
e conferir no banco os 4 números-gabarito da seção 2, mais >= 9 categorias de
despesa. Divergiu = parser errado, corrigir antes de seguir.

### T3 — Motor de validação (V1..V6)

Dentro de `process-balancete` (ou módulo `_shared/balancete-validator.ts`).
Roda após a extração; grava uma linha em `balancete_validacoes` por check.
V3/V4/V5/V6 devolvem `sem_dados` quando faltar mês anterior/extrato/comprovantes.
V5/V6 também atualizam `balancete_itens.status_lastro`.
Item `sem_lastro` gera registro no padrão de red flag existente
(ver `view_red_flags_master` na migration `20260404060000_red_flags_api_usage.sql`)
ou, se a view não aceitar fonte nova, gravar em `audit_acoes` com tipo
`balancete_item_sem_lastro`. Não criar mecanismo paralelo novo.

**Prova T3 (duas partes, ambas obrigatórias)**:
1. Caso 06/2025 real: V1 = `ok`, V2 = `ok`, V3/V4/V5/V6 = `sem_dados` (não há
   mês anterior nem extrato carregado).
2. Caso adulterado: mesmo texto com UMA despesa alterada (ex.: 810,00 → 8.100,00).
   V1 tem que sair `divergente` com `esperado`/`encontrado` preenchidos.
   Se sair `ok`, o motor está quebrado.

### T4 — Ligar na tela Winker

Arquivo: `frontend/src/features/winker/WinkerImport.tsx`.
Para cada documento com `is_financial = true`: botão **"Processar balancete"**.
Como o download automático da Winker está 404 (limite documentado), o fluxo é:
usuário baixa o PDF no app Winker e faz upload manual aqui; o upload vai pro
Storage (bucket privado, mesmo padrão de comprovantes) e chama `process-balancete`.
Exibir resultado: os 4 totais + tabela de validações V1..V6 com ok/divergente/sem_dados.
Estados obrigatórios da tela: vazio, carregando, erro, sucesso.

**Prova T4**: com o app rodando, subir o PDF
`winker_exports/Demonstrativo de Receitas e Despesas 06.2025.pdf`,
ver os 4 totais na tela e V1/V2 = ok. Provar com sweep do tato
(`sweep_page`/`interacao_prove`) ou screenshot da tela real.

### T5 — Um único caminho de conciliação (pendência antiga do mapa, Fluxo 5)

A Edge Function `supabase/functions/reconciliation/index.ts` usa colunas que
NÃO existem no schema atual (`status_reconciliacao`, `transacao_vinculada_id`,
`rejeitado_em`). Decisão já tomada no mapa: caminho oficial é a RPC
`find_reconciliation_matches` + gravação dupla (`comprovantes.transacao_id` e
`transacoes_bancarias.comprovante_id`) + registro em `audit_acoes`.
Ação: consertar a function para o schema real OU removê-la da rota de produção
(remover chamadas no frontend e documentar). Não deixar os dois caminhos vivos.
Melhorar o score do match usando o destilado da seção 4 (valor + data + descrição).

**Prova T5**: `grep -rn "status_reconciliacao\|transacao_vinculada_id" supabase/ frontend/src/`
sem ocorrência viva em rota de produção; `node tests/e2e_full.mjs` sem regressão.

### T6 — Gates finais

- `cd frontend && npx tsc --noEmit` → 0 erros.
- `npm run build` no frontend → ok.
- `node tests/e2e_full.mjs` → sem regressão (16/16 antes desta diretiva).
- Rodar `seguranca_sweep` e `destilacao_sweep` do tato; tratar ou justificar
  por escrito cada achado das áreas tocadas.

---

## 4. REPOSITÓRIOS BAIXADOS PARA DESTILAR (já clonados em `estudos-oss/`, gitignorados)

Objetivo da destilação: NÃO copiar código. Extrair regra, threshold e modelo de
dados, e registrar em `estudos-oss/NOTAS-DESTILACAO.md` (criar). Cada repo tem
alvo exato:

| Repo | O que destilar | Arquivos-chave |
|------|----------------|----------------|
| `account-reconcile/` (OCA/Odoo, padrão-ouro de conciliação) | regras de match: por valor, por label/descrição, por parceiro, tolerância, match parcial | `account_reconcile_model_oca/models/account_reconcile_model.py`, `account_reconcile_oca/models/account_bank_statement_line.py` |
| `blnk/` (ledger fintech, Go) | estratégias de reconciliação (one_to_one, one_to_many), drift/tolerância percentual, agrupamento | `reconciliation.go`, `model/reconciliation_model.go` |
| `mint/` (ERPNext) | UX da fila de conciliação: pistas visuais de match (valor, data, referência) | `frontend/` (componentes de reconciliação) |
| `dwm-condominios/` (BR, C#) | modelo de dados de balancete condominial brasileiro e emissão de demonstrativo | `dwm-condominios/Models/Entidades/Balancete.cs`, `Models/Persistence/BalanceteModel.cs`, `Controllers/BalanceteController.cs` |
| `condominio-mvc/` (BR, Java/Spring) | plano de contas condominial: categorias de receita/despesa usadas no BR (alimenta a lista canônica de categorias do parser) | `src/` (entidades de contas/lançamentos) |

Saída mínima da destilação (vai para `NOTAS-DESTILACAO.md`):
1. Tabela de sinais de match com peso sugerido (valor exato, data ±N, descrição
   fuzzy, CNPJ/referência) — alimenta T5.
2. Lista canônica de categorias condominiais BR — alimenta o prompt do Gemini em T2.
3. O que o Odoo faz com match parcial/agrupado que nosso RPC não faz — vira
   backlog comentado, não implementação agora.

---

## 5. GUARDRAILS (violar qualquer um = parar e perguntar)

1. **Não abrir os fluxos 7/8/9** (receita por morador, orçamento, reserva).
2. **Não chamar Gemini no browser.** IA só em Edge Function (P0 do plano de produção).
3. **Bucket privado + signed URL**, nunca `getPublicUrl`.
4. **Toda decisão/status novo passa por `audit_acoes`** (decisão de arquitetura do mapa).
5. **Mock não é entrega.** A prova de cada tarefa usa o documento real 06/2025.
6. **`sem_dados` não é `ok`.** Nunca marcar validação como passada sem os dois lados.
7. Duas falhas seguidas pela mesma causa: parar, mostrar log, perguntar.
8. Não mexer em `legado/` — referência morta, não base de produção.

---

## 6. RELATÓRIO FINAL OBRIGATÓRIO (formato fixo, uma seção por tarefa)

Para cada tarefa T1..T6, o executor entrega:

```txt
Tn — [FEITO | PARCIAL | BLOQUEADO]
Prova executada: <comando exato rodado>
Sinal observado: <saída literal relevante, colada, não parafraseada>
Arquivos tocados: <lista>
```

E fecha com o BLOCO DE CONFISSÃO (sem ele o relatório é inválido):

```txt
CONFISSÃO
- O que eu NÃO testei: <lista honesta, pode ser vazia só se tudo foi provado>
- Onde eu inferi em vez de saber: <lista>
- O que pode quebrar em produção que eu não cobri: <lista>
```

Relatório sem prova colada ou sem confissão = tarefa não aceita.
