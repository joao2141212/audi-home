from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import List
from app.models.schemas import BankStatementResponse, BankTransactionResponse
from app.services.statement_parser import StatementParser
from supabase import create_client, Client
from app.core.config import get_settings
import hashlib

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@router.post("/upload", response_model=BankStatementResponse)
async def upload_statement(
    file: UploadFile = File(...),
    supabase: Client = Depends(get_supabase)
):
    """
    Upload a bank statement (CSV, OFX, or PDF).
    Parses the file and extracts transactions.
    """
    # Validate file type
    file_ext = file.filename.split('.')[-1].lower()
    if file_ext not in ['csv', 'ofx', 'pdf']:
        raise HTTPException(status_code=400, detail="Invalid file format. Supported: CSV, OFX, PDF")
    
    # Read file content
    contents = await file.read()
    
    # Calculate hash for deduplication
    file_hash = hashlib.sha256(contents).hexdigest()
    
    # Check if already uploaded
    existing = supabase.table("extratos_bancarios").select("id").eq("arquivo_hash", file_hash).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="This statement has already been uploaded")
    
    # Parse statement
    parser = StatementParser()
    try:
        if file_ext == 'csv':
            transactions, periodo_inicio, periodo_fim = parser.parse_csv(contents)
        elif file_ext == 'ofx':
            transactions, periodo_inicio, periodo_fim = parser.parse_ofx(contents)
        else:  # pdf
            transactions, periodo_inicio, periodo_fim = parser.parse_pdf(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse statement: {str(e)}")
    
    # Upload file to Supabase Storage
    storage_path = f"statements/{file_hash}_{file.filename}"
    try:
        supabase.storage.from_("bank-statements").upload(storage_path, contents)
        arquivo_url = supabase.storage.from_("bank-statements").get_public_url(storage_path)
    except Exception as e:
        # If storage fails, continue without URL
        arquivo_url = None
    
    # Insert statement record
    statement_data = {
        "arquivo_nome": file.filename,
        "arquivo_url": arquivo_url,
        "arquivo_hash": file_hash,
        "periodo_inicio": periodo_inicio.isoformat() if periodo_inicio else None,
        "periodo_fim": periodo_fim.isoformat() if periodo_fim else None,
        "fonte": "manual"
    }
    
    result = supabase.table("extratos_bancarios").insert(statement_data).execute()
    statement_id = result.data[0]['id']
    
    # Insert transactions
    for txn in transactions:
        txn['extrato_id'] = statement_id
        # Convert date to ISO string
        txn['data_transacao'] = txn['data_transacao'].isoformat()
        txn['valor'] = float(txn['valor'])
    
    if transactions:
        supabase.table("transacoes_bancarias").insert(transactions).execute()
    
    return result.data[0]

@router.get("/{statement_id}/transactions", response_model=List[BankTransactionResponse])
async def get_statement_transactions(
    statement_id: str,
    supabase: Client = Depends(get_supabase)
):
    """Get all transactions from a specific statement"""
    result = supabase.table("transacoes_bancarias").select("*").eq("extrato_id", statement_id).execute()
    return result.data

@router.get("/", response_model=List[BankStatementResponse])
async def list_statements(
    supabase: Client = Depends(get_supabase)
):
    """List all uploaded bank statements"""
    result = supabase.table("extratos_bancarios").select("*").order("data_importacao", desc=True).execute()
    return result.data
