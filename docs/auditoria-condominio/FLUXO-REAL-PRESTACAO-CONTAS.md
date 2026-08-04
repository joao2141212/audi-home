# Fluxo real de prestação de contas e auditoria condominial

Data da revisão: 2026-08-04

## Conclusão operacional

O produto não deve tratar extrato, boleto, nota fiscal e comprovante como se
fossem variações do mesmo arquivo. Cada documento responde a uma pergunta
diferente e a auditoria só fica confiável quando as respostas são cruzadas.

O extrato bancário deve formar a população completa de entradas e saídas do
período. Os demais documentos explicam, justificam e autorizam cada
movimentação. Por isso, uma tela que começa apenas pelos comprovantes não
detecta sozinha uma das principais exceções: dinheiro que saiu da conta sem
documento correspondente.

## Dicionário do produto

### Extrato bancário ou arquivo do banco

Relatório da conta corrente com todas as movimentações de um período: saldo
inicial, créditos, débitos e saldo final. Pode ser importado em OFX, CSV ou PDF.

Prova: que houve movimentação na conta, em determinada data e valor.

Não prova: que a despesa era legítima, autorizada, fiscalmente documentada ou
que o fornecedor correto recebeu.

### Movimentação bancária

Uma linha do extrato. Pode ser uma saída, uma entrada, uma tarifa, uma
transferência entre contas ou um estorno.

### Boleto

Documento de cobrança ou ordem para pagar. Contém beneficiário, pagador,
vencimento, valor e linha digitável.

Prova: que existia uma cobrança.

Não prova: que foi paga. O pagamento precisa aparecer no banco e, quando
disponível, ter comprovante emitido pela instituição recebedora.

### Nota fiscal, fatura ou recibo

Documento que descreve o produto ou serviço e identifica quem cobrou.

Prova: a origem e a natureza declarada da obrigação.

Não prova: que o condomínio pagou, que o serviço foi autorizado ou que foi
executado corretamente.

### Comprovante de pagamento

Documento emitido pelo banco ou meio de pagamento para uma operação
específica, como Pix, TED ou pagamento de boleto.

Prova: os dados declarados daquela operação.

Não substitui o extrato: o arquivo pode estar adulterado, duplicado, agendado
em vez de efetivado ou pertencer a outra conta. O débito real precisa ser
confirmado no extrato.

### Balancete ou prestação de contas

Resumo contábil/gerencial que classifica receitas, despesas, saldos e contas.
É o resultado a ser conferido, não a fonte bancária original.

### Conciliação

Confirmação de que uma movimentação do banco e seu conjunto de documentos
pertencem ao mesmo fato financeiro.

## Fluxo correto de despesas

1. Importar o extrato de cada conta do condomínio e selecionar o período.
2. Preservar o arquivo original, hash, conta, período, saldo inicial e saldo
   final.
3. Criar uma linha auditável para cada débito, crédito, tarifa e estorno.
4. Para cada saída, reunir o pacote de evidências aplicável:
   - autorização: orçamento, contrato, assembleia ou alçada;
   - obrigação: nota fiscal, fatura, boleto ou recibo;
   - pagamento: comprovante bancário;
   - liquidação: débito correspondente no extrato.
5. Validar fornecedor, CNPJ, CNAE, beneficiário, valor, data, duplicidade,
   orçamento e regras do fundo de reserva.
6. A IA sugere vínculos e riscos. Um humano abre os originais e decide.
7. Aprovação, rejeição ou pedido de esclarecimento gera trilha imutável.

Uma despesa só pode ser considerada fechada quando o débito bancário estiver
explicado por documentos suficientes e pela autorização exigida naquele caso.

## Fluxo correto de receitas condominiais

1. Importar do Winker ou de outro sistema a cobrança esperada por
   unidade/morador: competência, vencimento, valor, desconto, multa e acordo.
2. Importar os créditos do extrato bancário.
3. Usar boleto, Pix ou comprovante enviado pelo morador como evidência auxiliar
   de identificação, não como substituto do crédito bancário.
4. Vincular cobrança esperada, unidade/pagador e crédito efetivo.
5. Classificar pago, parcial, excedente, atrasado, não identificado, estornado
   ou duplicado.

O módulo de receitas não deve cadastrar manualmente um boleto isolado como
fluxo principal quando o Winker já é a fonte das cobranças emitidas. Upload
manual deve existir apenas como contingência.

## Tela de reconciliação que faz sentido

A tela principal deve ser dirigida pelas movimentações do banco e oferecer
quatro filas:

1. Saídas sem documentação.
2. Documentos sem movimentação bancária.
3. Entradas sem unidade/cobrança identificada.
4. Divergências e vínculos que exigem revisão.

Ao selecionar um item, a pessoa precisa ver lado a lado:

- linha do banco, conta, data, valor, descrição e identificador;
- documento original e dados extraídos;
- fornecedor ou morador;
- cobrança, nota, boleto ou contrato relacionado;
- motivo e confiança de cada sugestão;
- diferença de valor/data;
- ações de vincular, dividir, agrupar, manter pendente ou rejeitar.

O modelo precisa aceitar relações 1:1, 1:N e N:1. Um pagamento pode liquidar
várias notas, uma nota pode ser parcelada e uma tarifa bancária pode não ter
comprovante externo.

## O que está incorreto ou incompleto hoje

- A navegação esconde a importação em `Extratos`, enquanto a Reconciliação pede
  que o usuário importe sem oferecer a ação.
- A Reconciliação começa por comprovantes pendentes. Isso ajuda a localizar o
  pagamento de um documento, mas não garante a completude do extrato.
- A tabela genérica `comprovantes` mistura potencialmente documentos de despesa
  com comprovantes enviados por moradores. Débitos e créditos precisam de
  fluxos e estados distintos.
- O match principal está limitado a valor e data. CNPJ, beneficiário, E2E/NSU,
  descrição, conta e cardinalidade ainda precisam participar da decisão.
- A tela de receitas trata importação manual de boleto como fluxo central,
  embora o Winker deva ser a fonte primária das cobranças emitidas.
- Não está demonstrado que todo extrato original preserve conta, período,
  saldos e hash antes de gerar as transações.
- O texto chama o extrato de verdade financeira. A formulação correta é fonte
  bancária autoritativa da movimentação, não prova isolada da legitimidade.

## Sequência recomendada para o produto

1. Entrada de dados: Winker, arquivos do banco e documentos.
2. Normalização: conta, período, transações, cobranças e tipos documentais.
3. Validações individuais: OCR, CNPJ, CNAE, hash, E2E, código de barras e
   consistência visual.
4. Conciliação bancária dirigida pelo extrato.
5. Auditoria de autorização, orçamento, contrato e fundo de reserva.
6. Revisão humana de exceções.
7. Relatório de prestação de contas com trilha e arquivos originais.

## Fontes de referência

- Código Civil, art. 1.348, VIII: dever do síndico de prestar contas à
  assembleia anualmente e quando exigidas:
  https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm
- Banco Central, glossário financeiro: extrato é o histórico das entradas e
  saídas da conta:
  https://www.bcb.gov.br/pre/pef/port/glossario_cidadania_financeira.pdf
- Banco Central, funcionamento do boleto: boleto é ordem/documento de
  pagamento e entra em compensação somente depois de pago:
  https://www.bcb.gov.br/meubc/faqs/p/como-funciona-a-operacao-com-boleto
- Banco Central, comprovante de pagamento de boleto:
  https://www.bcb.gov.br/meubc/faqs/p/comprovante-do-pagamento-do-boleto
- Secretaria da Fazenda do Paraná, orientação de conciliação bancária:
  conferência entre controles financeiros/contábeis e o extrato:
  https://siafic.fazenda.pr.gov.br/sites/siafic/arquivos_restritos/files/documento/2024-02/otc_n_008_2021_conciliacao_bancaria.pdf
