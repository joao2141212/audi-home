# ADR — AudiCondo / Audi Home

KNOWLEDGE_BASE: /Users/pedroduarte/Documents/agent-knowledge-base/projects/audicondo/
ORDER: README.md -> INVENTORY.md -> ROADMAP-ADR-TRACES.md -> this ADR (CBM) -> code via CBM only
ROADMAP: agent-knowledge-base/projects/audicondo/ROADMAP-ADR-TRACES.md
CBM_PROJECT: Users-pedroduarte-Desktop-audi-home
REPO: /Users/pedroduarte/Desktop/audi home
Updated: 2026-07-15 [opencode]

## Study roadmap (ADR + traces)
10 leaves, risk-first (DECOMPOR + destilacao): see ROADMAP-ADR-TRACES.md.
Rule: every study session appends ADR section + ticks one leaf. No discovery without writeback.

## Status
Accepted as working memory for agents. Domain law/process still needs Perplexity with Pedro (not invented here).

## Goal
Product for condominium document audit: receipts/comprovantes, bank statements, fraud signals, human approval, Winker import. Pedro is not domain expert — agent + research supply domain; never invent síndico/assembleia rules without source.

## Architecture (production path)

### Frontend (ACTIVE)
- Path: frontend/ (React + Vite + Tailwind + @supabase/supabase-js + react-pluggy-connect + recharts)
- Entry: frontend/src/App.tsx (function App)
- Auth: frontend/src/contexts/AuthContext.tsx (useAuth hotspot fan_in~18)
- Shell: tab SPA. Tabs include dashboard, budget, statements, receipts, history, tenants, winker; modules under frontend/src/features/*
- Tenant scope: user.condominio_id drives queries (e.g. condominios.nome)

### Backend (ACTIVE)
- Supabase Auth + Postgres + Storage + Edge Functions (Deno)
- Path: supabase/functions/* and supabase/migrations/*
- Core pipeline: process-comprovante (OCR/IA + deterministic fraud) -> human ApprovalQueue
- Parallel: process-extrato, reconciliation, open-finance (Pluggy), sync-winker, audit*, create-condo, dashboard, transactions
- Shared: supabase/functions/_shared/{fraud-detector,ocr-service,cnpj-service,pluggy-client,statement-parser,audit-log-service,brasil-api-service,rfb-validator,robust-validator,batch-audit-service}

### NOT production
- legado/: Node modular server + SQLite — historical only (PLANO_PRODUCAO_2026-04-27)
- estudos-oss/: third-party study trees. MUST be in .cbmignore; currently pollutes graph (~32k nodes)

### Deploy
- Git is source of truth; Netlify not official build path for this product

## Critical flows (static, from graph)
1. Comprovante: UI upload -> Storage + Edge process-comprovante -> runDeterministicFraudChecks (Pix E2E, bank/ISPB, self-transfer, Pix key) + shared fraud/OCR/CNPJ -> comprovantes + audit -> ApprovalQueue
2. Extrato: StatementUpload -> process-extrato / statement-parser -> transacoes_bancarias -> reconciliation
3. Winker: WinkerImport.sync -> Edge sync-winker (WinkerClient.get) -> portal/units/docs (migration winker_integration)
4. Open Finance: PluggyConnect* -> open-finance function
5. Master: MasterDashboard multi-condo admin (onboarding + red flags + API usage)

## Data entities (names from docs/UI — verify SQL before schema change)
condominios, perfis/users, moradores, comprovantes, transacoes_bancarias, extratos, approval queue, orcamento, reserva_*, audit logs, winker external refs, private storage

## Agent rules (this project)
1. Always CBM first: index_status -> get_architecture(path=frontend|supabase) -> search_graph/trace_path/get_code_snippet. Never explore estudos-oss or legado for product work unless asked.
2. Scope CBM with path= or path_filter to avoid OSS noise.
3. After material discovery, append ADR or knowledge-base chunk same turn.
4. Domain without source = HIPOTESE or ask Pedro (Perplexity).
5. Do not merge with Ycaros without Pedro. Reuse arruma.i only for PDF/attachment/multi-tenant patterns.
6. Secrets files exist — never echo values.

## Index hygiene
- `.cbmignore` CREATED 2026-07-15: estudos-oss/, legado/, media, *.db, node_modules, etc.
- ARMADILHA: `index_repository` incremental NÃO purga nós antigos. Precisa `delete_project` + reindex (pedir Pedro antes de delete_project).
- Prefer get_architecture path=frontend and path=supabase
- CBM CLI may be blocked by budget attestation until CBM agent fixes binary.

## Auth & tenant (studied 2026-07-15, file read — CBM offline)

### Hierarchy
administradoras → condominios → perfis (1:1 with auth.users)

### Roles (CHECK in perfis.role)
- `master` — global; App shows MasterDashboard; policies condo_master_all / admin_master_all
- `gestor` — tied to administradora_id
- `sindico` — tied to condominio_id (default on signup trigger handle_new_user)

### Frontend
- AuthContext: signInWithPassword → loadProfile from `perfis` (timeout 5s; fallback role=sindico condominio_id=null if query fails)
- Loading guard 8s hard timeout
- isAuthenticated = !!user (profile present, not only session)
- App: master → MasterDashboard; else Dashboard; tabs list shared (all roles see full menu in UI)

### RLS core helper
- `user_has_condo_access(condo_id)`: master OR perfil.condominio_id = condo_id OR gestor path via administradora
- Applied on: comprovantes, extratos, transacoes, moradores, audit_acoes, orcamento, reserva_*
- Edge functions often use SERVICE_ROLE after JWT user check (process-comprovante getAuthenticatedContext)

### Risks noted (not fixed this pass)
- Fallback profile on perfis error grants UI with condominio_id=null → uploads blocked by `if (!user?.condominio_id) return` but role still sindico
- UI does not hide tabs by role (only dashboard switches master vs not)
- CORS on process-comprovante: Access-Control-Allow-Origin *

## Flow: comprovante (studied 2026-07-15)

### Happy path (code order)
1. `ReceiptUpload` (tab receipts) — not UploadComprovantes for main App tab
2. SHA-256 client hash of file
3. Storage upload bucket `comprovantes` path `{condominio_id}/{ts}_{filename}`
4. INSERT `comprovantes` status=processando, status_auditoria=pendente, arquivo_hash, optional morador_id
5. `supabase.functions.invoke('process-comprovante')` with base64 + comprovante_id
6. Edge: JWT → perfil; load comprovante; OCR/IA (Gemini) + CNPJ + `runDeterministicFraudChecks` (Pix E2E 32-char BACEN, ISPB vs bank name, self-transfer, Pix key)
7. Update comprovante fraud_score/flags/status_auditoria (auditado|alerta|suspeito|rejeitado|…)
8. Human: `ApprovalQueue` + view_fila_revisao (status_auditoria in suspeito|alerta|pendente) + table `audit_acoes`

### status fields (two axes — careful)
- `status`: pendente|processando|aprovado|rejeitado|suspeito|duplicado (workflow)
- `status_auditoria`: used by UI badges and fila (auditado|alerta|suspeito|rejeitado|pendente)

### Symbols
- frontend/src/features/receipts/ReceiptUpload.tsx
- frontend/src/features/approval/ApprovalQueue.tsx
- frontend/src/features/comprovantes/ComprovantesHistory.tsx
- supabase/functions/process-comprovante/{index,deterministic-checks}.ts
- migrations: auditcondo_schema_v1, approval_queue, pix_fraud_columns

## Flow: extrato + reconciliação (studied 2026-07-15, CBM + files)

### Extrato happy path
1. `StatementUpload` (tab statements) — accept `.pdf,.csv,.ofx`
2. POST FormData `file` + `condominio_id` to `${VITE_SUPABASE_URL}/functions/v1/process-extrato` with Bearer JWT (raw fetch, not functions.invoke)
3. Edge `getAuthenticatedProfile`: JWT → perfis; 403 if not master and condominio_id mismatch
4. Parse:
   - CSV → StatementParser.parseCSV
   - OFX → StatementParser.parseOFX
   - else PDF/image → extractTransactionsWithGemini (gemini-2.5-flash + GOOGLE_API_KEY/GEMINI_API_KEY)
5. SHA-256 file hash; INSERT extratos_bancarios (fonte=manual)
6. INSERT transacoes_bancarias (type CREDIT|DEBIT, conciliado=false)
7. UI shows result.transacoes.lista preview

### Reconciliação
1. `ReconciliationQueue` (App tab) uses `api.getReconciliationQueue` — comprovantes where transacao_id IS NULL
2. Select one item → `api.getReconciliationMatches(condo, valor)`
3. Approve → `api.approveReconciliation(comprovanteId, matchId)` links transaction
4. Parallel file: ReconciliationQueueRefactored (not wired in App.tsx — App imports ReconciliationQueue)

### Risks
- StatementUpload does not upload original file to Storage (only processes + DB rows) — destilação: arquivo original pode não ser recuperável
- extratos insert may fail on duplicate hash (unique index condo+hash) — UX depends on error string
- api.saveStatement exists but StatementUpload path uses edge only
- Gemini model string hard-coded; cost per PDF extrato

### Symbols
- frontend/src/features/statements/StatementUpload.tsx
- frontend/src/features/statements/TransactionHistory.tsx
- frontend/src/features/reconciliation/ReconciliationQueue.tsx
- frontend/src/lib/api.ts (getReconciliationQueue/Matches/approve)
- supabase/functions/process-extrato/index.ts
- supabase/functions/_shared/statement-parser.ts

## Flow: Winker (studied 2026-07-15, CBM + docs + migration)

### Role
Winker = fonte operacional/documental do condomínio (API pública). Não copiar produto ilegalmente; só o que a API expõe e o contrato do cliente permite. Fonte doc: `docs/WINKER_INTEGRATION.md`.

### Happy path (manual UI)
1. Tab `winker` → `WinkerImport`
2. Form: condominio_id, username, password, key (string!), id_portal
3. `sync()` → `supabase.functions.invoke('sync-winker', { body })`
4. Edge: auth (JWT user ou `x-sync-secret` agendado) → `WinkerClient.login` POST `/auth/login` → GET me/division/document/about/provider/booking/maintenance
5. Upsert: winker_connections, winker_divisions, winker_units, winker_documents (+ providers/bookings/maintenance se migration)
6. UI limpa password do form; reload connection + documents list from Supabase

### Scheduled path
Secrets: WINKER_USERNAME/PASSWORD/APP_KEY/PORTAL_ID/CONDOMINIO_ID + SYNC_WINKER_SECRET  
curl POST com header `x-sync-secret` e body `{"trigger_source":"scheduled"}`

### Tables (migration 20260610010000)
winker_connections (1:1 condominio), winker_divisions, winker_units, winker_documents (is_financial flag), + related external rows per migration rest

### Risks
- Credentials entram no body do invoke (password em transit); connection table só guarda hints, não secret full (verify edge storage)
- API key must be string (doc)
- estudos-oss still pollutes graph; always path= frontend|supabase|sync-winker
- Domain: legal/ethical scope of mirroring Winker data = HIPOTESE until Pedro+Perplexity

### Symbols
- frontend/src/features/winker/WinkerImport.tsx (sync, load)
- supabase/functions/sync-winker/index.ts (WinkerClient, upsert*)
- docs/WINKER_INTEGRATION.md
- supabase/migrations/20260610010000_winker_integration.sql

## Flow: Open Finance (stub note — not deep-dived this pass)
- UI: PluggyConnect* components; edge `open-finance`
- Linked to bank items; detail next if demo needs it

## Traces
- No runtime traces ingested yet (ingest_traces empty).
- Plan: smoke (1) comprovante upload (2) extrato CSV (3) winker sync dry-run or mock — then ingest_traces.

## Presentation pressure
- Prefer documenting truth over new features.
- ENTITY_MAP started in knowledge base.

## Evidence
- File reads 2026-07-15: AuthContext, App, ReceiptUpload, process-comprovante, schema v1, approval_queue
- Earlier CBM (before attestation block): architecture frontend/supabase, fraud checks
- Docs: MAPA_FLUXOS, PLANO_PRODUCAO, WINKER_INTEGRATION
- Knowledge: agent-knowledge-base/projects/audicondo/
