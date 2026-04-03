from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import List, Dict
from datetime import date, timedelta
from app.models.schemas import BankStatementResponse, BankTransactionResponse
from app.services.open_finance import OpenFinanceService
from supabase import create_client, Client
from app.core.config import get_settings
import hashlib

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@router.post("/connect")
async def connect_bank_account(
    user_id: str,
    provider: str = "pluggy",
    supabase: Client = Depends(get_supabase)
):
    """
    Initiate Open Finance connection.
    Returns a widget URL for the user to authenticate with their bank.
    """
    try:
        of_service = OpenFinanceService(provider=provider)
        connection_data = await of_service.create_bank_connection(user_id)
        
        return {
            "widget_url": connection_data['widget_url'],
            "access_token": connection_data['access_token'],
            "provider": provider
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create connection: {str(e)}")

@router.post("/sync/{account_id}")
async def sync_transactions(
    account_id: str,
    days_back: int = 30,
    background_tasks: BackgroundTasks = None,
    supabase: Client = Depends(get_supabase)
):
    """
    Sync transactions from Open Finance provider.
    This can be called manually or scheduled to run periodically.
    """
    try:
        of_service = OpenFinanceService(provider="pluggy")
        
        # Fetch transactions
        transactions = await of_service.sync_transactions(account_id, days_back)
        
        if not transactions:
            return {"message": "No new transactions", "count": 0}
        
        # Create or get extrato record
        extrato_hash = hashlib.sha256(f"open_finance_{account_id}_{date.today()}".encode()).hexdigest()
        
        # Check if already synced today
        existing = supabase.table("extratos_bancarios").select("id").eq("arquivo_hash", extrato_hash).execute()
        
        if existing.data:
            extrato_id = existing.data[0]['id']
        else:
            # Create new extrato
            extrato_data = {
                "arquivo_nome": f"Open Finance Sync - {date.today()}",
                "arquivo_hash": extrato_hash,
                "periodo_inicio": (date.today() - timedelta(days=days_back)).isoformat(),
                "periodo_fim": date.today().isoformat(),
                "fonte": "open_finance"
            }
            result = supabase.table("extratos_bancarios").insert(extrato_data).execute()
            extrato_id = result.data[0]['id']
        
        # Insert transactions
        inserted_count = 0
        for txn in transactions:
            txn['extrato_id'] = extrato_id
            txn['data_transacao'] = txn['data_transacao'].isoformat()
            txn['valor'] = float(txn['valor'])
            
            # Check if transaction already exists (by provider ID or NSU)
            existing_txn = None
            if txn.get('nsu'):
                existing_txn = supabase.table("transacoes_bancarias").select("id").eq(
                    "nsu", txn['nsu']
                ).eq("extrato_id", extrato_id).execute()
            
            if not existing_txn or not existing_txn.data:
                supabase.table("transacoes_bancarias").insert(txn).execute()
                inserted_count += 1
        
        # Run auto-reconciliation in background
        if background_tasks:
            background_tasks.add_task(auto_reconcile_transactions, extrato_id, supabase)
        
        return {
            "message": "Transactions synced successfully",
            "total_fetched": len(transactions),
            "inserted": inserted_count,
            "extrato_id": extrato_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@router.get("/balance/{account_id}")
async def get_balance(account_id: str):
    """Get real-time balance from the bank"""
    try:
        of_service = OpenFinanceService(provider="pluggy")
        balance = await of_service.get_real_time_balance(account_id)
        
        return {
            "account_id": account_id,
            "balance": float(balance),
            "currency": "BRL",
            "timestamp": date.today().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get balance: {str(e)}")

async def auto_reconcile_transactions(extrato_id: str, supabase: Client):
    """
    Background task to auto-reconcile transactions.
    Matches bank transactions with pending receipts.
    """
    # Get all pending transactions from this extrato
    transactions = supabase.table("transacoes_bancarias").select("*").eq(
        "extrato_id", extrato_id
    ).eq("status_reconciliacao", "pendente").execute()
    
    # Get all pending receipts with OCR data
    receipts = supabase.table("comprovantes").select("*").eq(
        "status", "pendente"
    ).eq("ocr_processado", True).execute()
    
    for txn in transactions.data:
        for receipt in receipts.data:
            # Try to match
            if await is_match(txn, receipt):
                # Auto-approve if high confidence
                supabase.table("comprovantes").update({
                    "status": "aprovado",
                    "transacao_id": txn['id'],
                    "motivo_decisao": "Auto-reconciliado via Open Finance"
                }).eq("id", receipt['id']).execute()
                
                supabase.table("transacoes_bancarias").update({
                    "status_reconciliacao": "reconciliado",
                    "comprovante_id": receipt['id']
                }).eq("id", txn['id']).execute()
                
                break

async def is_match(txn: Dict, receipt: Dict) -> bool:
    """Check if transaction matches receipt"""
    from decimal import Decimal
    
    # Exact NSU match
    if txn.get('nsu') and receipt.get('ocr_nsu'):
        if txn['nsu'] == receipt['ocr_nsu']:
            return True
    
    # Value + date match
    if receipt.get('ocr_valor') and receipt.get('ocr_data'):
        txn_valor = Decimal(str(txn['valor']))
        receipt_valor = Decimal(str(receipt['ocr_valor']))
        
        # 1% tolerance
        if abs(txn_valor - receipt_valor) <= txn_valor * Decimal('0.01'):
            # Date within 3 days
            from datetime import datetime
            txn_date = datetime.fromisoformat(txn['data_transacao']).date()
            receipt_date = datetime.fromisoformat(receipt['ocr_data']).date()
            
            if abs((txn_date - receipt_date).days) <= 3:
                return True
    
    return False
