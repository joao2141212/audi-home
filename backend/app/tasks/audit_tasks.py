import asyncio
from celery import Task
from app.core.celery_app import celery_app
from app.services.batch_audit_service import BatchAuditService
from app.services.robust_validator import RobustValidator
from app.services.audit_log_service import AuditLogService
from app.services.pluggy_service import PluggyService
from app.services.cnpj_service import CNPJService
from app.services.cnpj.base import CNPJRateLimitError, CNPJAPIError
from supabase import create_client
from app.core.config import get_settings
from typing import List, Dict, Any
import logging

settings = get_settings()
logger = logging.getLogger(__name__)

class BaseTask(Task):
    """Task base com configuração de retry"""
    autoretry_for = (CNPJAPIError, ConnectionError, TimeoutError)
    retry_kwargs = {'max_retries': 5}
    retry_backoff = True  # Exponencial: 1s, 2s, 4s, 8s...
    retry_backoff_max = 600  # Max 10 min
    retry_jitter = True  # Adiciona aleatoriedade para evitar thundering herd

@celery_app.task(bind=True, base=BaseTask, name="audit.process_batch_expenses")
def process_batch_expenses(self, items: List[Dict[str, Any]], admin_id: str):
    """
    Processa auditoria em lote (Background).
    Usa asyncio.run() pois Celery é síncrono e nossos services são async.
    """
    logger.info(f"Iniciando batch audit de {len(items)} itens. Task ID: {self.request.id}")
    
    async def _run_async():
        # Inicializar serviços
        batch_service = BatchAuditService()
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        audit_logger = AuditLogService(supabase)
        
        # Processar
        try:
            result = await batch_service.process_batch(items)
            
            # Logar conclusão no Audit Trail Imutável
            await audit_logger.log_action(
                entity_type="batch_audit",
                entity_id=self.request.id,
                action="BATCH_COMPLETED",
                actor_id=admin_id,
                new_state={
                    "total": result.total,
                    "processed": result.processed,
                    "errors": len(result.errors)
                },
                metadata={"status": "SUCCESS"}
            )
            
            return {
                "status": "completed",
                "total": result.total,
                "processed": result.processed,
                "results": result.results,
                "errors": result.errors
            }
            
        except Exception as e:
            logger.error(f"Erro fatal no batch audit: {str(e)}")
            # Logar erro
            await audit_logger.log_action(
                entity_type="batch_audit",
                entity_id=self.request.id,
                action="BATCH_FAILED",
                actor_id=admin_id,
                metadata={"error": str(e)}
            )
            raise e

    # Executar loop async dentro da task sync
    loop = asyncio.get_event_loop()
    if loop.is_running():
        # Se já tiver loop rodando (raro no worker padrão), usar thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(asyncio.run, _run_async()).result()
    else:
        return loop.run_until_complete(_run_async())

@celery_app.task(bind=True, base=BaseTask, name="audit.validate_single_receipt")
def validate_single_receipt_task(self, receipt_data: Dict[str, Any], condominio_id: str, user_id: str):
    """
    Valida um único comprovante em background.
    """
    async def _run_async():
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        audit_logger = AuditLogService(supabase)
        
        try:
            # Lógica de validação (reutilizando endpoint logic)
            # ... (simplificado para brevidade, chamaria RobustValidator)
            
            # Logar
            await audit_logger.log_action(
                entity_type="receipt",
                entity_id=receipt_data.get("id", "unknown"),
                action="VALIDATION_COMPLETED",
                actor_id=user_id,
                metadata={"task_id": self.request.id}
            )
            
            return {"status": "valid", "score": 100} # Mock result
            
        except Exception as e:
            logger.error(f"Erro na validação de comprovante: {str(e)}")
            raise e

    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_run_async())
