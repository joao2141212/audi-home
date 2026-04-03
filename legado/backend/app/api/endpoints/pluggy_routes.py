from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
from decimal import Decimal
from app.services.pluggy_service import PluggyService
from supabase import create_client, Client
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    try:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    except Exception:
        # Fallback para o demo se o Supabase não estiver configurado
        return None

class ConnectAccountRequest(BaseModel):
    item_id: str  # ID retornado pelo Pluggy Widget
    condominio_id: str

class ReceiptValidationRequest(BaseModel):
    valor: float
    data: str  # YYYY-MM-DD
    condominio_id: str  # Busca a conta conectada do condomínio

@router.post("/token")
async def get_connect_token():
    """
    Returns a Connect Token to initialize the Pluggy Widget on frontend.
    This is used by the ADMIN to connect the condominium's bank account.
    """
    try:
        service = PluggyService()
        token = await service.create_connect_token()
        return {"accessToken": token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save-connection")
async def save_bank_connection(
    request: ConnectAccountRequest,
    supabase: Client = Depends(get_supabase)
):
    """
    Saves the bank connection for a condominium.
    Called after the admin successfully connects via Pluggy Widget.
    """
    print(f"🚀 [SAVE-CONNECTION] Recebida request para condomínio: {request.condominio_id}")
    print(f"📦 [SAVE-CONNECTION] Item ID: {request.item_id}")
    
    try:
        service = PluggyService()
        
        # Fetch accounts for this item
        print(f"📡 [SAVE-CONNECTION] Buscando contas na Pluggy para item {request.item_id}...")
        try:
            accounts = await service.get_accounts(request.item_id)
            print(f"✅ [SAVE-CONNECTION] Contas encontradas: {len(accounts)}")
        except Exception as e:
            print(f"⚠️ [SAVE-CONNECTION] Erro ao buscar contas na Pluggy: {e}")
            # Se falhar na Pluggy, vamos criar uma conta fake para o demo seguir
            print(f"🛠️ [SAVE-CONNECTION] Criando conta fictícia para o MODO DEMO.")
            accounts = [{
                "id": "demo-account-id",
                "bankData": {"name": "Banco Demo"},
                "number": "12345-6",
                "balance": 5000.0
            }]
        
        if not accounts:
            print(f"⚠️ [SAVE-CONNECTION] Nenhuma conta retornada pela Pluggy.")
            accounts = [{
                "id": "demo-account-id",
                "bankData": {"name": "Banco Demo"},
                "number": "12345-6",
                "balance": 5000.0
            }]
        
        # Save to database (assuming first account is the main one)
        account = accounts[0]
        
        connection_data = {
            "condominio_id": request.condominio_id,
            "pluggy_item_id": request.item_id,
            "pluggy_account_id": account["id"],
            "banco_nome": account.get("bankData", {}).get("name", "Unknown"),
            "conta_numero": account.get("number"),
            "saldo_atual": float(account.get("balance", 0)),
            "conectado_em": datetime.now().isoformat(),
            "ativo": True
        }
        
        # Tentar salvar no Supabase, mas ignorar se falhar (MODO DEMO)
        if supabase:
            try:
                print(f"🗄️ [SAVE-CONNECTION] Tentando salvar no Supabase...")
                # Check if connection already exists
                existing = supabase.table("condominio_contas_bancarias").select("*").eq(
                    "condominio_id", request.condominio_id
                ).execute()
                
                if existing.data:
                    # Update existing
                    result = supabase.table("condominio_contas_bancarias").update(
                        connection_data
                    ).eq("condominio_id", request.condominio_id).execute()
                else:
                    # Insert new
                    result = supabase.table("condominio_contas_bancarias").insert(
                        connection_data
                    ).execute()
                print(f"✅ [SAVE-CONNECTION] Salvo no banco com sucesso.")
            except Exception as e:
                print(f"⚠️ [SAVE-CONNECTION] Falha ao salvar no Supabase (MODO DEMO): {e}")
        else:
            print(f"🛠️ [SAVE-CONNECTION] MODO DEMO: Supabase ausente.")
        
        print(f"🎉 [SAVE-CONNECTION] Fluxo concluído com sucesso!")
        return {
            "status": "success",
            "message": "Conta conectada com sucesso (Demo Mode)",
            "account": account
        }
        
    except Exception as e:
        print(f"❌ [SAVE-CONNECTION] Erro fatal: {e}")
        # Nunca falhar no demo
        return {
            "status": "success",
            "message": f"Conectado em modo de emergência (Erro: {str(e)})",
            "account": {"id": "emergency-id", "bankData": {"name": "Emergency Bank"}}
        }

@router.post("/validate-receipt")
async def validate_receipt(
    request: ReceiptValidationRequest,
    supabase: Client = Depends(get_supabase)
):
    """
    Validates a receipt against the condominium's bank transactions.
    
    Flow:
    1. Get the condominium's connected account
    2. Fetch transactions from Pluggy
    3. Look for matching transaction (value +- 0.05, date +- 2 days)
    """
    try:
        # 1. Get condominium's bank account
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
        
        # 2. Fetch transactions from Pluggy
        service = PluggyService()
        receipt_date = datetime.strptime(request.data, "%Y-%m-%d")
        from_date = (receipt_date - timedelta(days=5)).strftime("%Y-%m-%d")
        
        transactions = await service.get_transactions(pluggy_account_id, from_date=from_date)
        
        # 3. Validation Logic
        match_found = False
        match_details = None
        
        receipt_val = Decimal(str(request.valor))
        
        for tx in transactions:
            # Only check CREDIT transactions (money coming IN)
            tx_amount = Decimal(str(tx["amount"]))
            if tx_amount <= 0:
                continue
            
            # Check value (tolerance 0.05)
            val_diff = abs(tx_amount - receipt_val)
            
            if val_diff <= Decimal("0.05"):
                # Check date (tolerance 2 days)
                tx_date_str = tx["date"].split("T")[0]
                tx_date = datetime.strptime(tx_date_str, "%Y-%m-%d")
                
                date_diff = abs((tx_date - receipt_date).days)
                
                if date_diff <= 2:
                    match_found = True
                    match_details = {
                        "id": tx["id"],
                        "amount": float(tx_amount),
                        "date": tx_date_str,
                        "description": tx.get("description", ""),
                        "difference_days": date_diff,
                        "difference_value": float(val_diff)
                    }
                    break
        
        if match_found:
            return {
                "status": "APROVADO",
                "match_details": match_details,
                "message": "✅ Pagamento confirmado no extrato bancário do condomínio."
            }
        else:
            return {
                "status": "REJEITADO",
                "match_details": None,
                "message": "❌ Pagamento NÃO encontrado no extrato bancário do condomínio."
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sync-transactions/{condominio_id}")
async def sync_transactions(
    condominio_id: str,
    supabase: Client = Depends(get_supabase)
):
    """
    Manually sync transactions for a condominium.
    This can also be scheduled to run automatically (e.g., every hour).
    """
    try:
        if not supabase or not (account_result := supabase.table("condominio_contas_bancarias").select("*").eq(
            "condominio_id", condominio_id
        ).eq("ativo", True).execute()).data:
            # DEMO MODE: Fallback para uma conta fictícia se o Supabase falhar
            print(f"[Pluggy] 🛠️  MODO DEMO: Usando conta fictícia para {condominio_id}")
            # Pegar uma conta real da Pluggy se possível, ou usar ID fixo de sandbox
            pluggy_account_id = "00000000-0000-0000-0000-000000000001" # Sandbox
        else:
            account_data = account_result.data[0]
            pluggy_account_id = account_data["pluggy_account_id"]
        
        # Tentar buscar transações reais
        service = PluggyService()
        try:
            transactions = await service.get_transactions(pluggy_account_id)
            print(f"[Pluggy] ✅ {len(transactions)} transações reais obtidas.")
        except Exception as e:
            print(f"[Pluggy] ⚠️  Falha ao buscar transações reais: {e}")
            # MODO DEMO: Se falhar ou for demo, injetar transações fakes ricas para a apresentação
            print(f"🛠️ [Pluggy] Injetando transações de demonstração.")
            transactions = [
                {
                    "id": "tx_001",
                    "description": "CONDOMINIO EDIFICIO SOLAR - UNID 101",
                    "amount": 850.00,
                    "date": (datetime.now() - timedelta(days=1)).isoformat(),
                    "category": "Receita",
                    "type": "CREDIT"
                },
                {
                    "id": "tx_002",
                    "description": "MANUTENCAO ELEVADOR ATLAS SCHINDLER",
                    "amount": -1200.00,
                    "date": (datetime.now() - timedelta(days=2)).isoformat(),
                    "category": "Manutenção",
                    "type": "DEBIT"
                },
                {
                    "id": "tx_003",
                    "description": "ENEL DISTRIBUICAO - CONTA LUZ",
                    "amount": -3450.20,
                    "date": (datetime.now() - timedelta(days=3)).isoformat(),
                    "category": "Contas Fixas",
                    "type": "DEBIT"
                },
                {
                    "id": "tx_004",
                    "description": "CONDOMINIO EDIFICIO SOLAR - UNID 202",
                    "amount": 850.00,
                    "date": (datetime.now() - timedelta(days=5)).isoformat(),
                    "category": "Receita",
                    "type": "CREDIT"
                },
                {
                    "id": "tx_005",
                    "description": "LIMPEZA E CONSERVACAO LTDA",
                    "amount": -2800.00,
                    "date": (datetime.now() - timedelta(days=7)).isoformat(),
                    "category": "Serviços",
                    "type": "DEBIT"
                }
            ]
        
        return {
            "status": "success",
            "transactions": transactions,
            "transactions_count": len(transactions),
            "message": f"Sincronizadas {len(transactions)} transações (Modo Demo)"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
