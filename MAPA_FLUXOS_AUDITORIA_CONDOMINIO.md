# Mapa mental dos fluxos de auditoria do condomínio

Data da análise: 2026-04-29

Objetivo: pensar o produto como se estivéssemos dentro da operação real de um condomínio, entendendo o que entra, o que sai, o que a IA precisa extrair, onde cada dado deve ser salvo e o que precisa bater para a auditoria ser confiável.

## Visão curta

O sistema já tem uma boa base para auditoria documental:

- cadastro de condomínios, usuários, moradores e fornecedores;
- upload de comprovantes com arquivo original no Supabase Storage;
- extração de dados com IA via Edge Function;
- importação de extratos bancários;
- conciliação entre comprovante e transação;
- fila de revisão humana;
- trilha de ação em `audit_acoes`.

Mas o fluxo de produção ainda precisa ser fechado em alguns pontos importantes:

- formalizar quais documentos entram em cada fluxo;
- separar melhor despesa, receita, morador e fundo de reserva;
- garantir que cada decisão humana deixe trilha completa;
- garantir que todo arquivo original tenha hash, storage path e vínculo de negócio;
- transformar algumas telas de visão em fluxos reais de ação;
- remover ou isolar caminhos demo/legado que ainda podem confundir o produto.

## Atores reais

### Administradora ou master

Cria condomínios, cria usuários, olha visão geral, acompanha red flags, vê volume de documentos, suspeitas e uso de IA.

### Síndico ou gestor do condomínio

Importa extratos, sobe notas fiscais, comprovantes Pix, boletos, recibos e documentos de prestação de contas. Aprova, rejeita ou pede explicação.

### Morador, inquilino ou proprietário

Pode enviar comprovantes de pagamento de cota, Pix, boleto ou acordo. Esse fluxo precisa ser separado de despesa de fornecedor.

### Auditor humano

Confere alertas, olha documento original, valida motivo da decisão e fecha a trilha.

### IA

Não decide sozinha. Ela extrai dados, classifica o documento, calcula sinais de risco e sugere status. A decisão final crítica deve ficar na fila humana.

## Sistemas externos para bater dados

### Supabase Auth

Valida quem é o usuário e qual condomínio ele pode acessar.

### Supabase Postgres

Guarda o estado auditável: perfis, condomínios, extratos, transações, comprovantes, moradores, orçamentos, reserva e ações de auditoria.

### Supabase Storage

Guarda o arquivo original. O banco deve guardar apenas o caminho do arquivo, hash e metadados.

### Gemini

Extrai dados de documentos que não são estruturados, como PDF e imagem.

### BrasilAPI / Receita Federal

Valida CNPJ, situação cadastral, razão social e CNAE do fornecedor.

### Banco / Open Finance

Hoje o fluxo real é importação manual de extrato. Open Finance aparece como futuro/desativado.

### Sistema de boletos / ERP externo

Ainda não existe de verdade no app. Para auditar receitas com precisão, vamos precisar importar boletos emitidos ou uma lista de cobranças previstas.

## Fluxo 1: onboarding do condomínio

### Entrada

- nome do condomínio;
- CNPJ do condomínio;
- nome e e-mail do síndico;
- senha temporária;
- administradora vinculada, se houver.

### O que salva

- `condominios`: unidade principal de isolamento;
- `auth.users`: usuário do síndico;
- `perfis`: papel, nome, condomínio e administradora.

### Por que importa

Todo o resto depende do `condominio_id`. Se o usuário não estiver vinculado ao condomínio certo, qualquer auditoria posterior fica sem dono confiável.

### Estado atual

O fluxo existe em `create-condo` e foi ajustado para não tentar gravar coluna inexistente. Ainda precisa de teste real no Supabase remoto.

### Falta

- validar duplicidade de CNPJ/e-mail com mensagem clara;
- registrar ação de criação em trilha de auditoria;
- confirmar se master de administradora pode criar apenas dentro da própria administradora.

## Fluxo 2: importação do extrato bancário

### Entrada

- arquivo CSV, OFX, PDF ou imagem;
- `condominio_id`;
- usuário autenticado.

### O que a IA ou parser extrai

Para cada transação:

- data;
- descrição;
- valor;
- tipo: crédito ou débito;
- NSU ou identificador bancário, quando existir;
- código de barras, quando aparecer;
- período do extrato.

### Onde salva

- `extratos_bancarios`: arquivo, hash, período, fonte e condomínio;
- `transacoes_bancarias`: linhas do extrato, tipo, valor, data, descrição e status de conciliação.

### Por que importa

O extrato é a verdade financeira do dinheiro que entrou e saiu. Toda auditoria precisa bater documento contra transação bancária.

### Estado atual

O fluxo principal existe em `process-extrato`. CSV e OFX usam parser nativo. PDF/imagem usam Gemini. A function agora valida usuário e condomínio.

### Falta

- salvar o arquivo original do extrato no Storage, não só os dados extraídos;
- tratar duplicidade de extrato de forma visível para o usuário;
- preencher totais de crédito/débito no registro do extrato;
- melhorar erro quando Gemini não extrai nada;
- decidir se crédito vindo de boleto precisa ser vinculado a uma tabela própria de cobrança.

## Fluxo 3: pagamento de despesa do condomínio

Exemplo real: o condomínio paga manutenção do portão, limpeza, elevador, jardinagem, obra, segurança, administradora ou advogado.

### Entrada

- nota fiscal, recibo, boleto ou comprovante Pix;
- arquivo original;
- opcionalmente morador, fornecedor ou categoria;
- `condominio_id`;
- usuário que fez o upload.

### O que a IA extrai

Para nota fiscal ou recibo:

- tipo do documento;
- CNPJ do emissor;
- razão social;
- número da nota ou recibo;
- data de emissão;
- valor total;
- descrição do serviço;
- natureza do serviço;
- município;
- confiança da extração;
- alertas visuais.

Para Pix:

- E2E ID;
- valor;
- data;
- hora declarada;
- pagador;
- documento do pagador;
- banco do pagador;
- recebedor;
- documento/chave do recebedor;
- banco do recebedor;
- indício de autotransferência.

Para boleto:

- banco;
- cedente;
- sacado;
- valor;
- vencimento;
- nosso número;
- código de barras.

### Onde salva

- arquivo original: bucket `comprovantes` no Supabase Storage;
- metadados e OCR: `comprovantes`;
- fornecedor validado: `fornecedores`;
- ação humana: `audit_acoes`;
- vínculo financeiro: `comprovantes.transacao_id` e `transacoes_bancarias.comprovante_id`.

### O que precisa bater

- valor do documento contra valor do extrato;
- data do documento contra data da transação;
- CNPJ do fornecedor contra Receita Federal;
- CNAE do fornecedor contra natureza do serviço;
- E2E ID Pix contra formato Bacen;
- banco declarado contra ISPB do E2E;
- hash do arquivo contra arquivos já enviados;
- E2E ID contra comprovantes já enviados;
- despesa contra orçamento anual;
- despesa contra regra do fundo de reserva, se for saque/reserva.

### Estado atual

O fluxo mais forte do app está aqui. `ReceiptUpload` salva o arquivo no Storage, cria `comprovantes`, calcula hash e chama `process-comprovante`. A Edge Function usa Gemini, valida CNPJ e aplica regras de fraude.

### Falta

- diferenciar claramente `status` operacional de `status_auditoria`;
- criar uma classificação formal de categoria/custo para bater orçamento;
- criar regra para documento sem transação correspondente;
- automatizar sugestão de match com data e valor, não só valor;
- registrar toda aprovação/rejeição em um único fluxo padrão;
- fazer a fila humana abrir o arquivo original por signed URL;
- guardar resposta bruta da Receita e resultado de CNAE de forma padronizada.

## Fluxo 4: comprovante enviado por morador

Exemplo real: inquilino manda Pix, boleto pago ou comprovante de cota condominial.

### Entrada

- comprovante do morador;
- unidade/apartamento;
- CPF ou nome do pagador;
- valor pago;
- data;
- `morador_id`, quando conhecido.

### O que a IA extrai

- pagador;
- recebedor;
- valor;
- data;
- E2E ID ou linha digitável;
- banco;
- chave Pix;
- indício de autotransferência ou comprovante editado.

### Onde salva

- arquivo original no bucket `comprovantes`;
- registro em `comprovantes`;
- vínculo com `moradores` via `morador_id`;
- possível vínculo com transação bancária de crédito.

### O que precisa bater

- comprovante do morador contra crédito no extrato;
- pagador contra morador/unidade;
- valor contra cobrança prevista;
- data contra vencimento ou acordo;
- recebedor contra conta do condomínio;
- duplicidade de E2E ID.

### Estado atual

O banco já tem `moradores` e `morador_id` em `comprovantes`. A tela principal de upload permite selecionar morador. Mas ainda existe `TenantReceiptUpload` com IA no browser e lógica simplificada.

### Falta

- remover ou refatorar `TenantReceiptUpload` para usar a mesma Edge Function segura;
- criar tabela ou importação de cobranças/boletos esperados;
- separar status de “pagamento recebido” de status de “documento auditado”;
- criar visão por unidade: em aberto, pago, suspeito, rejeitado.

## Fluxo 5: conciliação bancária

### Entrada

- comprovantes auditados ou pendentes;
- transações bancárias não conciliadas;
- regras de match.

### O que o sistema compara

- valor;
- data;
- descrição;
- CNPJ/nome do fornecedor;
- tipo da transação;
- E2E ID, NSU ou código de barras quando existir;
- morador/unidade, se for receita.

### Onde salva

- `comprovantes.transacao_id`;
- `transacoes_bancarias.comprovante_id`;
- `transacoes_bancarias.conciliado = true`;
- ação em `audit_acoes`.

### Estado atual

Existe RPC `find_reconciliation_matches` e tela `ReconciliationQueue`. Hoje o match principal ainda é simples: valor e débito não conciliado.

### Falta

- expandir score com data, descrição, CNPJ, NSU, E2E e código de barras;
- corrigir a Edge Function `reconciliation`, pois ela usa colunas que não existem no schema atual (`status_reconciliacao`, `transacao_vinculada_id`, `rejeitado_em`);
- definir se a conciliação vai acontecer por RPC simples ou Edge Function, para não termos dois caminhos divergentes;
- registrar aprovação/rejeição da conciliação em `audit_acoes`.

## Fluxo 6: fila de revisão humana

### Entrada

- documentos com status `pendente`, `alerta` ou `suspeito`;
- score de fraude;
- flags;
- OCR;
- arquivo original.

### O que o humano decide

- aprovar;
- rejeitar com motivo;
- pedir esclarecimento;
- escalar para master.

### Onde salva

- `audit_acoes`: ação, usuário, motivo, score no momento da ação;
- `comprovantes`: status final, aprovado por, aprovado em, motivo de rejeição.

### Estado atual

Existe uma tela boa de fila humana e existe `audit_acoes`.

### Falta

- permitir abrir o arquivo original direto na fila;
- exigir motivo também para aprovar documento suspeito;
- padronizar nomes de status: hoje há mistura de `aprovado`, `auditado`, `alerta`, `suspeito`;
- implementar ação real de “solicitar esclarecimento”, hoje ela só volta para alerta;
- garantir que toda mudança de status passe por `audit_acoes`.

## Fluxo 7: auditoria de receitas

Exemplo real: moradores pagam cotas, multas, acordos, aluguel de salão, taxa extra ou fundo de reserva.

### Entrada ideal

- boletos emitidos;
- cobrança prevista por unidade;
- extrato com créditos;
- comprovantes enviados por moradores.

### O que precisa bater

- boleto emitido contra crédito bancário;
- crédito bancário contra unidade/morador;
- valor bruto contra taxa, desconto, juros e multa;
- pagamentos duplicados;
- pagamentos parciais;
- inadimplência por unidade;
- antecipação/recebíveis, se houver.

### Estado atual

O app trata transações `CREDIT` como se fossem boletos, mas não existe tabela real de boletos/cobranças. Isso dá uma visão inicial, mas não fecha auditoria de receita.

### Falta

- criar/importar tabela de cobranças;
- vincular cobrança a morador/unidade;
- reconciliar crédito bancário contra cobrança;
- tratar juros, multa, desconto, pagamento parcial e acordo;
- separar receita ordinária, extraordinária e fundo de reserva.

## Fluxo 8: orçamento anual

### Entrada

- categorias aprovadas em assembleia;
- valor mensal ou anual previsto;
- ano de referência;
- despesas reais auditadas.

### O que precisa bater

- categoria da despesa contra categoria orçada;
- gasto realizado contra previsto;
- estouro de orçamento;
- gasto sem categoria;
- remanejamento aprovado em assembleia.

### Estado atual

Existe `orcamento_anual` e tela de orçamento. O cálculo real depende de categoria em comprovantes, mas o schema atual não tem uma coluna formal e consistente de categoria financeira.

### Falta

- criar campo/tabela de categoria financeira;
- classificar comprovantes por categoria;
- distinguir previsto mensal vs previsto anual;
- guardar histórico de alterações do orçamento;
- registrar justificativa para estouro ou remanejamento.

## Fluxo 9: fundo de reserva

### Entrada ideal

- saldo inicial;
- regra de contribuição mensal;
- créditos destinados ao fundo;
- saques do fundo;
- rendimentos;
- documentos aprovando uso do fundo.

### O que precisa bater

- entrada no fundo contra arrecadação;
- saque contra despesa aprovada;
- rendimento contra extrato/informe;
- saldo calculado contra saldo bancário;
- uso do fundo contra regra do condomínio.

### Estado atual

Existem `reserva_config` e `reserva_movimentacoes`, mas a tela ainda é mais demonstrativa. Botões de nova movimentação/configuração não fecham o fluxo completo.

### Falta

- conectar movimentação de reserva com transação bancária;
- conectar saque da reserva com comprovante/despesa;
- criar tela real de nova movimentação;
- guardar documento de aprovação do uso da reserva;
- auditar saldo calculado contra saldo bancário.

## Fluxo 10: red flags do master

### Entrada

- comprovantes suspeitos;
- ações humanas;
- fornecedores;
- flags Pix;
- uso de IA.

### O que o sistema detecta

- alto volume de suspeitos;
- síndico aprovando tudo;
- Pix de autotransferência;
- fornecedor suspeito aparecendo em vários condomínios;
- E2E ID inválido;
- uso alto de IA.

### Estado atual

As views `view_red_flags_master` e `view_api_usage` existem. Isso é um bom começo de auditoria gerencial.

### Falta

- exibir essas flags em fluxo de ação, não só dashboard;
- permitir abrir a lista de documentos que gerou cada flag;
- registrar quando master marcou uma flag como resolvida;
- criar severidade e SLA de revisão.

## Perguntas que o sistema precisa responder em produção

- De onde veio esse dinheiro?
- Para onde esse dinheiro foi?
- Existe documento original?
- O documento original está salvo e recuperável?
- O arquivo já apareceu antes?
- O comprovante bate com o extrato?
- Quem subiu o documento?
- Quem aprovou?
- Quem rejeitou?
- Por qual motivo?
- A empresa existe e está ativa?
- A empresa pode prestar esse serviço pelo CNAE?
- O valor está dentro do orçamento?
- O pagamento deveria sair da conta ordinária ou fundo de reserva?
- O morador que pagou é realmente daquela unidade?
- O crédito no banco corresponde a qual cobrança?
- Existe alguma duplicidade, edição visual ou Pix suspeito?

## Diagnóstico honesto

### Funciona como base real

- Upload e processamento de comprovantes;
- OCR/análise com IA no servidor;
- validações Pix e CNPJ;
- importação de extratos;
- fila humana;
- histórico de comprovantes;
- isolamento por condomínio no modelo de dados;
- Storage privado preparado.

### Parcial

- conciliação bancária;
- auditoria de orçamento;
- fundo de reserva;
- auditoria de receitas;
- morador/unidade;
- red flags master.

### Ainda não está pronto como fluxo real

- Open Finance;
- boletos/cobranças emitidas;
- portal separado de morador;
- aprovação completa de fundo de reserva;
- resolução operacional de red flags;
- Edge Function antiga de reconciliation, que está divergente do schema atual.

## Plano do que falta antes de codar pesado

### Prioridade 1: fechar o caminho feliz de despesas

- Upload de comprovante;
- Storage privado;
- IA extrai dados;
- CNPJ/CNAE validado;
- comprovante fica `auditado`, `alerta` ou `suspeito`;
- auditor abre original;
- auditor aprova/rejeita;
- ação entra em `audit_acoes`;
- comprovante é vinculado à transação do extrato.

### Prioridade 2: fechar extrato e conciliação

- salvar arquivo original do extrato;
- bloquear duplicidade;
- melhorar score de match;
- escolher um único caminho oficial para conciliação;
- corrigir função antiga ou removê-la da rota de produção.

### Prioridade 3: fechar receita de morador

- criar/importar cobranças;
- vincular cobrança a morador/unidade;
- bater crédito bancário contra cobrança;
- tratar inadimplência;
- usar comprovante de morador como evidência, não como única verdade.

### Prioridade 4: fechar orçamento e reserva

- adicionar categoria financeira consistente;
- vincular despesa auditada ao orçamento;
- criar movimentação real de reserva;
- reconciliar reserva com banco;
- registrar documentos de autorização.

### Prioridade 5: limpar produto antes de produção

- esconder/remover componentes demo;
- padronizar status;
- garantir que todo status crítico tenha audit trail;
- revisar Edge Functions antigas;
- aplicar migrations e testar remoto.

## Decisão de arquitetura recomendada

O app deve ter um fluxo oficial por tipo de evento:

- Documento entra sempre por Storage + registro em `comprovantes`;
- IA sempre roda em Edge Function;
- transação bancária sempre entra por `extratos_bancarios` + `transacoes_bancarias`;
- decisão humana sempre passa por `audit_acoes`;
- conciliação sempre grava nos dois lados: comprovante e transação;
- dashboard nunca deve ser a fonte da verdade, apenas leitura das tabelas auditáveis.

Esse modelo deixa o sistema simples de explicar para cliente, auditor e equipe técnica.
