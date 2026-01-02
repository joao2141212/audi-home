# 🚀 GUIA RÁPIDO: Validação do Sistema

## ⚡ Execução Rápida (TL;DR)

```bash
# 1. Instalar dependências
python3 -m pip install httpx pillow

# 2. Executar todos os testes
python3 tests/validation/run_all_tests.py
```

## 📋 Passo a Passo Detalhado

### 1️⃣ Instalar Dependências

```bash
cd backend
python3 -m pip install httpx pillow
```

**Ou com uv** (se tiver):
```bash
uv pip install httpx pillow
```

### 2️⃣ Configurar Credenciais (Opcional para alguns testes)

Edite `credenciais.md` e preencha:
```
PLUGGY_CLIENT_ID=8ee661fe-855d-40ee-994c-2988f42941b0
PLUGGY_CLIENT_SECRET=be675088-9dc2-4a9f-b122-892bfc7fffb4
```

### 3️⃣ Executar Validação

```bash
# Do diretório raiz do projeto
python3 tests/validation/run_all_tests.py
```

## ✅ Resultado Esperado

```
======================================================================
                     RELATÓRIO FINAL
======================================================================
Fraud Detection......................................... ✅ PASSOU
OCR Service............................................ ✅ PASSOU
Pluggy API............................................. ✅ PASSOU
Complete Flow (Mock)................................... ✅ PASSOU
======================================================================
Total: 4/4 testes passaram
======================================================================

🎉 TODOS OS TESTES PASSARAM!

📝 Próximos passos:
   1. Configurar credenciais Supabase no .env
   2. Executar migrations do banco de dados
   3. Testar integração completa com Supabase
   4. Iniciar backend: cd backend && uvicorn app.main:app --reload
   5. Iniciar frontend: cd frontend && npm run dev
```

## 🧪 Testes Individuais

Se quiser executar apenas um teste específico:

```bash
# Apenas Fraud Detection
python3 tests/validation/test_fraud_detection.py

# Apenas OCR
python3 tests/validation/test_ocr.py

# Apenas Pluggy
python3 tests/validation/test_pluggy.py

# Apenas Fluxo Completo
python3 tests/validation/test_complete_flow.py
```

## ❌ Troubleshooting

### Erro: `ModuleNotFoundError: No module named 'httpx'`
```bash
python3 -m pip install httpx
```

### Erro: `ModuleNotFoundError: No module named 'app'`
Certifique-se de estar executando do diretório raiz:
```bash
cd /Users/pedroduarte/Desktop/audi\ home
python3 tests/validation/run_all_tests.py
```

### Erro: `Pluggy authentication failed`
Verifique as credenciais em `credenciais.md`

## 📊 O Que Cada Teste Valida

| Teste | Valida | Precisa de |
|-------|--------|------------|
| **Fraud Detection** | Metadados, duplicatas, barcode | Nada |
| **OCR Service** | Extração de dados (mock) | Nada |
| **Pluggy API** | Autenticação, connect token | Credenciais Pluggy |
| **Complete Flow** | Fluxo end-to-end (mock) | Nada |

## 🎯 Após Validação

1. ✅ Todos os testes passaram
2. ⬜ Configurar `.env` com Supabase
3. ⬜ Executar migration: `004_condominio_contas_bancarias.sql`
4. ⬜ Iniciar backend: `uvicorn app.main:app --reload`
5. ⬜ Iniciar frontend: `npm run dev`
6. ⬜ Testar integração completa

## 📝 Notas Importantes

- ✅ Estes testes **NÃO precisam** de Supabase configurado
- ✅ Estes testes **NÃO precisam** de banco de dados
- ✅ Estes testes usam **mocks** e **dados em memória**
- ✅ Validam a **lógica de negócio** isoladamente
- ⚠️  Após passar aqui, ainda precisa testar com Supabase real
