"""
Background Worker - Processamento Assíncrono (DB-Backed Queue)
Substitui o Celery para ambientes onde Redis não está disponível.
Consome jobs da tabela 'background_jobs'.
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any
from supabase import create_client, Client

# Adicionar path do backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))

from app.core.config import get_settings
from app.services.batch_audit_service import BatchAuditService

settings = get_settings()

class BackgroundWorker:
    def __init__(self):
        self.supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        self.is_running = True
        self.batch_service = BatchAuditService()

    async def start(self):
        print("🚀 Background Worker Iniciado...")
        print("   Aguardando jobs na tabela 'background_jobs'...")
        
        while self.is_running:
            try:
                # Buscar job pendente (simulando lock com update atômico se possível, ou select for update)
                # No Supabase via API, fazemos fetch e depois update status.
                # Para evitar race condition real, idealmente seria uma procedure, mas aqui faremos otimista.
                
                response = self.supabase.table("background_jobs")\
                    .select("*")\
                    .eq("status", "PENDING")\
                    .order("created_at")\
                    .limit(1)\
                    .execute()
                
                jobs = response.data
                
                if jobs:
                    job = jobs[0]
                    await self.process_job(job)
                else:
                    # Sem jobs, dormir um pouco
                    await asyncio.sleep(5)
                    
            except Exception as e:
                print(f"❌ Erro no loop do worker: {str(e)}")
                await asyncio.sleep(5)

    async def process_job(self, job: Dict[str, Any]):
        job_id = job["id"]
        job_type = job["job_type"]
        payload = job["payload"]
        
        print(f"🔄 Processando Job {job_id} ({job_type})...")
        
        # Marcar como PROCESSING
        self.supabase.table("background_jobs").update({
            "status": "PROCESSING",
            "locked_at": datetime.now().isoformat()
        }).eq("id", job_id).execute()
        
        try:
            if job_type == "batch_audit_expense":
                await self.handle_batch_audit(payload)
            else:
                raise ValueError(f"Tipo de job desconhecido: {job_type}")
            
            # Marcar como COMPLETED
            self.supabase.table("background_jobs").update({
                "status": "COMPLETED",
                "processed_at": datetime.now().isoformat()
            }).eq("id", job_id).execute()
            
            print(f"✅ Job {job_id} concluído com sucesso!")
            
        except Exception as e:
            print(f"❌ Falha no Job {job_id}: {str(e)}")
            
            # Marcar como FAILED
            self.supabase.table("background_jobs").update({
                "status": "FAILED",
                "last_error": str(e),
                "processed_at": datetime.now().isoformat()
            }).eq("id", job_id).execute()

    async def handle_batch_audit(self, payload: Dict[str, Any]):
        """Processa auditoria em lote"""
        items = payload.get("items", [])
        
        # Usar o serviço existente, mas agora rodando no worker
        # O callback de progresso poderia atualizar o banco, mas vamos simplificar
        result = await self.batch_service.process_batch(items)
        
        # Salvar resultados (aqui poderíamos salvar em outra tabela ou notificar admin)
        # Por enquanto, apenas logamos
        print(f"   Batch processado: {result.processed} ok, {len(result.errors)} erros")

if __name__ == "__main__":
    worker = BackgroundWorker()
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        print("\n🛑 Worker parando...")
