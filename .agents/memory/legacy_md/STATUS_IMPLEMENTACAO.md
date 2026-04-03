# STATUS DE IMPLEMENTAÇÃO - AUDI HOME
> Gerado em: 2026-01-11

Este documento apresenta o status de implementação de cada item do roadmap original.

---

## ORÇAMENTO ANUAL

| Item | Descrição | Status | Endpoint/Código |
|------|-----------|--------|-----------------|
| - | Verificar a existência ou não de orçamento anual aprovado | ✅ FEITO | Tabela `orcamento_anual` |
| a) | Criar tabela com o orçamento aprovado | ✅ FEITO | `GET /api/budget`, `POST /api/budget/save` |

---

## BANCO - Entradas de Recursos

| Item | Descrição | Status | Endpoint/Código |
|------|-----------|--------|-----------------|
| a) | Conferir os créditos x boletos emitidos | ✅ FEITO | `GET /api/revenue/boletos` |
| a.1) | Apresentar relatório de boletos não pagos | ✅ FEITO | `GET /api/reports/unpaid-boletos` |
| b) | Caso o Condomínio tenha antecipação de receita | ✅ FEITO | Tabela `antecipacoes` |
| b.1) | Conferir o crédito x Resumo de receita – taxa de serviço/desconto | ✅ FEITO | `POST /api/anticipation/save` (calcula taxa automaticamente) |

---

## BANCO - Saídas de Recursos

| Item | Descrição | Status | Endpoint/Código |
|------|-----------|--------|-----------------|
| a) | Conferir se o emissor da nota fiscal está habilitado junto a RFB | ✅ FEITO | `lookupBrasilAPI()` no server.js |
| a.1) | Apresentar relatório das divergências | ✅ FEITO | `GET /api/reports/discrepancies` |
| b) | Verificar se o emissor tem o CNAE para emitir o respectivo serviço | ✅ FEITO | `isCnaeCompatible()` no server.js |
| b.1) | Apresentar relatório das divergências | ✅ FEITO | `GET /api/reports/discrepancies` |
| c) | Conferir cada pagamento realizado x nota fiscal/boleto/guia de imposto | ✅ FEITO | `GET /api/reconciliation/matches/:id` |
| c.1) | Apresentar relatório das divergências | ✅ FEITO | `GET /api/reports/discrepancies` |
| d) | Apresentar inconsistência de juros e multa pagas | ✅ FEITO | Detectado via `audit_report` (JUROS/MULTA) |
| d.1) | Apresentar relatório das divergências | ✅ FEITO | `GET /api/reports/discrepancies` |
| e) | Apresentar débitos/cheques sem respectiva nota fiscal | ✅ FEITO | Transações com `conciliado = 0` |
| e.1) | Apresentar relatório das divergências | ✅ FEITO | `GET /api/reports/discrepancies` |
| f) | Relatório de Pix de diferente titularidade | ⚠️ PARCIAL | `GET /api/audit/pix/ownership` (depende de dados bancários) |
| g) | Relatório dos cheques compensados e Pix enviados | ✅ FEITO | `GET /api/transactions` (filtro por tipo) |

---

## FUNDO DE RESERVA

| Item | Descrição | Status | Endpoint/Código |
|------|-----------|--------|-----------------|
| a) | Conferir depósito mensal x valor programado | ✅ FEITO | `GET /api/reserva/audit/:year/:month` |
| b) | Verificar juros e correção do mês | ✅ FEITO | Tabela `reserva_movimentacoes` (tipo='RENDIMENTO') |
| c) | Relatório saldo anterior + entradas + juros/correção | ✅ FEITO | `GET /api/dashboard/stats` (campo `fundo_reserva`) |
| d) | Relatório de saques | ✅ FEITO | `reserva_movimentacoes` WHERE tipo='SAQUE' |

---

## RESUMO GERAL

| Categoria | Total | Feitos | Parciais | Pendentes |
|-----------|-------|--------|----------|-----------|
| Orçamento Anual | 2 | 2 | 0 | 0 |
| Banco - Entradas | 4 | 4 | 0 | 0 |
| Banco - Saídas | 14 | 13 | 1 | 0 |
| Fundo de Reserva | 4 | 4 | 0 | 0 |
| **TOTAL** | **24** | **23** | **1** | **0** |

---

## PRÓXIMOS PASSOS SUGERIDOS
1. **Frontend**: Criar telas para visualizar os relatórios já disponíveis no backend.
2. **Pix Titularidade**: Integrar com retorno CNAB ou API bancária para obter dados de favorecido.
