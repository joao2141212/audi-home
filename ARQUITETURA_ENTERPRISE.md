# 🏗️ ARQUITETURA ENTERPRISE (Celery + Redis)

**Data**: 2025-12-02 14:40  
**Status**: ✅ IMPLEMENTADO

---

## 🎯 MUDANÇA DE PARADIGMA

Migramos de uma fila baseada em banco (polling) para uma arquitetura de mensageria real com **Redis** e **Celery**.

**Motivo**: Fila em banco causa locking e gargalo de I/O em escala (10k clientes). Redis é in-memory, non-blocking e feito para isso.

---

## 🧱 COMPONENTES

### 1. Docker Compose (`docker-compose.yml`)
Orquestra os serviços:
- **Backend API**: FastAPI (Porta 8000)
- **Worker**: Celery Worker (Processamento)
- **Redis**: Broker de Mensageria (Porta 6379)

### 2. Celery App (`backend/app/core/celery_app.py`)
Configuração central:
- Broker: `redis://redis:6379/0`
- Backend: `redis://redis:6379/0`
- Serialização: JSON
- Timezone: America/Sao_Paulo

### 3. Tasks (`backend/app/tasks/audit_tasks.py`)
Lógica de negócio movida para background:
- `audit.process_batch_expenses`: Processa lote de CNPJs.
- **Retry Policy**: Exponencial (1s, 2s, 4s...) até 10 min.
- **Audit Log**: Integração nativa com `AuditLogService`.

### 4. API Endpoints
- `POST /batch-expenses`: Enfileira task e retorna `task_id`.
- `GET /tasks/{task_id}`: Polling de status (PENDING, STARTED, SUCCESS, FAILURE).

---

## 🚀 COMO RODAR

### Com Docker (Recomendado)
```bash
docker-compose up --build
```
Isso sobe Backend, Worker e Redis automaticamente.

### Manualmente (Dev)
1. **Subir Redis**:
   ```bash
   docker run -p 6379:6379 redis:7-alpine
   ```

2. **Iniciar Worker**:
   ```bash
   cd backend
   celery -A app.core.celery_app worker --loglevel=info
   ```

3. **Iniciar Backend**:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

---

## 🛡️ RESILIÊNCIA

1. **Retry Exponencial**: Se a API da Pluggy/CNPJ.ws falhar, o Celery tenta de novo com backoff inteligente.
2. **Dead Letter Queue**: Após 5 tentativas, a falha é logada e a task morre (evita loop infinito).
3. **Rate Limiting**: Celery pode ser configurado para respeitar limites de API (ex: 10/min).

---

## ⚡ PERFORMANCE

- **Índices SQL**: Adicionados índices compostos em `transactions` (Data + Valor) para busca instantânea.
- **Async I/O**: Backend libera a request em milissegundos, Worker processa pesado.

**Status**: PRONTO PARA ESCALA MASSIVA (10k Condomínios) 🚀
