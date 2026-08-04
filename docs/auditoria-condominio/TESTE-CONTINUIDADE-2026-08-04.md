# Ledger de continuidade e testes - 2026-08-04

## Escopo desta rodada

Validar os caminhos publicados do Winker e da fila de revisão com a conta QA,
sem usar dados de cliente. O navegador visual da sessão não estava disponível,
então a validação de interface ficou limitada a build, lint e contratos reais
do Supabase.

## Evidências observadas

- [x] `frontend`: `npm run build` passou.
- [x] `frontend`: `npm run lint` passou.
- [x] Supabase Auth settings respondeu HTTP 200.
- [x] Leitura anônima de `perfis` respondeu HTTP 401.
- [x] Login QA respondeu HTTP 200 com sessão e usuário.
- [x] `perfis`, `comprovantes`, `winker_documents`, `winker_external_records`,
  `winker_connections` e `view_fila_revisao` responderam HTTP 200 autenticado.
- [x] `winker_documents` retornou 10 registros QA, todos com
  `storage_status=available`.
- [x] `winker-document-download` respondeu HTTP 200 e entregou `signed_url`.
- [x] `view_fila_revisao` retornou 10 registros QA, todos com arquivo presente.
- [x] As duas execuções QA que ficaram `running` durante o transporte terminaram
  `success`; a última finalizou em aproximadamente 100 ms depois de iniciada.
- [ ] `connector-health` ainda precisa de um teste com `provider` válido: GET
  respondeu 405 e POST com `{}` respondeu 400 `PROVIDER_INVALID`. Isso é uma
  rejeição de contrato de entrada, não evidência de health positivo.
- [ ] Validação visual no navegador publicado: bloqueada porque nenhum
  navegador estava disponível nesta sessão.

## Problema encontrado

`sync-winker` iniciou uma execução real, mas a chamada HTTP não entregou
headers em até 20 segundos. A tabela `winker_sync_runs` confirmou a execução
como `running` durante o teste. Uma execução anterior terminou `success` em
aproximadamente 100 ms, portanto Auth, RLS e o gateway não são a causa do
bloqueio observado.

O risco era a UI permanecer com spinner indefinido enquanto o processamento
externo ou download do Winker continuava no backend.

## Solução aplicada no código

- [x] `supabase/functions/sync-winker/index.ts`: login, páginas e arquivos
  agora usam timeout configurável por `WINKER_HTTP_TIMEOUT_MS`, com padrão de
  30 segundos, e convertem abortos em classes de erro `WINKER_WEB_*_TIMEOUT`.
- [x] `frontend/src/features/winker/WinkerImport.tsx`: a ação de sincronização
  deixa de aguardar indefinidamente; após 45 segundos consulta o último
  `winker_sync_runs`, distinguindo `running` de `success` e `failed`.
- [x] A tela impede nova tentativa cega enquanto a mensagem orienta aguardar
  a execução remota, mantendo o botão bloqueado enquanto o último run está
  `running`.

## Estado de publicação

- [ ] Alteração do frontend publicada no hosting.
- [ ] Alteração da Edge Function `sync-winker` publicada no Supabase.
- [ ] Revalidação autenticada após deploy.

## Próximo passo executável

Publicar os dois artefatos alterados e repetir o teste QA de sincronização,
medindo separadamente tempo até headers, status de `winker_sync_runs` e
resultado final. Não marcar Winker como concluído antes desse gate.

## Correção de UX identificada na auditoria visual

### Problema

Na tela `ComplianceReport`, o vínculo de uma transação usava um `<select>` com
todos os comprovantes carregados. Com muitos arquivos, o síndico precisava
percorrer uma lista longa de nomes técnicos e repetidos para encontrar o
documento correto.

### Solução

- [x] Substituído o seletor bruto por uma lista filtrável dentro do cartão.
- [x] Adicionada busca por nome do arquivo, valor ou ID.
- [x] Adicionado estado de nenhum resultado.
- [x] Mantida seleção acessível com `role=listbox`, `role=option` e
  `aria-selected`.
- [x] Build e lint passaram após a alteração.
- [ ] Validação visual no app publicado ainda depende de deploy e navegador
  disponível.

## Correção de UX identificada no histórico de comprovantes

### Problema

O histórico de `ReceiptUpload` exibía uma lista sem busca, sem filtro por
status/período e limitada aos 20 registros mais recentes. Um síndico não
conseguia localizar um comprovante antigo sem rolar a lista inteira.

### Solução

- [x] Removido o limite artificial de 20 registros na consulta do histórico.
- [x] Adicionada busca por arquivo, empresa, CNPJ, descrição ou valor.
- [x] Adicionado filtro por status: auditado, suspeito, alerta, pendente e
  rejeitado.
- [x] Adicionado filtro por data inicial e final.
- [x] Adicionado contador de resultados, botão para limpar filtros e estado
  vazio contextualizado.
- [x] Build e lint passaram após a alteração.
- [ ] Validação visual no app publicado ainda depende de deploy e navegador
  disponível.

## Correção de linguagem visual dos filtros

### Problema

Os filtros de status exibiam emojis dentro de `<option>` nativo, por exemplo
`✅ Aprovados`, `🚨 Suspeitos` e `❌ Rejeitados`. O resultado variava por sistema
operacional e transmitia aparência infantil, além de não seguir o pacote de
ícones do produto.

### Solução

- [x] `ComprovantesHistory`: filtro de status substituído por menu customizado
  com ícones Lucide, estado selecionado e confirmação visual.
- [x] `ComprovantesHistory`: emojis removidos dos tipos Pix, nota fiscal,
  boleto e recibo; o tipo agora usa ícone e texto.
- [x] `ApprovalQueue`: emojis removidos das abas de status e substituídos por
  ícones Lucide.
- [x] Build e lint passaram após a alteração.
- [ ] Validação visual no app publicado ainda depende de deploy e navegador
  disponível.

## Avisos não bloqueantes

- O build informa base de Browserslist desatualizada.
- O bundle JavaScript principal excede 500 kB após minificação.
- `git diff --check` acusa trailing whitespace preexistente em
  `.codebase-memory/adr.md`; não pertence às alterações desta rodada.

## Varredura completa de emojis na interface

### Problema

Havia 58 ocorrências de emojis ou símbolos decorativos no frontend, distribuídas
em alertas de fraude, categorias de despesas, painel Master, upload, mensagens
de resultado, reconciliação, transações e moradores. Isso deixava a linguagem
visual inconsistente com o restante do produto e com aparência infantil em
filtros, badges e avisos.

### Solução

- [x] `FraudAlert`: alertas e estado verificado agora usam ícones Lucide.
- [x] `ExpenseAuditForm`: 13 categorias de serviço agora usam componentes
  Lucide nos cartões; o `<select>` usa texto sem emoji.
- [x] `UploadComprovantes`: processamento, IA, parser, custo, armazenamento e
  aviso de persistência agora usam ícones Lucide; log técnico sem emoji.
- [x] `MasterDashboard`: red flags, abas, status, erros, limite de API e
  acesso restrito agora usam ícones Lucide.
- [x] `ReceiptUpload`: mensagens de status ficaram textuais e consistentes.
- [x] `ReconciliationQueueRefactored`: confirmações e log técnico agora usam
  ícone ou texto sem emoji.
- [x] `AddTransactionForm`: sucesso de reconciliação agora usa `CheckCircle`;
  log técnico sem emoji.
- [x] `TenantManager`: tipos de morador e badge de suspeitos agora usam texto
  e ícone Lucide.
- [x] `ApprovalQueue`: mensagens de toast ficaram sem emoji; as abas já usam
  ícones Lucide.
- [x] Nova varredura nos 39 arquivos de código do frontend encontrou zero
  ocorrências restantes de emoji ou símbolo decorativo.
- [x] Nomes de arquivos, descrições e fixtures de teste não foram alterados,
  pois são dados e não decoração da interface.
- [x] `npm run build` passou.
- [x] `npm run lint` passou.
- [ ] Validação visual no app publicado depende de publicação e navegador
  disponível.

## Correção do acesso do histórico à revisão humana

### Problema

O histórico mostrava download e expansão de detalhes, mas clicar no documento
não levava à fila de revisão. O síndico não tinha um caminho direto para
visualizar a evidência, aprovar, pedir esclarecimento, rejeitar e voltar ao
histórico.

### Solução

- [x] `ComprovantesHistory` agora aceita a ação `Revisar` e também abre a
  revisão ao clicar na linha ou usar Enter/Espaço.
- [x] `App` mantém o ID do comprovante selecionado ao trocar da aba Histórico
  para Fila de Revisão.
- [x] `ApprovalQueue` expande automaticamente o documento selecionado e
  preserva a visualização segura por URL assinada.
- [x] Se o documento já saiu de `view_fila_revisao`, a fila o busca diretamente
  em `comprovantes`, respeitando o condomínio do usuário; isso evita clique sem
  resposta em documentos aprovados ou rejeitados.
- [x] A fila ganhou `Voltar ao histórico`.
- [x] Documentos já aprovados ou rejeitados ficam consultáveis, mas sem liberar
  uma nova alteração de status pela tela de revisão.
- [x] `npm run build` passou.
- [x] `npm run lint` passou.
- [ ] Publicar o frontend e validar no app hospedado o caminho Histórico →
  Revisão → Preview → Ação → Voltar.

## Correção do fluxo de importação e conciliação de boletos

### Problema

A tela `Cadastrar boleto` não importava boleto. Ela apenas gravava pagador,
valor e vencimento em `boletos_emitidos`, sem arquivo, linha digitável,
beneficiário ou caminho para vincular o pagamento do extrato. Isso induzia a
entender que o boleto deveria ser anexado ao OFX, o que está conceitualmente
errado: OFX é a fonte do lançamento bancário e não um contêiner de documentos.

### Solução

- [x] Formulário renomeado para `Importar boleto` e explicado em linguagem de
  operação: anexar a evidência do boleto, depois vincular o crédito do
  extrato/OFX.
- [x] Upload de boleto em PDF, JPG ou PNG, com limite de 10 MB, no bucket
  privado `comprovantes`, usando o caminho do condomínio e limpeza do arquivo
  quando a gravação do registro falhar.
- [x] Migration criada para adicionar beneficiário, linha digitável, nome,
  tipo e caminho do arquivo, além do índice parcial de `transacao_id`.
- [x] RLS de `boletos_emitidos` permanece por condomínio e usa a função de
  acesso com o padrão otimizado `(SELECT ...)`.
- [x] Crédito do extrato/OFX pode ser selecionado na importação ou vinculado
  posteriormente diretamente na tabela.
- [x] A lista exibe arquivo anexado, status de vínculo, data do pagamento e
  divergência entre valor do boleto e valor do crédito.
- [x] Ação `Ver boleto` cria URL assinada de curta duração para abrir o arquivo
  no Storage privado.
- [x] Busca da lista passou a filtrar pagador, beneficiário, arquivo e linha
  digitável.
- [x] Build, lint e `git diff --check` passaram.
- [ ] Aplicar a migration no projeto Supabase remoto.
- [ ] Validar no ambiente publicado o upload autenticado, a inserção, a URL
  assinada e o vínculo real com um crédito do extrato. Essa validação ainda
  depende da publicação da migration/frontend e de uma sessão QA válida.

## Correção da Central de Reconciliação

### Problema

A Central de Reconciliação mostrava uma lista visual de `Fornecedor
Desconhecido`, data e valor, mas não explicava a finalidade da tela nem
apresentava o comprovante e o lançamento bancário com dados suficientes para
decidir. A busca de matches usava a data atual, não a data do comprovante. A
ação de aprovação também não aplicava o condomínio no filtro das atualizações.

### Solução

- [x] Texto da tela passou a explicar o fluxo: selecionar comprovante, conferir
  o débito no extrato, abrir a evidência e confirmar o vínculo.
- [x] Cada item mostra nome do arquivo, descrição, fornecedor, data e valor e
  tem estado selecionado explícito.
- [x] O comprovante pode ser aberto com URL assinada do Storage privado.
- [x] A busca usa a data real do comprovante e tolerância configurada da RPC,
  em vez de usar a data de hoje.
- [x] O candidato exibe descrição, data, valor, confiança e diferença de
  valor antes da decisão.
- [x] A ação foi renomeada para `Vincular e marcar como conciliado`, com
  estado de processamento, erro visível e opção de manter pendente.
- [x] Atualizações de comprovante e transação passaram a filtrar também por
  `condominio_id`.
- [x] Build, lint e `git diff --check` passaram.
- [ ] Publicar frontend e validar com sessão QA que seleção, preview, matching
  e vínculo alteram os registros reais do Supabase.

## Publicação do ambiente real em 2026-08-04

- [x] Build de produção gerado com `npm run build`: código 0; bundle
  `frontend/dist/assets/index-yt3qLajo.js`.
- [x] Lint gerado com `npm run lint`: código 0.
- [x] Migration `20260804120000_boleto_documents_and_reconciliation.sql`
  aplicada no Supabase `vheqwyakucpvymjojezn` pelo endpoint administrativo:
  HTTP 201.
- [x] Banco remoto confirmou `beneficiario`, `linha_digitavel`, `arquivo_url`,
  `arquivo_nome` e `arquivo_tipo` em `boletos_emitidos`.
- [x] Policy remota confirmada: `boletos_emitidos_condo_isolation`.
- [x] Nove Edge Functions publicadas no Supabase: `audit`, `audit-expense`,
  `create-condo`, `dashboard`, `process-comprovante`, `process-extrato`,
  `reconciliation`, `sync-winker` e `transactions`.
- [x] Frontend enviado para `main` no commit `fd427d6`.
- [x] Deploy Netlify de produção live: deploy
  `6a725866c1585d318a8f9036`, domínio `https://auditcondo.com`.
- [x] Browser público confirmou que o domínio serve
  `/assets/index-yt3qLajo.js` e renderiza a tela de login.
- [ ] Fluxos autenticados de upload, preview, matching e vínculo ainda não
  foram executados porque não há uma sessão QA válida disponível no navegador.

### Incidente do CLI de migration

O `supabase db push` foi tentado apenas em modo `--dry-run` e parou antes de
aplicar SQL porque o projeto recusou criar o login temporário do CLI com
`permission denied to alter role`. A migration não foi aplicada por esse
caminho. O endpoint administrativo autorizado foi usado em seguida e retornou
HTTP 201; a consulta remota das colunas e da policy confirmou o efeito.

## Correção responsiva da Central de Reconciliação em 2026-08-04

### Problema observado

Na tela publicada, ao selecionar um comprovante com viewport de aproximadamente
800px CSS, o cartão selecionado ocupava toda a largura e a conferência com o
extrato era empurrada para depois dos 81 comprovantes. A instrução dizia para
ver os matches "ao lado", mas isso não era possível nesse tamanho.

### Solução aplicada

- [x] A grade da Central mudou de `lg:grid-cols-5` para `md:grid-cols-5`.
- [x] A lista usa `md:col-span-2` e a conferência usa `md:col-span-3`.
- [x] Em telas menores que `md`, o empilhamento continua intencional para não
  quebrar a leitura em celular.
- [x] Build e lint passaram após a alteração.
- [x] Bundle corrigido publicado no Netlify: deploy
  `6a725c955b98eb6e0c95d4b9`.
- [x] Browser público confirmou o bundle novo
  `/assets/index-V3DqWTem.js` no domínio `https://auditcondo.com`.
- [ ] A inspeção da tela autenticada nessa largura ainda depende de uma sessão
  QA acessível neste navegador.

## Revisão conceitual do fluxo bancário e documental em 2026-08-04

### Problema identificado

A interface e o mapa anterior não deixavam claro o papel de extrato, boleto,
nota fiscal e comprovante. A Reconciliação também começa pelos comprovantes,
o que não garante a detecção de saídas bancárias sem documento.

### Diagnóstico e encaminhamento

- [x] Definido que extrato é a fonte bancária das movimentações, não um
  comprovante nem uma prova isolada da legitimidade da despesa.
- [x] Definido que boleto é cobrança, nota/recibo documenta a obrigação e
  comprovante documenta uma tentativa/operação específica de pagamento.
- [x] Definido o pacote de evidências de despesa: autorização + obrigação +
  comprovante + débito no extrato.
- [x] Definido o pacote de receita: cobrança esperada + unidade/pagador +
  crédito no extrato, com comprovante do morador como evidência auxiliar.
- [x] Documentado o modelo completo em
  `docs/auditoria-condominio/FLUXO-REAL-PRESTACAO-CONTAS.md`.
- [x] A Reconciliação ganhou definição visível de extrato e comprovante e ação
  direta para abrir a importação do arquivo do banco.
- [x] O estado sem correspondência também oferece a importação, em vez de
  apenas mandar o usuário procurar outra tela.
- [x] A tela `Extratos` passou a exibir a importação antes do histórico e usa
  linguagem operacional: exportar no internet banking e enviar OFX, CSV ou
  PDF.
- [ ] Mudar a Reconciliação para também partir das movimentações do extrato e
  expor saídas sem documento, documentos sem transação, entradas não
  identificadas e divergências.
- [ ] Separar semanticamente despesas de fornecedores e pagamentos de
  moradores, ainda que a migração física seja executada em etapas.
- [ ] Fazer o Winker ser a fonte principal de cobranças emitidas; boleto manual
  deve ser contingência.
- [x] `npm run build` passou e gerou o bundle
  `frontend/dist/assets/index-UAjoQQ-P.js`.
- [x] `npm run lint` passou sem erros.
- [x] Frontend publicado no Netlify: deploy
  `6a725f9cffd58e6bd83d51b5`.
- [x] Navegador público confirmou que `https://auditcondo.com` serve o bundle
  novo `/assets/index-UAjoQQ-P.js`.
- [ ] A navegação autenticada do botão Reconciliação → Importar arquivo do
  banco ainda precisa de prova DOM numa sessão controlável; o navegador de
  verificação abriu somente o acesso público.

## Especificação canônica dos fluxos em 2026-08-04

### Objetivo

Consolidar em um único documento o modelo correto de auditoria condominial, o
estado atual do AudiCondo, dependências, gaps e critérios de aceite, além de um
briefing que possa ser enviado a LLMs de pesquisa para comparação externa.

### Evidência e resultado

- [x] Reindexação completa do checkout canônico executada antes da análise.
- [x] Índice CBM confirmou 2.187 nós e 3.968 relações no `main`, SHA
  `ab9eccd6bc26865fa8d6803117278b6e48f10144`.
- [x] Fluxos atuais cruzados com o mapa histórico, integração Winker, contrato
  de conectores, matriz de comprovantes e frontend ativo.
- [x] Fontes oficiais e páginas de produtos comparáveis pesquisadas para
  construir o roteiro de benchmark.
- [x] Criado
  `docs/auditoria-condominio/ESPECIFICACAO-CANONICA-FLUXOS.md` com 17 fluxos,
  entidades, estados, dependências, critérios de aceite, ordem de execução e
  prompt portátil para pesquisa externa.
- [x] `docs/auditoria-condominio/README.md` aponta para a nova referência única.
- [ ] Executar os gaps na ordem definida no documento; esta etapa produziu a
  especificação e não marca os fluxos incompletos como resolvidos.
