# 💼 MANUAL DO PRODUTO E MODELO DE NEGÓCIO
**Atualizado:** 08/01/2026

---

## 🎯 PROPOSTA DE VALOR

> **"Auditoria automática de despesas condominiais com validação em tempo real contra a Receita Federal"**

O Audi Home automatiza o processo de validação de fornecedores, eliminando:
- Pagamentos para CNPJs inativos ou baixados
- Notas fiscais de empresas com atividade incompatível (fraude de CNAE)
- Comprovantes forjados ou adulterados

---

## 👥 PERSONAS

### Síndico Profissional
- Gerencia múltiplos condomínios
- Precisa de auditoria rápida e confiável
- Quer evitar problemas com prestação de contas

### Administradora de Condomínios
- Processa centenas de documentos por mês
- Precisa de automação para escalar
- Quer reduzir custos operacionais

### Conselho Fiscal
- Precisa auditar as contas do síndico
- Quer transparência total
- Precisa de relatórios claros

---

## 🔄 JORNADA DO USUÁRIO

### FASE 1: Upload Manual (Atual)

```
┌────────────────────────────────────────────────────────────────┐
│ PASSO 1: Upload do Extrato Bancário                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Síndico acessa: Dashboard > Extratos                          │
│                                                                │
│ Faz upload do PDF do extrato mensal do banco                  │
│ (Ex: extrato_itau_janeiro_2024.pdf)                           │
│                                                                │
│ Sistema extrai automaticamente:                               │
│ - Data, descrição, valor de cada transação                    │
│ - Classifica em CRÉDITO ou DÉBITO                             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│ PASSO 2: Upload de Comprovantes                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Síndico acessa: Dashboard > Comprovantes                      │
│                                                                │
│ Faz upload de notas fiscais/recibos:                          │
│ - PDF de nota fiscal eletrônica                               │
│ - Foto de recibo                                               │
│ - XML de NF-e (se disponível)                                 │
│                                                                │
│ Sistema extrai automaticamente:                               │
│ - CNPJ do fornecedor                                          │
│ - Razão social                                                │
│ - Valor                                                       │
│ - Data de emissão                                             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│ PASSO 3: Validação Automática (Acontece em Segundos)          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Para cada comprovante, o sistema:                             │
│                                                                │
│ 1. CONSULTA O CNPJ na Receita Federal                         │
│    ├─ Está ATIVO? ✅ ou ❌                                     │
│    ├─ Nome confere? ✅ ou ❌                                   │
│    └─ CNAE compatível com serviço? ✅ ou ❌                    │
│                                                                │
│ 2. CRUZA COM O EXTRATO                                        │
│    ├─ Encontrou transação com mesmo valor? ✅                 │
│    ├─ Data bate (±3 dias)? ✅                                 │
│    └─ Calcula score de confiança (0-100)                      │
│                                                                │
│ 3. DEFINE STATUS                                              │
│    ├─ Tudo OK → AUDITADO (verde)                              │
│    ├─ Inconsistência → ALERTA (amarelo)                       │
│    └─ Fraude detectada → REJEITADO (vermelho)                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│ PASSO 4: Dashboard com Resultados                             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │                    DASHBOARD                             │   │
│ ├──────────────┬──────────────┬──────────────┬────────────┤   │
│ │  Receitas    │  Despesas    │  Auditados   │   Alertas   │   │
│ │  R$ 45.000   │  R$ 32.000   │     28       │      3      │   │
│ └──────────────┴──────────────┴──────────────┴────────────┘   │
│                                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │  🚨 ALERTAS DE FRAUDE                                   │   │
│ │                                                          │   │
│ │  • CNPJ 12.345.678/0001-99 - BAIXADO na RFB            │   │
│ │  • Empresa com CNAE "Padaria" prestou serviço "Reforma"│   │
│ │  • Nome no documento difere do nome oficial             │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │  ⚠️ GAP FINANCEIRO                                      │   │
│ │                                                          │   │
│ │  5 transações sem comprovante (R$ 4.500,00)             │   │
│ │  → Clique para ver detalhes                              │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### FASE 2: Open Finance (Futuro)

```
┌────────────────────────────────────────────────────────────────┐
│ DIFERENÇA: Extrato vem AUTOMÁTICO do banco                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ 1. Síndico conecta conta bancária via Pluggy (uma vez)        │
│    - Autorização OAuth                                         │
│    - Validade de 12 meses                                      │
│                                                                │
│ 2. Sistema busca transações automaticamente                   │
│    - Sync diário ou sob demanda                                │
│    - Sem necessidade de download de PDF                        │
│                                                                │
│ 3. Reconciliação em tempo real                                │
│    - Morador paga → Banco notifica → Sistema cruza            │
│    - Resultado instantâneo                                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ REGRAS DE VALIDAÇÃO (Anti-Fraude)

### 1. Validação de CNPJ
| Regra | Ação |
|-------|------|
| CNPJ inativo/baixado | ❌ REJEITAR |
| CNPJ não encontrado | ❌ REJEITAR |
| CNPJ ativo | ✅ Continuar |

### 2. Validação de Nome
| Regra | Ação |
|-------|------|
| Similaridade < 30% | 🚨 ALERTA |
| Similaridade >= 30% | ✅ Continuar |

### 3. Validação de CNAE (Regra de Ouro)
| Regra | Ação |
|-------|------|
| CNAE incompatível com serviço | 🚨 ALERTA |
| CNAE compatível | ✅ Continuar |

**Exemplos de CNAE:**
- 4329-1/01 → Manutenção de Elevadores
- 8121-4/00 → Limpeza de Prédios
- 8130-3/00 → Jardinagem
- 4120-4/00 → Construção Civil

---

## 💰 MODELO COMERCIAL

### Custos Operacionais
| Item | Custo |
|------|-------|
| Consulta CNPJ.ws | R$ 0,00 (versão free) |
| Gemini 2.5 Flash | ~R$ 0,001 por imagem |
| Open Finance (Pluggy) | ~R$ 1,50/conta/mês |

### Precificação Sugerida (SaaS)
| Plano | Preço | Inclui |
|-------|-------|--------|
| Starter | R$ 99/mês | 1 condomínio, 100 docs/mês |
| Pro | R$ 249/mês | 5 condomínios, 500 docs/mês |
| Enterprise | R$ 599/mês | Ilimitado + Open Finance |

### ROI para o Cliente
- **Economia de tempo**: ~40h/mês (auditoria manual eliminada)
- **Prevenção de fraude**: Valor inestimável
- **Transparência**: Relatórios automáticos para assembleia

---

## 📊 MÉTRICAS DE SUCESSO

| Métrica | Meta |
|---------|------|
| Tempo de processamento por doc | < 5 segundos |
| Taxa de extração correta | > 95% |
| Taxa de validação CNPJ | 100% |
| Uptime do sistema | > 99.5% |
