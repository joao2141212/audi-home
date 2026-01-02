"""
Audit Log Service - Rastro de Auditoria Imutável (Compliance)
Garante segurança jurídica registrando todas as alterações de status.
"""
from datetime import datetime
from typing import Optional, Dict, Any
from supabase import Client

class AuditLogService:
    def __init__(self, supabase: Client):
        self.supabase = supabase
        self.table = "audit_log_immutable"  # Tabela específica para logs imutáveis

    async def log_action(
        self,
        entity_type: str,  # "expense", "receipt", "reconciliation"
        entity_id: str,
        action: str,       # "APPROVE", "REJECT", "FLAG_FRAUD"
        actor_id: str,     # ID do usuário ou "SYSTEM"
        previous_state: Optional[Dict[str, Any]] = None,
        new_state: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Registra uma ação no log de auditoria.
        Este registro deve ser APPEND-ONLY no banco de dados.
        """
        log_entry = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "actor_id": actor_id,
            "previous_state": previous_state,
            "new_state": new_state,
            "metadata": metadata,
            "performed_at": datetime.now().isoformat(),
            "client_ip": metadata.get("ip") if metadata else None,
            "user_agent": metadata.get("user_agent") if metadata else None
        }

        try:
            # Em produção, esta tabela deve ter permissão DELETE/UPDATE revogada para todos
            self.supabase.table(self.table).insert(log_entry).execute()
            print(f"[AUDIT TRAIL] Ação registrada: {action} em {entity_type} {entity_id} por {actor_id}")
        except Exception as e:
            # Falha no log de auditoria é CRÍTICA. Devemos alertar.
            print(f"🚨 [CRITICAL] FALHA AO GRAVAR AUDIT LOG: {str(e)}")
            # Em um sistema real, isso poderia parar a operação ou enviar alerta para SRE
