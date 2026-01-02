# 🧪 Scripts de Validação

Estes scripts testam cada componente do sistema **ISOLADAMENTE**, sem precisar do Supabase configurado.

## 📋 Pré-requisitos

```bash
# Instalar dependências Python
cd backend
python3 -m pip install httpx pillow

# OU se usar uv
uv pip install httpx pillow
```

## 🚀 Como Executar

### Opção 1: Executar Todos os Testes

```bash
python3 tests/validation/run_all_tests.py
```

### Opção 2: Executar Testes Individuais

```bash
# Teste de Detecção de Fraude
python3 tests/validation/test_fraud_detection.py

# Teste de OCR
python3 tests/validation/test_ocr.py

# Teste de Pluggy API
python3 tests/validation/test_pluggy.py
```

## 📊 O Que Cada Teste Valida

### 1. `test_fraud_detection.py`
✅ Análise de metadados de PDF  
✅ Detecção de duplicatas  
✅ Validação de código de barras  
✅ Cálculo de fraud score  

**Não precisa de**: Supabase, Pluggy

### 2. `test_ocr.py`
✅ Processamento OCR (modo mock)  
✅ Extração de valor, data, NSU  
✅ Validação de código de barras  

**Não precisa de**: Supabase, Pluggy, Tesseract (usa mock)

### 3. `test_pluggy.py`
✅ Autenticação com Pluggy API  
✅ Criação de Connect Token  
✅ Listagem de bancos disponíveis  

**Precisa de**: Credenciais Pluggy válidas (em `credenciais.md`)  
**Não precisa de**: Supabase

## 🔧 Configuração de Credenciais

1. Abra `credenciais.md`
2. Preencha as credenciais:
   ```
   PLUGGY_CLIENT_ID=seu-client-id
   PLUGGY_CLIENT_SECRET=seu-client-secret
   ```
3. Execute os testes

## ✅ Resultado Esperado

```
======================================================================
                     RELATÓRIO FINAL
======================================================================
Fraud Detection......................................... ✅ PASSOU
OCR Service............................................ ✅ PASSOU
Pluggy API............................................. ✅ PASSOU
======================================================================
Total: 3/3 testes passaram
======================================================================

🎉 TODOS OS TESTES PASSARAM!
```

## ❌ Se Algum Teste Falhar

### Erro: `ModuleNotFoundError: No module named 'httpx'`
**Solução**: `python3 -m pip install httpx`

### Erro: `Pluggy authentication failed`
**Solução**: Verificar credenciais em `credenciais.md`

### Erro: `ImportError: cannot import name 'FraudDetector'`
**Solução**: Verificar se está executando do diretório raiz do projeto

## 📝 Próximos Passos (Após Validação)

1. ✅ Todos os testes passaram
2. ⬜ Configurar Supabase (`.env`)
3. ⬜ Executar migrations do banco
4. ⬜ Testar integração completa
5. ⬜ Iniciar backend e frontend

## 🐛 Debug

Para ver mais detalhes de erro, execute com `-v`:

```bash
python3 -v tests/validation/test_pluggy.py
```

Ou adicione prints no código dos testes.
