from fastapi import APIRouter, HTTPException, Depends
from typing import List
from decimal import Decimal
from datetime import timedelta
from app.models.schemas import (
    ReconciliationQueueItem, 
    ReconciliationApproval, 
    ReconciliationRejection,
    TransactionMatch
)
from supabase import create_client, Client
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    try:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    except Exception:
        return None

@router.get("/queue", response_model=List[ReconciliationQueueItem])
async def get_reconciliation_queue(
    status: str = "pendente",
    supabase: Client = Depends(get_supabase)
):
    """
    Get the reconciliation queue.
    Returns receipts that need manual review.
    """
    if not supabase:
        print("⚠️ [Reconciliation] Demo Mode: Supabase offline, returning empty queue.")
        return []
    
    try:
        result = supabase.table("fila_reconciliacao").select(
            "*, comprovantes(*)"
        ).eq("status", status).order("prioridade", desc=True).execute()
        return result.data
    except Exception as e:
        print(f"⚠️ [Reconciliation] Error: {e}")
        return []

@router.get("/matches/{receipt_id}", response_model=List[TransactionMatch])
async def get_suggested_matches(
    receipt_id: str,
    supabase: Client = Depends(get_supabase)
):
    """
    Get suggested transaction matches for a receipt.
    Uses fuzzy matching on valor and data.
    """
    # Get receipt with OCR data
    receipt_result = supabase.table("comprovantes").select("*").eq("id", receipt_id).execute()
    if not receipt_result.data:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    receipt = receipt_result.data[0]
    
    # If no OCR data, can't match
    if not receipt['ocr_processado'] or not receipt['ocr_valor']:
        return []
    
    ocr_valor = Decimal(str(receipt['ocr_valor']))
    ocr_data = receipt['ocr_data']
    ocr_nsu = receipt['ocr_nsu']
    
    # Find potential matches
    matches = []
    
    # Strategy 1: Exact NSU match (highest confidence)
    if ocr_nsu:
        nsu_matches = supabase.table("transacoes_bancarias").select("*").eq(
            "nsu", ocr_nsu
        ).eq("status_reconciliacao", "pendente").execute()
        
        for txn in nsu_matches.data:
            matches.append(TransactionMatch(
                transacao_id=txn['id'],
                data_transacao=txn['data_transacao'],
                valor=Decimal(str(txn['valor'])),
                descricao=txn['descricao'],
                nsu=txn['nsu'],
                match_score=Decimal('95'),
                match_reasons=["nsu_exato"]
            ))
    
    # Strategy 2: Valor exato + data próxima (±3 dias)
    if ocr_data:
        date_range_start = (ocr_data - timedelta(days=3)).isoformat()
        date_range_end = (ocr_data + timedelta(days=3)).isoformat()
        
        valor_tolerance = ocr_valor * Decimal('0.01')  # 1% tolerance
        valor_min = float(ocr_valor - valor_tolerance)
        valor_max = float(ocr_valor + valor_tolerance)
        
        # Supabase doesn't support range queries easily, so we fetch and filter
        date_matches = supabase.table("transacoes_bancarias").select("*").gte(
            "data_transacao", date_range_start
        ).lte("data_transacao", date_range_end).eq("status_reconciliacao", "pendente").execute()
        
        for txn in date_matches.data:
            txn_valor = Decimal(str(txn['valor']))
            if valor_min <= float(txn_valor) <= valor_max:
                # Calculate match score
                valor_diff = abs(txn_valor - ocr_valor)
                date_diff = abs((txn['data_transacao'] - ocr_data).days) if ocr_data else 999
                
                score = Decimal('80')
                if valor_diff == 0:
                    score += Decimal('15')
                if date_diff == 0:
                    score += Decimal('5')
                
                reasons = []
                if valor_diff < ocr_valor * Decimal('0.01'):
                    reasons.append("valor_exato")
                if date_diff <= 1:
                    reasons.append("data_proxima")
                
                # Avoid duplicates
                if not any(m.transacao_id == txn['id'] for m in matches):
                    matches.append(TransactionMatch(
                        transacao_id=txn['id'],
                        data_transacao=txn['data_transacao'],
                        valor=txn_valor,
                        descricao=txn['descricao'],
                        nsu=txn['nsu'],
                        match_score=score,
                        match_reasons=reasons
                    ))
    
    # Sort by score descending
    matches.sort(key=lambda m: m.match_score, reverse=True)
    
    # If multiple high-confidence matches, add to queue as "multiplos_matches"
    if len(matches) > 1 and matches[0].match_score > 80:
        # Check if already in queue
        queue_check = supabase.table("fila_reconciliacao").select("id").eq(
            "comprovante_id", receipt_id
        ).execute()
        
        if not queue_check.data:
            supabase.table("fila_reconciliacao").insert({
                "comprovante_id": receipt_id,
                "tipo": "multiplos_matches",
                "prioridade": 5,
                "matches_sugeridos": [m.model_dump() for m in matches],
                "status": "pendente"
            }).execute()
    
    return matches

@router.post("/approve")
async def approve_reconciliation(
    approval: ReconciliationApproval,
    supabase: Client = Depends(get_supabase)
):
    """
    Approve a reconciliation match.
    Links the receipt to the transaction.
    """
    # Update receipt
    supabase.table("comprovantes").update({
        "status": "aprovado",
        "transacao_id": approval.transacao_id,
        "motivo_decisao": approval.motivo_decisao
    }).eq("id", approval.comprovante_id).execute()
    
    # Update transaction
    supabase.table("transacoes_bancarias").update({
        "status_reconciliacao": "reconciliado",
        "comprovante_id": approval.comprovante_id
    }).eq("id", approval.transacao_id).execute()
    
    # Mark queue item as complete
    supabase.table("fila_reconciliacao").update({
        "status": "concluido"
    }).eq("comprovante_id", approval.comprovante_id).execute()
    
    return {"status": "approved"}

@router.post("/reject")
async def reject_receipt(
    rejection: ReconciliationRejection,
    supabase: Client = Depends(get_supabase)
):
    """
    Reject a receipt.
    Marks it as rejected with a reason.
    """
    supabase.table("comprovantes").update({
        "status": "rejeitado",
        "motivo_decisao": rejection.motivo_decisao
    }).eq("id", rejection.comprovante_id).execute()
    
    # Mark queue item as complete
    supabase.table("fila_reconciliacao").update({
        "status": "concluido"
    }).eq("comprovante_id", rejection.comprovante_id).execute()
    
    return {"status": "rejected"}
