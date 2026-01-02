from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from app.services.cnpj_service import CNPJService
from app.services.cnpj.base import CNPJNotFoundError, CNPJAPIError
from app.services.robust_validator import RobustValidator
from app.services.batch_audit_service import BatchAuditService, BatchAuditRequest
from app.services.pluggy_service import PluggyService
from supabase import create_client, Client
from app.core.config import get_settings
from datetime import datetime
from decimal import Decimal

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

class ExpenseAuditRequest(BaseModel):
    transaction_id_pluggy: str
    cnpj_fornecedor: str
    codigo_servico: str  # Ex: "Manutenção de Elevador"
    service_type: str  # Ex: "elevador", "limpeza", "seguranca"
    condominio_id: str

class ReceiptValidationRequest(BaseModel):
    """Request para validação de comprovante"""
    receipt_amount: float
    receipt_date: str  # YYYY-MM-DD
    payer_cpf: Optional[str] = None  # CPF do morador
    condominio_id: str

class ExpenseAuditResponse(BaseModel):
    status: str  # "APPROVED", "REJECTED", "CNAE_MISMATCH", "MANUAL_REVIEW"
    fornecedor: Dict[str, Any]
    validacao_cnae: Dict[str, Any]
    transacao: Optional[Dict[str, Any]] = None
    relatorio_compliance: str

@router.post("/expense", response_model=ExpenseAuditResponse)
async def audit_expense(
    request: ExpenseAuditRequest,
    supabase: Client = Depends(get_supabase)
):
    """
    Audita uma despesa (saída de dinheiro) com validação robusta.
    
    Fluxo:
    1. Busca transação na Pluggy
    2. Valida CNPJ na RFB (CNPJ.ws)
    3. Verifica CNAE vs Serviço (Regra de Ouro)
    4. Retorna status paranoico
    """
    
    # PASSO 1: Buscar transação na Pluggy
    try:
        account_result = supabase.table("condominio_contas_bancarias").select("*").eq(
            "condominio_id", request.condominio_id
        ).eq("ativo", True).execute()
        
        if not account_result.data:
            raise HTTPException(
                status_code=404,
                detail="Condomínio não possui conta bancária conectada"
            )
        
        account_data = account_result.data[0]
        pluggy_account_id = account_data["pluggy_account_id"]
        
        pluggy_service = PluggyService()
        transactions = await pluggy_service.get_transactions(pluggy_account_id)
        
        transaction = None
        for tx in transactions:
            if tx["id"] == request.transaction_id_pluggy:
                transaction = tx
                break
        
        if not transaction:
            raise HTTPException(
                status_code=404,
                detail=f"Transação {request.transaction_id_pluggy} não encontrada"
            )
        
        if transaction["amount"] > 0:
            raise HTTPException(
                status_code=400,
                detail="Transação é um crédito (entrada), não uma despesa"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar transação: {str(e)}")
    
    # PASSO 2: Validar CNPJ
    cnpj_service = CNPJService()
    validator = RobustValidator()
    
    try:
        fornecedor_data = await cnpj_service.validate_cnpj(request.cnpj_fornecedor)
        
        # Determinar nível de risco
        risk_level = cnpj_service.get_risk_level(fornecedor_data)
        
        # CRITICAL_RISK: Empresa baixada/nula
        if risk_level == "CRITICAL_RISK":
            return ExpenseAuditResponse(
                status="REJECTED",
                fornecedor=fornecedor_data.dict(),
                validacao_cnae={},
                transacao=transaction,
                relatorio_compliance=f"❌ REJEITADO: Empresa com situação cadastral '{fornecedor_data.status_receita}'. Pagamento NÃO RECOMENDADO."
            )
        
        # PASSO 3: Validar CNAE vs Serviço (REGRA DE OURO)
        cnae_valid, cnae_reason = validator.validate_cnae_service(
            cnae_principal=fornecedor_data.cnae_principal.codigo,
            cnaes_secundarios=[],  # TODO: API não retorna CNAEs secundários
            service_type=request.service_type
        )
        
        validacao_cnae = {
            "valid": cnae_valid,
            "reason": cnae_reason,
            "cnae_fornecedor": fornecedor_data.cnae_principal.codigo,
            "descricao_cnae": fornecedor_data.cnae_principal.descricao,
            "service_type": request.service_type
        }
        
        # Determinar status final
        if cnae_valid == False:
            # CNAE INCOMPATÍVEL - FRAUDE DETECTADA
            return ExpenseAuditResponse(
                status="CNAE_MISMATCH",
                fornecedor=fornecedor_data.dict(),
                validacao_cnae=validacao_cnae,
                transacao=transaction,
                relatorio_compliance=f"🚨 FRAUDE DETECTADA: {cnae_reason}. Pagamento BLOQUEADO."
            )
        
        elif cnae_valid == None:
            # CNAE NÃO MAPEADO - REVISÃO MANUAL
            return ExpenseAuditResponse(
                status="MANUAL_REVIEW",
                fornecedor=fornecedor_data.dict(),
                validacao_cnae=validacao_cnae,
                transacao=transaction,
                relatorio_compliance=f"⚠️ REVISÃO MANUAL NECESSÁRIA: {cnae_reason}"
            )
        
        elif risk_level == "WARNING":
            # Empresa suspensa/inapta
            return ExpenseAuditResponse(
                status="MANUAL_REVIEW",
                fornecedor=fornecedor_data.dict(),
                validacao_cnae=validacao_cnae,
                transacao=transaction,
                relatorio_compliance=f"⚠️ ATENÇÃO: Empresa com situação cadastral '{fornecedor_data.status_receita}'. CNAE válido mas requer atenção."
            )
        
        else:
            # TUDO OK
            return ExpenseAuditResponse(
                status="APPROVED",
                fornecedor=fornecedor_data.dict(),
                validacao_cnae=validacao_cnae,
                transacao=transaction,
                relatorio_compliance=f"✅ APROVADO: Fornecedor legal e CNAE compatível com serviço '{request.service_type}'."
            )
        
    except CNPJNotFoundError:
        return ExpenseAuditResponse(
            status="REJECTED",
            fornecedor={"error": "CNPJ não encontrado"},
            validacao_cnae={},
            transacao=transaction,
            relatorio_compliance="❌ CNPJ inválido ou não encontrado na Receita Federal"
        )
    except CNPJAPIError as e:
        return ExpenseAuditResponse(
            status="MANUAL_REVIEW",
            fornecedor={"error": str(e)},
            validacao_cnae={},
            transacao=transaction,
            relatorio_compliance=f"⚠️ AUDITORIA PENDENTE: Erro ao consultar CNPJ ({str(e)}). Tente novamente."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao validar CNPJ: {str(e)}")

@router.post("/validate-receipt")
async def validate_receipt(
    request: ReceiptValidationRequest,
    supabase: Client = Depends(get_supabase)
):
    """
    Valida um comprovante de pagamento com lógica robusta.
    
    Implementa:
    - Tolerância de valor (R$ 0,05)
    - Detecção de taxas de boleto
    - Validação de CPF do pagador
    - Detecção de ambiguidade
    """
    try:
        # Buscar conta do condomínio
        account_result = supabase.table("condominio_contas_bancarias").select("*").eq(
            "condominio_id", request.condominio_id
        ).eq("ativo", True).execute()
        
        if not account_result.data:
            raise HTTPException(status_code=404, detail="Conta não encontrada")
        
        account_data = account_result.data[0]
        pluggy_account_id = account_data["pluggy_account_id"]
        
        # Buscar transações
        pluggy_service = PluggyService()
        from datetime import datetime, timedelta
        receipt_date = datetime.strptime(request.receipt_date, "%Y-%m-%d").date()
        from_date = (receipt_date - timedelta(days=5)).strftime("%Y-%m-%d")
        
        transactions = await pluggy_service.get_transactions(pluggy_account_id, from_date=from_date)
        
        # Validar com lógica robusta
        validator = RobustValidator()
        result = validator.validate_payment(
            receipt_amount=Decimal(str(request.receipt_amount)),
            receipt_date=receipt_date,
            payer_cpf=request.payer_cpf,
            transactions=transactions
        )
        
        return {
            "status": result.status,
            "matches": [m.dict() for m in result.matches],
            "reason": result.reason,
            "requires_manual_review": result.requires_manual_review,
            "fraud_flags": result.fraud_flags
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from app.tasks.audit_tasks import process_batch_expenses

@router.post("/batch-expenses")
async def batch_audit_expenses(
    request: BatchAuditRequest,
    supabase: Client = Depends(get_supabase)
):
    """
    Enfileira auditoria em lote no Celery (Redis).
    Retorna ID da task para polling.
    """
    try:
        # Enfileirar task no Celery
        # TODO: Pegar ID do usuário real do token JWT
        admin_id = "admin_user_placeholder" 
        
        task = process_batch_expenses.delay(request.items, admin_id)
        
        return {
            "status": "queued",
            "task_id": task.id,
            "message": "Processamento iniciado em background (Celery). Acompanhe pelo ID da task."
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao enfileirar task: {str(e)}")

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """
    Retorna status da task do Celery.
    """
    from celery.result import AsyncResult
    from app.core.celery_app import celery_app
    
    task_result = AsyncResult(task_id, app=celery_app)
    
    response = {
        "task_id": task_id,
        "status": task_result.status,
        "result": task_result.result if task_result.ready() else None
    }
    
    return response

@router.get("/suppliers/{cnpj}")
async def get_supplier_info(cnpj: str):
    """Busca informações de um fornecedor pelo CNPJ"""
    cnpj_service = CNPJService()
    
    try:
        data = await cnpj_service.validate_cnpj(cnpj)
        return data.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
