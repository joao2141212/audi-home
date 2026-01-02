# 📋 Documentação de Requisitos Solicitados

## 🎯 ESCOPO COMPLETO DO SISTEMA

### Objetivo Principal
Sistema de auditoria financeira para condomínios que valida **ENTRADAS** (receitas de moradores) e **SAÍDAS** (despesas com fornecedores).

---

## 1️⃣ AUDITORIA DE ENTRADAS (Receitas) ✅ IMPLEMENTADO

### Fluxo
1. Morador paga boleto
2. Morador envia comprovante (PDF/JPG)
3. Sistema processa OCR
4. Sistema detecta fraude (metadados, duplicatas)
5. Sistema valida contra extrato bancário (Pluggy)
6. Resultado: APROVADO ou REJEITADO

### Tecnologias
- ✅ Pluggy (Open Finance) - Extrato do condomínio
- ✅ OCR (Tesseract/Mock) - Extração de dados
- ✅ Fraud Detector - Análise de metadados
- ✅ Supabase - Persistência

---

## 2️⃣ AUDITORIA DE SAÍDAS (Despesas) ⚠️ PARCIALMENTE IMPLEMENTADO

### Requisitos da AI Search

#### A. Integração com BrasilAPI (RFB)
**Status**: ❌ NÃO IMPLEMENTADO

**Requisito**:
- Criar `backend/services/rfb_service.py`
- Usar API pública: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
- Função `validate_supplier(cnpj)`:
  - Retorna: `{ status_cadastral, cnae_principal, descricao_cnae }`
  - Se status != "ATIVA", flaggar como ALERTA CRÍTICO

**Atual**:
- Existe `rfb_validator.py` mas usa API paga (dbdireto)
- Não usa BrasilAPI gratuita

#### B. Backend - Endpoint de Auditoria
**Status**: ❌ NÃO IMPLEMENTADO

**Requisito**:
```
POST /audit/expense
Body: {
  transaction_id_pluggy,
  cnpj_fornecedor,
  codigo_servico
}

Fluxo:
1. Busca transação na Pluggy (confirma saída de dinheiro)
2. Valida CNPJ na RFB (BrasilAPI)
3. Verifica se CNAE do fornecedor bate com serviço
   Ex: CNAE "Padaria" + Serviço "Elevador" = FRAUDE
4. Retorna: Relatório de Compliance
```

**Atual**:
- Não existe endpoint `/audit/expense`
- Não há validação de CNAE vs Serviço

#### C. Frontend - Aba de Despesas
**Status**: ❌ NÃO IMPLEMENTADO

**Requisito**:
- Duas abas no App:
  - ABA 1: RECEITAS (já existe)
  - ABA 2: DESPESAS (nova)
- Aba DESPESAS deve:
  - Listar saídas da conta (Pluggy)
  - Botão "Auditar Fornecedor" em cada saída
  - Admin digita CNPJ da nota fiscal
  - Sistema valida e mostra: ✅ LEGAL ou ❌ IRREGULAR

**Atual**:
- Só existe aba de receitas
- Não há interface para auditoria de despesas

#### D. Cache de Fornecedores
**Status**: ❌ NÃO IMPLEMENTADO

**Requisito**:
- Salvar fornecedores auditados
- Se validado uma vez, não validar novamente por 30 dias
- Tabela: `fornecedores_auditados`

**Atual**:
- Não há cache de fornecedores
- Toda validação seria nova

---

## 3️⃣ VALIDAÇÃO DE CNAE vs SERVIÇO (Regra de Ouro)

### Lógica de Negócio
**Objetivo**: Detectar fraude quando CNAE do fornecedor não bate com serviço prestado.

### Exemplos de Fraude
| CNAE Fornecedor | Serviço Pago | Resultado |
|-----------------|--------------|-----------|
| 1091-1/02 (Padaria) | Manutenção de Elevador | ❌ FRAUDE |
| 4321-5/00 (Eletricista) | Instalação Elétrica | ✅ OK |
| 8112-5/00 (Condomínio) | Taxa de Condomínio | ❌ SUSPEITO (auto-pagamento?) |

### Implementação Sugerida
```python
CNAE_MAPPING = {
    "4321": ["eletrica", "instalacao", "manutencao"],
    "4329": ["hidraulica", "encanamento", "agua"],
    "4330": ["pintura", "reforma"],
    "8112": ["limpeza", "seguranca", "portaria"],
    # ...
}

def validate_cnae_service(cnae: str, service_description: str) -> bool:
    keywords = CNAE_MAPPING.get(cnae[:4], [])
    return any(kw in service_description.lower() for kw in keywords)
```

---

## 4️⃣ BANCO DE DADOS

### Tabelas Existentes ✅
- `orcamento`
- `boletos_emitidos`
- `pagamentos`
- `fundo_reserva`
- `audit_log`
- `extratos_bancarios`
- `transacoes_bancarias`
- `comprovantes`
- `fila_reconciliacao`

### Tabelas Faltando ❌
- `condominio_contas_bancarias` (criada mas não aplicada)
- `fornecedores_auditados` (não criada)
- `auditorias_despesas` (não criada)

---

## 5️⃣ CHECKLIST DE IMPLEMENTAÇÃO

### Backend
- [ ] Criar `services/brasil_api_service.py`
- [ ] Migrar `rfb_validator.py` para usar BrasilAPI
- [ ] Criar endpoint `POST /audit/expense`
- [ ] Implementar validação CNAE vs Serviço
- [ ] Criar tabela `fornecedores_auditados`
- [ ] Criar tabela `auditorias_despesas`
- [ ] Implementar cache de fornecedores (30 dias)

### Frontend
- [ ] Criar aba "Despesas" no App
- [ ] Criar componente `ExpenseAudit.tsx`
- [ ] Listar transações de débito (Pluggy)
- [ ] Formulário de auditoria (CNPJ + Serviço)
- [ ] Exibir resultado da validação
- [ ] Dashboard de fornecedores auditados

### Testes
- [ ] Teste de validação BrasilAPI
- [ ] Teste de validação CNAE vs Serviço
- [ ] Teste de cache de fornecedores
- [ ] Teste de fluxo completo de auditoria

---

## 6️⃣ PRIORIZAÇÃO

### P0 - Crítico (Fazer AGORA)
1. Integração com BrasilAPI
2. Endpoint `/audit/expense`
3. Validação CNAE vs Serviço
4. Aba de Despesas no frontend

### P1 - Importante (Esta semana)
1. Cache de fornecedores
2. Tabelas de auditoria
3. Dashboard de despesas
4. Testes de validação

### P2 - Desejável (Backlog)
1. Relatórios de compliance
2. Alertas automáticos
3. Integração com contabilidade
4. Export de dados

---

## 7️⃣ FLUXO COMPLETO (End-to-End)

### Cenário: Auditoria de Pagamento a Fornecedor

```
1. Sistema detecta saída de R$ 5.000 (Pluggy)
2. Admin clica em "Auditar Fornecedor"
3. Admin informa:
   - CNPJ: 12.345.678/0001-99
   - Serviço: "Manutenção de Elevador"
4. Sistema valida:
   a) CNPJ existe na RFB? (BrasilAPI)
   b) Status cadastral = ATIVA?
   c) CNAE bate com serviço?
5. Resultado:
   ✅ APROVADO: Fornecedor legal, CNAE compatível
   ❌ REJEITADO: Empresa inativa
   ⚠️  ALERTA: CNAE incompatível (possível fraude)
6. Sistema salva auditoria no banco
7. Admin vê relatório de compliance
```

---

## 8️⃣ REFERÊNCIAS

### APIs Utilizadas
- **BrasilAPI**: https://brasilapi.com.br/docs
  - Endpoint CNPJ: `GET /cnpj/v1/{cnpj}`
  - Gratuita, sem autenticação
  - Rate limit: 3 req/s

- **Pluggy**: https://docs.pluggy.ai
  - Autenticação via API Key
  - Transações bancárias
  - Webhooks disponíveis

### Documentação Técnica
- FastAPI: https://fastapi.tiangolo.com
- React + TypeScript: https://react.dev
- Supabase: https://supabase.com/docs

---

**Última Atualização**: 2025-12-02  
**Status Geral**: 60% Implementado (Receitas OK, Despesas Pendente)
