from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict
from app.models.schemas import PaymentCreate, PaymentValidationResult
from app.services.rfb_validator import RFBValidator
from supabase import create_client, Client
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@router.post("/validate", response_model=List[PaymentValidationResult])
async def validate_payments(
    payments: List[PaymentCreate],
    supabase: Client = Depends(get_supabase)
):
    """
    Validates a list of payments against RFB rules.
    """
    validator = RFBValidator()
    results = []

    for payment in payments:
        # 1. Validate CNPJ with RFB
        rfb_data = await validator.validate_cnpj(payment.cnpj_fornecedor)
        
        status_rfb = rfb_data.get("situacao_cadastral")
        cnae_rfb = rfb_data.get("cnae_principal")
        
        status_validacao = "ok"
        motivo = None

        if status_rfb != "Ativo":
            status_validacao = "divergencia"
            motivo = f"Fornecedor {status_rfb}"
        
        # 2. Check if CNAE matches (Simplified logic)
        # In a real app, we would check against the CNAE in the Invoice (NF)
        # Here we just pass it through as we don't have the NF CNAE in the input yet
        
        # 3. Save/Update in Supabase
        payment_data = payment.model_dump()
        payment_data.update({
            "status_validacao": status_validacao,
            "status_rfb": status_rfb,
            "cnae_consulta": cnae_rfb,
            "motivo_divergencia": motivo
        })
        
        # Insert into pagamentos table
        try:
            result = supabase.table("pagamentos").insert(payment_data).execute()
            inserted_id = result.data[0]['id']
            
            results.append(PaymentValidationResult(
                payment_id=inserted_id,
                status_validacao=status_validacao,
                status_rfb=status_rfb,
                cnae_consulta=cnae_rfb,
                motivo_divergencia=motivo
            ))
        except Exception as e:
            print(f"Error inserting payment: {e}")
            # Handle error appropriately

    return results
