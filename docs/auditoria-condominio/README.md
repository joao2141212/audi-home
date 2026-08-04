# Auditoria operacional do AudiCondo

Esta pasta e o ledger compartilhado entre agentes. Ela separa:

- comportamento comprovado no navegador e em endpoints locais;
- configuracao e dados observados no Supabase;
- comportamento apenas inferido pelo codigo ou pela documentacao;
- lacunas que impedem fechar a entrega.

## Arquivos

- `ESPECIFICACAO-CANONICA-FLUXOS.md`: referência única do modelo de negócio,
  todos os fluxos corretos, estado atual, gaps, critérios de aceite e briefing
  portátil para pesquisa externa.
- `STATUS-2026-07-31.md`: estado atual, evidencias, riscos e bloqueios.
- `ARQUITETURA-AUDITADA.md`: limites reais entre frontend, Supabase, proxy Vertex e Winker.
- `MATRIZ-TESTES-COMPROVANTES.md`: casos executaveis e criterios de aprovacao.
- `fixtures/manifest.json`: dados canonicos dos cenarios sinteticos.
- `output/pdf/qa-fixtures/`: PDFs gerados para QA.

## Regra de seguranca

Os PDFs sao sinteticos, usam entidades ficticias e devem permanecer marcados como QA. Nao representam comprovantes reais, nao devem ser enviados a terceiros e nao devem ser usados como prova financeira.

Nenhuma senha, chave, token, dado de cliente ou valor de producao deve ser registrado aqui.
