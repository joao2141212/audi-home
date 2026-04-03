# 📊 VISÃO GERAL DO PROJETO - AUDI HOME
**Atualizado:** 08/01/2026  
**Versão:** 2.0 (Clareza Fim-a-Fim)

---

## 🎯 O QUE É O AUDI HOME?

Uma plataforma de **auditoria financeira automatizada para condomínios** que:
1. **Valida DESPESAS** (pagamentos a fornecedores) via consulta CNPJ/CNAE
2. **Reconcilia COMPROVANTES** com extratos bancários
3. **Detecta FRAUDES** automaticamente (CNPJ inativo, CNAE incompatível, nome divergente)

---

## 📋 FASES DO PROJETO

### 🟢 FASE 1: PRODUÇÃO (Upload Manual + Validação CNPJ)
**Status: Em Desenvolvimento**

#### Fluxo Fim-a-Fim:

```
┌──────────────────────────────────────────────────────────────────────┐
│                           ETAPA 1: UPLOAD                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   SÍNDICO/ADMIN sobe arquivos:                                      │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│   │ PDF Extrato │  │ PDF Nota    │  │ Imagem      │                │
│   │ Bancário    │  │ Fiscal      │  │ Comprovante │                │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│          │                │                │                        │
│          ▼                ▼                ▼                        │
│   ┌──────────────────────────────────────────────┐                  │
│   │        PARSER UNIVERSAL (backend)            │                  │
│   │                                              │                  │
│   │  PDF com texto? → Regex (CUSTO ZERO)        │                  │
│   │  PDF scan/Imagem? → Gemini 2.5 Flash (IA)   │                  │
│   │  XML/JSON? → Parser Nativo (CUSTO ZERO)     │                  │
│   └──────────────────────────────────────────────┘                  │
│                         │                                           │
│                         ▼                                           │
│              Dados Extraídos:                                       │
│              - CNPJ do Fornecedor                                   │
│              - Razão Social                                         │
│              - Valor                                                │
│              - Data                                                 │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       ETAPA 2: VALIDAÇÃO CNPJ                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Sistema consulta API CNPJ.ws automaticamente:                     │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ CNPJ: 60.523.514/0001-22                                    │   │
│   │                                                              │   │
│   │ ✅ Status RFB: ATIVA                                        │   │
│   │ 📝 Razão Social RFB: OTIS SERVICOS TECNICOS LTDA           │   │
│   │ 🏢 CNAE Principal: 4329-1/01 (Manutenção de Elevadores)    │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   Validações realizadas:                                            │
│   1. CNPJ está ATIVO na Receita Federal?                            │
│   2. Nome no documento CONFERE com nome oficial?                    │
│   3. CNAE é compatível com o serviço prestado?                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       ETAPA 3: RECONCILIAÇÃO                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Cruzamento do comprovante com as transações do extrato:           │
│                                                                      │
│   EXTRATO BANCÁRIO (Upload Manual na Fase 1)                        │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │ Data       │ Descrição                    │ Valor         │    │
│   ├────────────┼──────────────────────────────┼───────────────┤    │
│   │ 2024-01-15 │ MANUTENCAO ELEVADORES OTIS   │ -R$ 1.500,00  │    │
│   │ 2024-01-18 │ PAGTO LIMPEZA PREDIAL        │ -R$ 850,00    │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│   COMPROVANTE ENVIADO                                               │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │ CNPJ: 60.523.514/0001-22                                   │    │
│   │ Valor: R$ 1.500,00                                         │    │
│   │ Data: 2024-01-15                                           │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│   ► MATCH ENCONTRADO! Score: 100%                                   │
│     - Valor: EXATO (+50pts)                                         │
│     - Data: EXATA (+30pts)                                          │
│     - CNPJ ativo: SIM (+10pts)                                      │
│     - Nome confere: SIM (+10pts)                                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       ETAPA 4: RESULTADO                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Possíveis Status:                                                 │
│                                                                      │
│   ✅ AUDITADO                                                       │
│      CNPJ ativo + Nome confere + CNAE compatível                    │
│      → Despesa APROVADA                                             │
│                                                                      │
│   🚨 ALERTA DE FRAUDE                                               │
│      - Nome no documento ≠ Nome na RFB (< 30% similaridade)         │
│      - CNAE incompatível (ex: Padaria prestando serviço de Reforma) │
│      → Despesa para REVISÃO MANUAL                                  │
│                                                                      │
│   ❌ REJEITADO                                                       │
│      - CNPJ inativo/baixado na Receita Federal                      │
│      → Despesa BLOQUEADA                                            │
│                                                                      │
│   ⚠️ GAP (Faltante)                                                 │
│      - Transação no extrato SEM comprovante vinculado               │
│      → Pendência para o síndico                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### Entradas da Fase 1:
- **PDF de Extrato Bancário** (upload manual)
- **PDF/Imagem de Comprovantes** (notas fiscais, recibos)

#### Saídas da Fase 1:
- **Dashboard** com métricas (total auditado, aprovado, rejeitado, gaps)
- **Alertas de Fraude** em tempo real
- **Relatório de Gap** (transações sem comprovante)

---

### 🟡 FASE 2: OPEN FINANCE (Pluggy API)
**Status: Código Pronto, Aguardando Ativação**

#### O que muda:
O **extrato bancário** deixa de ser upload manual e passa a vir **direto do banco** via API:

```
┌──────────────────────────────────────────────────────────────────────┐
│                      FASE 2: OPEN FINANCE                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   1. Síndico conecta conta do condomínio via Widget Pluggy          │
│      (Autorização OAuth, validade 12 meses)                         │
│                                                                      │
│   2. Sistema busca transações automaticamente:                      │
│      pluggy.transactions.list(account_id) → [{...}, {...}]         │
│                                                                      │
│   3. Reconciliação agora é AUTOMÁTICA:                              │
│      - Morador sobe comprovante                                     │
│      - Sistema cruza com extrato REAL do banco                      │
│      - Resultado instantâneo                                        │
│                                                                      │
│   Vantagem: Elimina upload de extrato, dados sempre atualizados    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ ARQUITETURA TÉCNICA

### Stack:
| Camada | Tecnologia |
|--------|------------|
| Frontend | React + TypeScript + TailwindCSS |
| Backend | Python 3.11 + FastAPI |
| IA/OCR | Google Gemini 2.5 Flash |
| Validação CNPJ | CNPJ.ws API |
| Open Finance | Pluggy API (Fase 2) |
| Database | Supabase (Produção) / MockDB (Dev) |

### Fluxo de Dados:
```
Frontend → Backend API → Parser Universal → CNPJ Service → Reconciliation Engine → Database
```

---

## 💡 REGRA DE OURO (Anti-Fraude)

A principal validação do sistema:

> **"O CNAE da empresa deve ser compatível com o serviço prestado"**

Exemplos de fraude detectada:
- ❌ CNPJ com CNAE "Comércio de Bebidas" emitindo nota de "Reforma de Telhado"
- ❌ CNPJ com CNAE "Padaria" prestando serviço de "Manutenção de Elevadores"
- ❌ CNPJ baixado/inativo emitindo nota fiscal

---

## 📊 MÉTRICAS DO DASHBOARD

| Métrica | Descrição |
|---------|-----------|
| **Receitas** | Total de créditos no período |
| **Despesas** | Total de débitos no período |
| **Auditados** | Despesas com CNPJ válido + CNAE ok |
| **Alerta Fraude** | Despesas com inconsistências |
| **Rejeitados** | CNPJ inativo ou inexistente |
| **Gap Financeiro** | Valor sem comprovante vinculado |
| **Faltantes** | Número de transações sem doc |

---

## 🚀 COMO RODAR LOCAL

```bash
# Backend (porta 8082)
cd backend
python3.11 -m uvicorn app.main:app --reload --port 8082

# Frontend (porta 7374)
cd frontend
npm run dev -- --port 7374
```

Acessos:
- **Dashboard**: http://localhost:7374
- **API Docs**: http://localhost:8082/docs

---

## ✅ CHECKLIST FASE 1 PARA PRODUÇÃO

- [x] Parser Universal (PDF/Imagem/XML)
- [x] Extração com Regex (custo zero para PDF texto)
- [x] Integração Gemini 2.5 Flash (para imagens/scans)
- [x] Validação CNPJ via API (status, CNAE)
- [x] Comparação de nome (doc vs RFB)
- [x] Motor de Reconciliação heurístico
- [x] Dashboard com métricas
- [x] Alertas de fraude
- [x] Gap Analysis
- [ ] Migrar MockDB → Supabase
- [ ] Deploy Edge Functions (se necessário)
- [ ] Testes com dados reais de produção
