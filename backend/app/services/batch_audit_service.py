"""
Batch Audit Service - Processamento em Lote com Rate Limiting
"""
import asyncio
from typing import List, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from app.services.cnpj_service import CNPJService
from app.services.cnpj.base import CNPJRateLimitError, CNPJAPIError

class BatchAuditRequest(BaseModel):
    """Request para auditoria em lote"""
    items: List[Dict[str, Any]]  # Lista de {cnpj, transaction_id, service_type}

class BatchAuditStatus(BaseModel):
    """Status do processamento em lote"""
    total: int
    processed: int
    pending: int
    results: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]

class BatchAuditService:
    """
    Serviço de auditoria em lote com rate limiting inteligente.
    Respeita limite de 3 req/min da API grátis.
    """
    
    def __init__(self):
        self.cnpj_service = CNPJService()
        self.results = []
        self.errors = []
    
    async def process_batch(
        self,
        items: List[Dict[str, Any]],
        progress_callback=None
    ) -> BatchAuditStatus:
        """
        Processa lista de CNPJs em lote.
        
        Args:
            items: Lista de dicts com {cnpj, transaction_id, service_type}
            progress_callback: Função para reportar progresso
        """
        total = len(items)
        processed = 0
        
        print(f"[Batch Audit] Iniciando processamento de {total} itens...")
        
        for i, item in enumerate(items):
            try:
                # Processar item
                result = await self._process_single_item(item)
                self.results.append(result)
                processed += 1
                
                # Reportar progresso
                if progress_callback:
                    progress_callback(processed, total)
                
                print(f"[Batch Audit] {processed}/{total} - {item.get('cnpj')} ✅")
                
                # Rate limiting: Aguardar entre requests (versão grátis)
                if not self.cnpj_service.provider.is_paid and i < total - 1:
                    wait_time = 20  # 20 segundos = 3 req/min
                    print(f"[Batch Audit] Aguardando {wait_time}s (rate limit)...")
                    await asyncio.sleep(wait_time)
                
            except CNPJRateLimitError as e:
                # Rate limit atingido - aguardar mais tempo
                print(f"[Batch Audit] Rate limit atingido! Aguardando 60s...")
                await asyncio.sleep(60)
                
                # Tentar novamente
                try:
                    result = await self._process_single_item(item)
                    self.results.append(result)
                    processed += 1
                except Exception as retry_error:
                    self.errors.append({
                        "item": item,
                        "error": str(retry_error)
                    })
                    
            except Exception as e:
                print(f"[Batch Audit] Erro ao processar {item.get('cnpj')}: {str(e)}")
                self.errors.append({
                    "item": item,
                    "error": str(e)
                })
        
        pending = total - processed
        
        return BatchAuditStatus(
            total=total,
            processed=processed,
            pending=pending,
            results=self.results,
            errors=self.errors
        )
    
    async def _process_single_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Processa um único item"""
        cnpj = item.get("cnpj")
        service_type = item.get("service_type", "")
        
        # Validar CNPJ
        supplier_data = await self.cnpj_service.validate_cnpj(cnpj)
        
        # Determinar risco
        risk_level = self.cnpj_service.get_risk_level(supplier_data)
        
        # Validar CNAE vs Serviço
        from app.services.robust_validator import RobustValidator
        validator = RobustValidator()
        
        cnae_valid, cnae_reason = validator.validate_cnae_service(
            cnae_principal=supplier_data.cnae_principal.codigo,
            cnaes_secundarios=[],  # TODO: Pegar CNAEs secundários da API
            service_type=service_type
        )
        
        # Determinar status final
        if risk_level == "CRITICAL_RISK":
            status = "REJECTED"
            reason = f"Empresa {supplier_data.status_receita}"
        elif cnae_valid == False:
            status = "CNAE_MISMATCH"
            reason = cnae_reason
        elif cnae_valid == None:
            status = "MANUAL_REVIEW"
            reason = cnae_reason
        else:
            status = "APPROVED"
            reason = "Fornecedor validado"
        
        return {
            "cnpj": cnpj,
            "razao_social": supplier_data.razao_social,
            "status_receita": supplier_data.status_receita,
            "cnae": supplier_data.cnae_principal.codigo,
            "risk_level": risk_level,
            "cnae_valid": cnae_valid,
            "status": status,
            "reason": reason,
            "cached": supplier_data.cached
        }
