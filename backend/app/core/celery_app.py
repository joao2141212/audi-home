from celery import Celery
import os
import redis
import logging

logger = logging.getLogger(__name__)

# Configuração do Broker (Redis)
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

# Verificar conexão com Redis
use_eager_mode = False
try:
    r = redis.from_url(CELERY_BROKER_URL, socket_timeout=1)
    r.ping()
except (redis.ConnectionError, ValueError):
    logger.warning("⚠️ [WARNING] Redis não detectado ou URL inválida.")
    logger.warning("⚠️ Rodando Celery em modo SÍNCRONO (task_always_eager = True).")
    logger.warning("⚠️ Isso bloqueará a API durante o processamento. Use apenas para testes.")
    use_eager_mode = True

celery_app = Celery(
    "audi_home_worker",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_always_eager=use_eager_mode, # Ativa modo síncrono se Redis falhar
    task_eager_propagates=True, # Erros sobem imediatamente
)

# Configuração de Rotas (opcional)
celery_app.conf.task_routes = {
    "app.tasks.audit_tasks.*": {"queue": "audit_queue"},
    "app.tasks.ocr_tasks.*": {"queue": "ocr_queue"},
}
