# Especificação canônica dos fluxos do AudiCondo

Versão: 1.0

Data-base: 2026-08-04

Estado do código usado na análise: branch `main`, SHA `ab9eccd`

Índice CBM reconstruído: 2.187 nós, 3.968 relações, checkout coberto

## 1. Finalidade deste documento

Este é o documento canônico para explicar, pesquisar, projetar, implementar e
testar o AudiCondo. Ele substitui mapas antigos como referência de produto,
mas não apaga os ledgers históricos.

O documento separa explicitamente:

- prática esperada da operação condominial;
- decisão de produto do AudiCondo;
- comportamento observado no código atual;
- comportamento já comprovado em runtime;
- gap que ainda precisa ser implementado ou validado;
- hipótese que deve ser confirmada por contador, auditor, advogado ou pesquisa.

Ele também foi escrito para ser anexado integralmente a uma LLM de pesquisa.
O roteiro de pesquisa está no final.

## 2. Resumo executivo

O AudiCondo não deve ser outro ERP condominial nem outro internet banking. Ele
deve funcionar como camada independente de evidência, correlação, revisão e
prestação de contas sobre dados vindos de três grupos de fontes:

1. sistema de gestão, inicialmente Winker;
2. contas bancárias, nesta fase por importação manual de extratos;
3. documentos originais enviados ou importados.

O sistema precisa responder, com evidência recuperável:

- todo dinheiro que entrou foi identificado e destinado corretamente?
- todo dinheiro que saiu tem obrigação, autorização e beneficiário válidos?
- os documentos pertencem à movimentação bancária indicada?
- os saldos, receitas, despesas, orçamento e reservas fecham no período?
- quem enviou, alterou, revisou, aprovou, rejeitou ou publicou cada item?
- quais exceções permanecem abertas e por quê?

IA, CNPJ, CNAE e score de risco geram evidência auxiliar e alertas. Eles não
podem declarar fraude nem substituir a decisão humana fundamentada.

## 3. Escopo e limites

### 3.1 Escopo central

- ingestão de dados do Winker;
- importação de extratos bancários;
- armazenamento e normalização de documentos;
- auditoria de despesas e receitas;
- correlação de CNPJ, fornecedor, valores, datas e identificadores bancários;
- conciliação bancária;
- orçamento e fundo de reserva;
- revisão humana e pedidos de esclarecimento;
- fechamento mensal e prestação de contas;
- trilha de auditoria e transparência controlada;
- detecção e tratamento de exceções e sinais de fraude.

### 3.2 Fora desta fase

- Open Finance;
- movimentar dinheiro, pagar contas ou emitir ordens bancárias;
- substituir o ERP/contabilidade da administradora;
- substituir contador, auditor independente, advogado ou assembleia;
- emitir conclusão jurídica automática de fraude;
- usar dados reais de cliente como fixture de QA sem autorização.

### 3.3 Regra de integração

O Winker é requisito e fonte operacional primária para seus próprios dados. O
Supabase é a fonte de verdade do estado auditável do AudiCondo. O Vertex é o
processador remoto de documentos não estruturados. Nenhuma dessas fontes,
isoladamente, é suficiente para fechar uma prestação de contas.

## 4. Atores e segregação de funções

| Ator | Pode fazer | Não deve fazer sozinho |
|---|---|---|
| Master/administradora | configurar condomínios, integrações e usuários; acompanhar carteira | aprovar silenciosamente itens do próprio tenant sem trilha |
| Síndico/gestor | fornecer documentos, importar extratos, responder pendências, preparar período | apagar evidência ou alterar período fechado |
| Auditor/revisor | analisar originais, criar exceções, decidir e emitir parecer | modificar fonte original para fazer o item fechar |
| Conselho/aprovador | comentar e aprovar/rejeitar a pasta do período | alterar transações ou OCR |
| Morador/proprietário | enviar evidência própria e consultar conteúdo publicado/autorizado | ler dados pessoais ou financeiros de outro morador |
| Operador do sistema | reprocessar falhas e monitorar integrações | visualizar segredos ou conteúdo sem autorização funcional |
| IA | extrair, classificar, comparar e explicar sinais | aprovar contas, acusar pessoa ou concluir fraude |

Quando o mesmo usuário acumular papéis, a trilha deve registrar o conflito e a
interface deve exigir justificativa adicional nas decisões de maior risco.

## 5. Glossário e força probatória operacional

| Objeto | O que demonstra | O que não demonstra sozinho |
|---|---|---|
| Extrato bancário | movimentações, saldos, conta e período declarados pelo banco | legitimidade, autorização ou natureza da operação |
| Movimentação bancária | uma entrada, saída, tarifa, estorno ou transferência | documento suporte e classificação correta |
| Boleto | existência de uma cobrança/ordem de pagamento | pagamento efetivo |
| Nota fiscal/fatura/recibo | obrigação e fornecedor declarados | autorização e pagamento efetivo |
| Comprovante bancário | dados declarados de uma operação específica | liquidação final no extrato e legitimidade da despesa |
| Contrato/orçamento/ata | autorização, condições ou decisão administrativa | execução, faturamento e pagamento |
| Cobrança de morador | valor esperado por unidade e competência | recebimento efetivo |
| Balancete | classificação e resumo contábil/gerencial | completude das fontes originais |
| Pasta de prestação de contas | conjunto organizado de evidências do período | aprovação automática das contas |
| Parecer/decisão humana | conclusão de um responsável sobre as evidências | imutabilidade, se não houver trilha e versão |

## 6. Princípios obrigatórios

1. Completude: começar pela população total de movimentações bancárias, não
   apenas pelos documentos que alguém decidiu enviar.
2. Evidência original: preservar arquivo, hash, origem, horário, tenant e
   cadeia de processamento.
3. Reconciliação bidirecional: localizar transação sem documento e documento
   sem transação.
4. Separação de estados: processamento, auditoria, conciliação, cobrança e
   publicação nunca compartilham um único status genérico.
5. Revisão humana: alertas críticos exigem acesso ao original e decisão
   explicada.
6. Idempotência: reenvio, retry, cron e sincronização não criam duplicatas.
7. Tenant obrigatório: toda leitura, escrita, arquivo e função pertence a um
   condomínio autorizado.
8. Período auditável: fechamento impede alterações retroativas silenciosas.
9. Privacidade: relatórios e documentos publicados mostram somente os dados
   necessários à finalidade e ao papel do usuário.
10. Evidência de execução: HTTP 200, resposta da IA ou build não provam o fluxo
    completo; é necessário conferir UI, banco, Storage, trilha e efeito.

## 7. Cadeia ponta a ponta

```text
Configuração do condomínio e período
  -> sincronização Winker
  -> importação dos arquivos do banco
  -> recebimento/importação de documentos
  -> normalização e validações individuais
  -> conciliação de receitas e despesas
  -> análise de orçamento, reserva e autorizações
  -> revisão humana das exceções
  -> fechamento do período
  -> pasta/relatório de prestação de contas
  -> aprovação e publicação controlada
  -> monitoramento posterior e auditoria investigativa
```

Dependências principais:

```text
Tenant + papéis
  -> todas as outras funções

Winker + moradores/unidades + cobranças
  -> receitas e inadimplência

Contas + extratos + documentos
  -> reconciliação

Reconciliação + revisão + orçamento + reserva
  -> fechamento do período

Fechamento + aprovação
  -> publicação aos moradores
```

## 8. Entidades canônicas

Os nomes abaixo são conceitos de domínio. O nome físico da tabela pode mudar.

| Entidade | Responsabilidade | Situação no AudiCondo |
|---|---|---|
| Condomínio, administradora, perfil e papel | isolamento e autorização | existente; requer varredura final de papéis e RLS |
| Unidade e morador | identidade operacional de cobrança | existente/parcial; integração Winker precisa ser a origem preferida |
| Integração e execução de sync | configuração, retry, cursor e telemetria | existente para conectores; Winker possui caminho nativo |
| Registro externo | cópia normalizada e idempotente da fonte | existente para Winker/conectores |
| Conta bancária | banco, agência, conta, tipo e titular | incompleto como objeto operacional visível |
| Extrato bancário | arquivo original, conta, período, saldos e hash | processamento existe; preservação/completude ainda precisa ser comprovada |
| Movimentação bancária | linha normalizada do banco | existente |
| Documento | arquivo original, tipo, hash, origem e versão | parcialmente concentrado em `comprovantes` |
| Execução de IA | modelo, prompt/versionamento, resultado, erro e correlação | estrutura criada; cobertura de todos os fluxos precisa de auditoria |
| Fornecedor | CNPJ, situação, atividades e histórico | existente/parcial |
| Contrato/autorização | alçada, assembleia, orçamento e vigência | não existe como fluxo completo |
| Cobrança | unidade, competência, vencimento, valores e estado | existe/importada parcialmente; Winker deve ser fonte primária |
| Vínculo de conciliação | relação N:N com valor alocado e decisão | modelo atual tende a 1:1; precisa evoluir |
| Ação de auditoria | ator, decisão, motivo, antes/depois e evidência | `audit_acoes` existe; cobertura deve ser total |
| Caso/exceção | investigação, responsável, SLA e resolução | ausente como objeto unificado |
| Orçamento | conta/categoria, período, versão e autorização | existente/parcial |
| Fundo de reserva | saldo, contribuição, aplicação, saque e autorização | existente/parcial |
| Período de prestação | competência, checklist, bloqueio e aprovação | ausente como fluxo canônico |
| Pasta/relatório publicado | versão, público, redaction e assinaturas | documentos Winker existem; fechamento/publicação AudiCondo estão incompletos |

## 9. Máquinas de estado obrigatórias

### 9.1 Documento

```text
recebido -> armazenado -> processando -> processado
                                |-> falhou -> retry/cancelado
```

### 9.2 Auditoria documental

```text
não_analisado -> sem_alerta | alerta | suspeito
               -> em_revisão -> aprovado | rejeitado | esclarecimento_solicitado
```

### 9.3 Conciliação

```text
não_conciliado -> candidatos_encontrados -> revisão
               -> conciliado | parcial | divergente | sem_correspondência
```

### 9.4 Cobrança

```text
prevista -> emitida -> aberta -> paga | parcial | vencida | acordo | cancelada
                                   |-> estornada
```

### 9.5 Período

```text
aberto -> importando -> conciliando -> em_revisão -> pronto_para_fechar
       -> fechado -> em_aprovação -> aprovado | rejeitado -> publicado
```

Reabrir um período exige permissão, motivo e evento de auditoria.

## 10. Matriz geral dos fluxos

| ID | Fluxo | Estado do desenho | Estado atual resumido |
|---|---|---|---|
| F01 | Acesso, tenant e papéis | definido | implementado; validação completa de papéis pendente |
| F02 | Condomínio, unidades e moradores | definido | parcial; UI e tabelas existem |
| F03 | Integração Winker e conectores | definido | Winker remoto e documentos existem; cobertura por recurso precisa ser medida |
| F04 | Contas, períodos e extratos | definido | importação existe; controle formal de conta/período incompleto |
| F05 | Entrada e custódia de documentos | definido | forte para comprovantes; taxonomia ainda misturada |
| F06 | IA e validação documental | definido | Vertex/CNPJ implementados; regras precisam de calibração e evidência |
| F07 | Fornecedores, contratos e autorização | definido | fornecedor parcial; contrato/alçada ausentes |
| F08 | Despesas e contas a pagar | definido | parcial; falta pacote completo e fluxo dirigido pelo banco |
| F09 | Receitas, cobranças e inadimplência | definido | parcial; Winker/boletos existem, mas a reconciliação não fecha o ciclo |
| F10 | Conciliação bancária | definido | parcial; UI atual é documento -> débito e match simples |
| F11 | Revisão, esclarecimento e decisão | definido | aprovação/rejeição existem; caso/esclarecimento completos faltam |
| F12 | Orçamento e variações | definido | parcial |
| F13 | Fundo de reserva e aplicações | definido | parcial/demonstrativo |
| F14 | Fechamento e prestação de contas | definido | ausência de workflow canônico de fechamento |
| F15 | Aprovação e transparência | definido | Winker oferece referência; publicação AudiCondo incompleta |
| F16 | Red flags e investigação | definido | dashboards/flags existem; gestão de casos ausente |
| F17 | Operação, segurança e evidência técnica | definido | base Supabase/telemetria existe; cobertura ponta a ponta pendente |

## 11. Especificação detalhada dos fluxos

### F01. Acesso, tenant e papéis

Objetivo: garantir que cada ação pertença ao condomínio correto e ao papel
autorizado.

Fluxo correto:

1. master cria ou importa condomínio;
2. usuário recebe convite ou senha temporária e confirma identidade;
3. perfil recebe papel e condomínio explícitos;
4. backend valida JWT, perfil, papel e tenant em toda operação;
5. Storage, tabelas, RPCs e Edge Functions aplicam o mesmo isolamento;
6. alteração de papel ou desligamento revoga acesso e gera trilha.

Exceções: e-mail duplicado, usuário sem perfil, convite expirado, recuperação
de senha, tentativa cross-tenant e master sem escopo.

Aceite: dois tenants QA não conseguem ler, baixar, alterar ou inferir IDs um do
outro; cada negação fica registrada sem expor segredo.

Gap atual: auditar matriz real de permissões de master, síndico, auditor,
conselho e morador. A UI hoje apresenta principalmente master e síndico.

### F02. Condomínio, unidades e moradores

Objetivo: manter a estrutura necessária para cobrança, atribuição e acesso.

Fluxo correto:

1. sincronizar portal, divisões, unidades e usuários ativos do Winker;
2. reconciliar identidade externa com registros canônicos sem usar nome como
   chave;
3. guardar vigência de ocupação/propriedade e método de correção;
4. permitir cadastro manual apenas como contingência identificada;
5. nunca transformar dado externo ambíguo em identidade definitiva sem revisão.

Aceite: uma cobrança e um crédito podem ser atribuídos à unidade correta no
período histórico, mesmo após troca de morador.

Gap atual: a tabela/tela de moradores existe, mas falta provar vigência,
deduplicação, correção e sincronização completa do Winker.

### F03. Integração Winker e conectores

Objetivo: trazer dados e documentos operacionais sem depender de processo
local ou sessão do navegador.

Fluxo correto:

1. credenciais ficam somente em secrets do Supabase;
2. `sync-winker` autentica por REST, resolve portal e coleta recursos;
3. cada página é persistida por tenant, provider, tipo e ID externo;
4. arquivos são baixados para Storage privado com metadados e hash;
5. execução mostra início, progresso, cursor, sucesso parcial, erro e retry;
6. recurso removido na origem é arquivado ou marcado, nunca apagado em silêncio;
7. UI exibe origem, data da última sincronização e cobertura por recurso.

Recursos esperados: portal, unidades, moradores, documentos, boletos/cobranças,
manutenções, reservas e anexos disponíveis na API.

Aceite: repetir o sync não duplica registros; falhar um recurso não apaga os
demais; documento importado pode ser visualizado e baixado na UI.

Estado atual: caminho remoto Winker -> Edge Function -> Supabase existe, assim
como documentos importados e download. Não considerar todos os recursos
completos sem contagem e amostragem autenticada por endpoint.

### F04. Contas, períodos e extratos bancários

Objetivo: formar a população completa do dinheiro movimentado.

Fluxo correto:

1. selecionar conta e competência;
2. enviar OFX preferencialmente, CSV ou PDF como fallback;
3. preservar o arquivo original, hash e metadados da conta/período;
4. extrair saldo inicial/final e todas as linhas;
5. validar continuidade entre períodos e somatório dos movimentos;
6. detectar arquivo repetido, período sobreposto e linha duplicada;
7. pedir revisão quando PDF/IA não garantir completude;
8. disponibilizar histórico, erro, retry e cancelamento.

Aceite: saldo inicial + créditos - débitos fecha com saldo final dentro da
regra definida; o total de linhas extraídas pode ser conferido contra o arquivo.

Estado atual: `process-extrato`, `extratos_bancarios`,
`transacoes_bancarias`, UI de importação e histórico existem. Ainda falta
provar preservação, conta, saldos, sobreposição e completude para todos os
formatos.

### F05. Entrada e custódia de documentos

Objetivo: receber qualquer evidência comum sem perder original ou contexto.

Entradas: PDF, imagem, DOC/DOCX/ODT, XLS/XLSX, PPT/PPTX, texto e formatos
normalizados suportados. Arquivo binário legado exige normalizador verificável.

Fluxo correto:

1. classificar intenção: despesa, receita de morador, contrato, autorização,
   extrato, balancete, folha/imposto ou outro;
2. validar extensão, MIME, tamanho e assinatura do arquivo;
3. guardar original imutável em Storage privado;
4. calcular hash e criar registro antes do processamento assíncrono;
5. normalizar para visualização/OCR sem substituir o original;
6. expor preview, download, estado, erro, retry, cancelamento e versão;
7. vincular o documento ao evento de negócio correto.

Aceite: cada formato suportado possui fixture QA visualmente conferida e o
download devolve o mesmo hash do original.

Gap atual: `comprovantes` acumula naturezas diferentes. É necessário separar
tipo documental de direção financeira, propósito e estado de auditoria.

### F06. IA e validação documental

Objetivo: extrair fatos e gerar sinais explicáveis.

Fluxo correto:

1. normalizador produz representação adequada ao Vertex;
2. execução registra modelo, versão do prompt, correlation ID e hashes;
3. retorno estruturado passa por schema estrito;
4. valores, datas, CNPJ, E2E/NSU, código de barras e totais são normalizados;
5. CNPJ e situação são consultados em fonte autorizada;
6. CNAE incompatível gera alerta, nunca conclusão automática de fraude;
7. regras visuais/documentais armazenam evidência e confiança;
8. falha técnica não vira documento aprovado nem suspeita financeira.

Aceite: fixtures normais, divergentes, duplicadas, adulteradas e incompletas
produzem resultados reproduzíveis; a UI mostra regra, dado observado e limite.

Estado atual: pipeline remoto Vertex, Storage, tabelas de comprovantes e
validação de CNPJ existem. Calibração, versionamento e cobertura por formato
continuam sujeitos à matriz de testes.

### F07. Fornecedores, contratos e autorização

Objetivo: provar quem forneceu, o que foi autorizado e sob quais condições.

Fluxo correto:

1. fornecedor é identificado por CNPJ e histórico, não apenas nome;
2. contrato/orçamento registra objeto, vigência, valor, recorrência e anexos;
3. regra de alçada define quem autoriza por categoria/valor;
4. obra ou gasto extraordinário guarda ata/decisão aplicável;
5. renovação, reajuste e concentração por fornecedor geram sinais;
6. pagamento fora de contrato ou acima da alçada vai para revisão.

Aceite: ao abrir uma despesa, o auditor vê fornecedor, obrigação, autorização,
histórico e documentos relacionados.

Gap atual: validação cadastral existe parcialmente; contrato, concorrência,
alçada e autorização ainda não formam um fluxo canônico.

### F08. Despesas e contas a pagar

Objetivo: explicar e validar cada saída de dinheiro.

Pacote de evidência esperado:

```text
autorização + obrigação fiscal/comercial + comprovante + débito no extrato
```

Fluxo correto:

1. débito do banco entra na fila, ainda que nenhum documento tenha sido enviado;
2. sistema procura nota, fatura, boleto, recibo, contrato e comprovante;
3. compara valor, data, beneficiário, CNPJ, identificadores e categoria;
4. permite 1:1, 1:N e N:1, com valor alocado por vínculo;
5. valida orçamento, reserva, recorrência e autorização;
6. exceção vai para responsável e SLA;
7. humano fecha, rejeita ou pede complemento.

Exceções mínimas: saída sem documento, documento sem saída, beneficiário
divergente, duplicidade, parcelamento, pagamento em lote, tarifa, estorno,
transferência entre contas, valor/data divergentes e gasto não autorizado.

Estado atual: upload e auditoria documental são fortes, e existe uma tela de
despesas. O fluxo ainda não é dirigido por todos os débitos do extrato nem
reúne o pacote completo.

### F09. Receitas, cobranças e inadimplência

Objetivo: explicar cada crédito e acompanhar o que deveria ter sido recebido.

Fluxo correto:

1. Winker fornece cobrança esperada por unidade, competência e vencimento;
2. créditos vêm dos extratos;
3. boleto/Pix/comprovante do morador auxilia a identificação;
4. sistema vincula cobrança, unidade/pagador e crédito;
5. separa principal, multa, juros, desconto, taxa e fundo;
6. trata parcial, excedente, duplicado, estorno, acordo e garantia de receita;
7. inadimplência considera substituição/cancelamento de cobranças e acordos.

Aceite: totais de aberto, pago, parcial, vencido e acordo fecham por unidade e
com o banco; cada diferença é explicada.

Estado atual: moradores, boletos importados/manuais, créditos e tela de receita
existem. O Winker deve ser a fonte normal e o upload/cadastro manual apenas
contingência. O ciclo completo ainda precisa ser provado.

### F10. Conciliação bancária

Objetivo: garantir completude e correspondência entre banco e controles.

A tela precisa oferecer quatro filas:

1. saídas sem documentação;
2. documentos sem movimentação;
3. entradas sem cobrança/unidade identificada;
4. divergências e vínculos em revisão.

Cada decisão mostra lado a lado banco, original, dados extraídos, fornecedor ou
morador, cobrança/contrato, score explicado e diferenças.

O vínculo canônico deve guardar transação, documento/cobrança, valor alocado,
regra, decisão, ator e horário. Marcar dois campos reciprocamente não é
suficiente para relações N:N.

Aceite: o período informa quantidades e valores conciliados, parciais, sem
correspondência e divergentes; não é possível conciliar acima do valor
disponível sem justificativa.

Estado atual: fila documento -> possível débito, preview, match por valor/data
e aprovação existem. A direção inversa e cardinalidade flexível faltam.

### F11. Revisão, esclarecimento e decisão

Objetivo: transformar exceção técnica em decisão humana rastreável.

Fluxo correto:

1. fila permite busca, filtros, prioridade, responsável e SLA;
2. revisor abre todos os originais e correlações;
3. aprova, rejeita, pede esclarecimento ou escala;
4. decisão suspeita exige motivo, inclusive para aprovação;
5. pedido de esclarecimento cria conversa/tarefa e aguarda resposta;
6. nova evidência reabre a revisão sem apagar a versão anterior;
7. histórico permite voltar à origem e ao relatório.

Aceite: toda transição crítica cria `audit_acoes` com antes/depois, ator,
motivo e referências; decisão final não pode ser alterada silenciosamente.

Estado atual: fila, preview, aprovação e rejeição existem. O pedido de
esclarecimento, atribuição, SLA e gestão de caso ainda não estão completos.

### F12. Orçamento e variações

Objetivo: comparar realização com o plano aprovado.

Fluxo correto:

1. cadastrar/importar orçamento por ano, conta e categoria;
2. preservar versões e ata de aprovação;
3. classificar despesas e receitas reconciliadas;
4. comparar mensal, acumulado e projeção;
5. remanejamento ou estouro exige justificativa/autorização;
6. drill-down abre os lançamentos e documentos causadores.

Aceite: cada valor do realizado é derivável de transações reconciliadas e cada
alteração do previsto tem versão e autor.

Estado atual: `orcamento_anual` e UI existem; categoria consistente,
versionamento e drill-down completo ainda faltam.

### F13. Fundo de reserva e aplicações

Objetivo: impedir mistura ou uso não autorizado de recursos vinculados.

Fluxo correto:

1. configurar regra, conta/aplicação e contribuição;
2. identificar créditos destinados ao fundo;
3. registrar rendimentos, tarifas e transferências;
4. saque exige autorização, finalidade e documentos da despesa;
5. saldo calculado fecha com banco/aplicação;
6. relatório separa reserva, fundo de obras e caixa ordinário.

Aceite: qualquer movimentação do fundo abre sua origem/destino, autorização e
transação bancária.

Estado atual: configuração e movimentos existem; vínculo bancário,
autorização e fechamento ainda são parciais.

### F14. Fechamento e prestação de contas

Objetivo: fechar mensalmente a população financeira antes da aprovação anual.

Checklist mínimo:

- todas as contas e extratos do período importados;
- saldos inicial/final e continuidade conferidos;
- débitos e créditos classificados;
- exceções materiais resolvidas ou explicitamente abertas;
- orçamento e reserva reconciliados;
- documentos originais recuperáveis;
- decisões e ressalvas registradas;
- resumo, balancete e anexos versionados;
- período bloqueado contra alteração silenciosa.

Saídas: balancete conferido, relatório de exceções, posição de inadimplência,
orçado x realizado, reserva, parecer e pasta de evidências.

Aceite: qualquer número do relatório permite drill-down até a linha do banco,
documentos e decisões que o compõem.

Gap atual: não existe um objeto/workflow canônico de período com checklist,
fechamento, lock, reabertura e versão do relatório.

### F15. Aprovação e transparência

Objetivo: permitir análise do conselho e publicação adequada aos moradores.

Fluxo correto:

1. pasta fechada é enviada aos aprovadores definidos;
2. cada aprovador comenta, solicita correção, aprova ou rejeita;
3. regras definem unanimidade/maioria e ordem;
4. versão alterada invalida aprovações quando necessário;
5. publicação ocorre somente após critério de aprovação;
6. visão de morador aplica redaction e permissões;
7. abertura, comentário, versão e retirada de publicação são auditados.

Referência funcional: o Winker declara pasta digital, busca, comentários,
aprovação digital e possibilidade de restringir visualização até aprovação.

Gap atual: documentos Winker aparecem no AudiCondo, mas o ciclo próprio de
fechar, aprovar, publicar e retirar publicação ainda não está completo.

### F16. Red flags e investigação

Objetivo: transformar sinais isolados em casos investigáveis.

Sinais possíveis, nunca conclusões automáticas:

- saída sem documentação;
- documento duplicado, hash/E2E repetido ou visual alterado;
- beneficiário diferente do fornecedor/contrato;
- CNPJ baixado ou CNAE aparentemente incompatível;
- divisão de pagamentos perto de alçada;
- fornecedor concentrado, relacionado ou recorrente sem concorrência;
- valor/data/competência divergentes;
- transferência para conta não cadastrada;
- saque ou uso de reserva sem autorização;
- pagamento anterior à obrigação ou posterior ao encerramento;
- receitas esperadas ausentes ou crédito sem unidade;
- estornos, reversões e alterações após fechamento;
- aprovador concentrado ou aprovando alertas sem motivo;
- ausência de extrato, saldo ou sequência documental.

Fluxo correto: regra -> alerta explicado -> agrupamento em caso -> responsável
-> evidência -> conclusão humana -> ação corretiva -> resolução/monitoramento.

Aceite: cada caso preserva hipóteses, evidências favoráveis e contrárias,
decisões e impacto estimado; a UI usa “alerta/indício”, não “fraude confirmada”.

Estado atual: compliance, flags e dashboards existem; gestão de caso,
responsável, SLA e resolução estão ausentes.

### F17. Operação, segurança e evidência técnica

Objetivo: garantir que o sistema auditável também possa ser auditado.

Requisitos:

- RLS/tenant em toda tabela, RPC, função e Storage;
- segredos somente no backend;
- logs estruturados com função, tenant autorizado, entidade, correlation ID,
  fase, resultado, latência e classe de erro, sem segredo;
- async com estado, retry idempotente, cancelamento e dead-letter quando
  aplicável;
- health separado de prova funcional;
- hash e versão de arquivos, prompts, modelos e relatórios;
- retenção, exportação, anonimização/redaction e eliminação conforme política;
- backup e recuperação testados;
- testes de autorização negativos;
- release comprovado por bundle/versão e comportamento autenticado.

Aceite: para uma operação QA é possível reconstruir entrada, chamadas,
persistência, arquivo, decisão, saída e erro sem depender de console local.

## 12. Arquitetura de informação recomendada

O menu atual possui muitas telas no mesmo nível. A organização de produto deve
seguir o trabalho do usuário:

1. **Visão geral**: saúde do período, pendências e risco.
2. **Entradas**:
   - Winker e integrações;
   - arquivos do banco;
   - documentos.
3. **Conciliação**:
   - saídas;
   - entradas;
   - documentos órfãos;
   - divergências.
4. **Auditoria**:
   - fila humana;
   - casos e red flags;
   - fornecedores/contratos.
5. **Financeiro**:
   - despesas;
   - receitas/inadimplência;
   - orçamento;
   - reservas.
6. **Prestação de contas**:
   - períodos;
   - fechamento;
   - aprovações;
   - publicação e histórico.
7. **Administração**: condomínios, pessoas, papéis, integrações e telemetria.

Dashboard é leitura derivada. Não é local de criar estado financeiro.

## 13. Critério universal de aceite por fluxo

Um fluxo só pode ser marcado como pronto quando houver evidência de:

1. entrada válida e inválida;
2. autorização e isolamento por tenant;
3. persistência no banco e arquivo no Storage, quando aplicável;
4. idempotência/retry;
5. loading, vazio, sucesso, erro, degradado e ação ocupada na UI;
6. telemetria correlacionável;
7. efeito cruzado nos consumidores seguintes;
8. download/preview dos originais;
9. histórico e reversão/arquivamento autorizado;
10. comportamento autenticado no ambiente publicado.

## 14. Ordem recomendada de implementação

### Bloco A. Fundamento financeiro

1. conta/período/extrato original e completude;
2. taxonomia documental;
3. vínculo N:N de conciliação;
4. quatro filas de reconciliação.

### Bloco B. Despesas auditáveis

5. fornecedor, contrato, alçada e autorização;
6. pacote completo da despesa;
7. esclarecimento e gestão de exceção.

### Bloco C. Receitas auditáveis

8. cobertura Winker por unidade/cobrança;
9. crédito x cobrança x unidade;
10. parcial, acordo, estorno e inadimplência.

### Bloco D. Fechamento

11. categoria/orçamento;
12. reserva/aplicações;
13. período, checklist, lock e relatório;
14. aprovação e publicação.

### Bloco E. Investigação e escala

15. casos, SLA e red flags transversais;
16. carteira master, métricas e exportação de evidências.

## 15. Benchmark inicial de mercado

As afirmações abaixo vêm de páginas oficiais/marketing e precisam de teste
prático antes de virar requisito.

| Produto/grupo | Evidência pública relevante | O que pesquisar |
|---|---|---|
| Winker | balancete interativo, receitas/despesas, documentos, busca, comentários, aprovação e pasta digital | fluxo completo de aprovação, API por recurso, permissões e exportação |
| Superlógica | cobrança, inadimplência/acordos, conciliação automática, orçamento e prestação digital | modelo de cobrança, baixa, acordos, contas a pagar, fechamento e trilha |
| CondoConta | conta, pagamentos, reserva, emissão de cotas e integração por CNAB/VAN/API | conciliação, dados bancários disponíveis, segregação de fundos e API |
| TownSq | transparência, comunicação e materiais de prestação de contas | profundidade financeira real versus apresentação/engajamento |
| Condomínio21/Group | ERP condominial e conciliação de contas a receber | arquivos bancários, contas a pagar, relatórios e APIs |
| uCondo | gestão condominial e financeira | cobrança, banco, documentos, aprovação e exportação |
| AuditaCon/Finacc/Audipastas | auditoria condominial digital, análise de prestação e relatórios | cobertura 100%, regras de fraude, workflow humano e entregáveis |
| Condo Control/HOAS | contabilidade, reconciliação, orçamento, reservas, aprovação, fechamento e audit trail | desenho internacional transferível e diferenças regulatórias |

Referências iniciais:

- Winker: https://www.winker.com.br/blog/balancete-interativo-winker/
- Superlógica: https://recorrencia.superlogica.com/crm-de-cobranca
- CondoConta: https://condoconta.com.br/
- TownSq: https://condominio.townsq.com.br/gestao-financeira-do-condominio
- AuditaCon: https://auditacon.com/
- Finacc: https://www.finacc.com.br/auditoria-condominio
- Condo Control: https://www.condocontrol.com/
- HOAS: https://hoas.ph/features.html

## 16. Perguntas obrigatórias para pesquisa externa

Para cada produto, responder com URL e data de consulta:

1. É ERP, banco, portal, auditoria ou combinação?
2. Qual é a fonte primária de banco e de cobranças?
3. Importa OFX, CSV, PDF, CNAB, API ou Open Finance?
4. Preserva o arquivo original e permite download?
5. A conciliação parte do banco, do documento ou de ambos?
6. Suporta 1:N, N:1, parcial, lote, tarifa, estorno e transferência?
7. Detecta débito sem documento e documento sem débito?
8. Como trata boleto, nota fiscal e comprovante?
9. Como trata moradores, unidades, inadimplência e acordos?
10. Há contas a pagar, contrato, alçada e dupla aprovação?
11. Há orçamento versionado e variação com drill-down?
12. Há reserva/aplicação separada e autorização de saque?
13. Existe fechamento mensal com lock/reabertura?
14. Como funciona pasta digital, parecer, assinatura e publicação?
15. Há audit trail imutável e histórico de versões?
16. Quais red flags/fraudes são anunciadas e quais evidências mostram?
17. IA decide ou apenas sugere? Há explicação e revisão humana?
18. Quais papéis/permissões existem?
19. Como protege dados pessoais de moradores nos relatórios?
20. Existe API pública, webhook, exportação e sandbox?
21. Qual parte foi comprovada em documentação técnica, demo ou uso real?
22. Qual recurso é marketing sem evidência suficiente?

## 17. Formato esperado da pesquisa

Cada achado deve ser classificado como:

- `CONFIRMADO_PRIMARIO`: documentação oficial, lei, norma ou API;
- `CONFIRMADO_PRODUTO`: ajuda oficial, demo ou manual do fornecedor;
- `MARKETING`: declaração comercial sem prova operacional;
- `RELATO_SECUNDARIO`: artigo, review ou relato de usuário;
- `INFERENCIA`: conclusão do pesquisador;
- `NÃO_ENCONTRADO`.

Tabela obrigatória:

| Tema | AudiCondo alvo | AudiCondo hoje | Produto comparado | Evidência | Diferença | Recomendação |
|---|---|---|---|---|---|---|

A recomendação deve distinguir:

- requisito indispensável para auditoria;
- melhoria de usabilidade;
- diferencial competitivo;
- recurso de ERP/banco fora do escopo;
- risco jurídico/contábil que exige especialista.

## 18. Prompt portátil para uma LLM de pesquisa

Copie o texto abaixo e anexe este documento inteiro:

```text
Você está validando a especificação de um produto brasileiro de auditoria de
condomínios chamado AudiCondo. Leia integralmente o documento anexado antes de
pesquisar.

Objetivo:
1. validar os fluxos contra fontes atuais da internet;
2. comparar o desenho com produtos equivalentes ou adjacentes;
3. identificar erros conceituais, omissões e oportunidades;
4. separar requisito de auditoria de recurso de ERP, banco ou portal;
5. não inventar funcionalidades nem tratar marketing como prova.

Fontes prioritárias:
- legislação e órgãos oficiais brasileiros;
- Conselho Federal de Contabilidade e normas de auditoria aplicáveis;
- Banco Central e Receita Federal;
- documentação oficial, API, central de ajuda e demonstrações dos produtos;
- estudos e empresas especializadas, sempre marcados como fonte secundária.

Produtos mínimos:
Winker, Superlógica, CondoConta, TownSq, Condomínio21/Group, uCondo,
AuditaCon, Finacc, Audipastas, Condo Control e ao menos duas plataformas
internacionais com reconciliação, aprovação e audit trail.

Regras:
- informe URL, título, data da página e data da consulta;
- use citação próxima de cada afirmação;
- marque o nível de evidência conforme a taxonomia do documento;
- diga explicitamente quando não encontrar prova;
- não presuma que uma feature anunciada possui API ou funciona ponta a ponta;
- não proponha Open Finance como requisito da fase atual;
- não transforme alerta de IA, CNPJ ou CNAE em prova de fraude;
- aponte questões que exigem contador, auditor ou advogado.

Entregáveis:
A. resumo executivo;
B. matriz produto x fluxo;
C. validação fluxo por fluxo;
D. lista de erros/omissões da especificação;
E. recursos comuns no mercado que faltam;
F. diferenciais reais do AudiCondo;
G. recomendações priorizadas em obrigatório, importante e opcional;
H. perguntas para entrevista com síndico, conselho, administradora e auditor;
I. apêndice de fontes.
```

## 19. Fontes normativas e conceituais iniciais

- Código Civil, art. 1.348, VIII, dever do síndico de prestar contas:
  https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm
- Banco Central, conceito de extrato:
  https://www.bcb.gov.br/pre/pef/port/glossario_cidadania_financeira.pdf
- Banco Central, funcionamento de boleto:
  https://www.bcb.gov.br/meubc/faqs/p/como-funciona-a-operacao-com-boleto
- Banco Central, comprovante de pagamento de boleto:
  https://www.bcb.gov.br/meubc/faqs/p/comprovante-do-pagamento-do-boleto
- Receita Federal, CNPJ e situação cadastral:
  https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/cadastros/cnpj
- CFC, NBC TA, incluindo identificação de riscos e evidência de auditoria:
  https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade/nbc-ta-de-auditoria-independente/
- LGPD, finalidade, necessidade, segurança e direitos do titular:
  https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm

## 20. Questões que exigem validação profissional

Este documento é especificação de produto, não parecer contábil ou jurídico.
Antes de declarar conformidade ou comercializar “auditoria” como serviço
profissional, validar com especialistas:

- escopo e responsabilidade do parecer emitido;
- uso das NBC TA e limites da expressão “auditoria”;
- documentação e prazo de retenção por natureza;
- obrigações fiscais, trabalhistas, previdenciárias e de seguros;
- acesso de moradores a documentos e redaction de dados pessoais;
- regras da convenção/assembleia para orçamento, obras, alçadas e reserva;
- valor probatório e assinatura eletrônica;
- responsabilidade por falso positivo, falso negativo e acusação de fraude.

## 21. Regra de atualização

Toda mudança material de produto deve atualizar primeiro este documento ou
registrar explicitamente a divergência no ledger. Nenhum fluxo pode ser marcado
como pronto apenas porque sua tela renderiza ou uma função retorna sucesso.
