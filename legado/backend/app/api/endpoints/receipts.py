from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from typing import List, Optional
from app.models.schemas import ReceiptResponse, ReceiptCreate, ReceiptOCRResult
from app.services.ocr_service import OCRService
from supabase import create_client, Client
from app.core.config import get_settings
import hashlib

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@router.post("/upload", response_model=ReceiptResponse)
async def upload_receipt(
    file: UploadFile = File(...),
    unidade: Optional[str] = Form(None),
    supabase: Client = Depends(get_supabase)
):
    """
    Upload a receipt (PDF, JPG, PNG).
    Stores the file and creates a record for processing.
    """
    # Validate file type
    file_ext = file.filename.split('.')[-1].lower()
    if file_ext not in ['pdf', 'jpg', 'jpeg', 'png']:
        raise HTTPException(status_code=400, detail="Invalid file format. Supported: PDF, JPG, PNG")
    
    # Read file content
    contents = await file.read()
    file_size = len(contents)
    
    # Calculate hash
    file_hash = hashlib.sha256(contents).hexdigest()
    
    # Check for duplicates
    existing = supabase.table("comprovantes").select("id, status, arquivo_hash").eq("arquivo_hash", file_hash).execute()
    if existing.data:
        existing_receipt = existing.data[0]
        # Mark as duplicate
        duplicate_data = {
            "arquivo_nome": file.filename,
            "arquivo_url": existing_receipt.get('arquivo_url', ''),
            "arquivo_hash": file_hash,
            "tipo_arquivo": file_ext,
            "tamanho_bytes": file_size,
            "unidade": unidade,
            "status": "duplicado",
            "duplicado_de": existing_receipt['id'],
            "fraud_score": 100,
            "fraud_flags": {"flags": ["duplicate_file"]}
        }
        result = supabase.table("comprovantes").insert(duplicate_data).execute()
        return result.data[0]
    
    # Run fraud detection
    from app.services.fraud_detector import FraudDetector
    
    # Get existing hashes for duplicate detection
    all_receipts = supabase.table("comprovantes").select("arquivo_hash").execute()
    existing_hashes = [r['arquivo_hash'] for r in all_receipts.data]
    
    fraud_detector = FraudDetector()
    fraud_result = await fraud_detector.analyze_receipt(
        file_content=contents,
        file_type=file_ext,
        file_hash=file_hash,
        existing_hashes=existing_hashes
    )
    
    # Upload to Supabase Storage
    storage_path = f"receipts/{file_hash}_{file.filename}"
    try:
        supabase.storage.from_("receipts").upload(storage_path, contents)
        arquivo_url = supabase.storage.from_("receipts").get_public_url(storage_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")
    
    # Create receipt record with fraud detection results
    receipt_data = {
        "arquivo_nome": file.filename,
        "arquivo_url": arquivo_url,
        "arquivo_hash": file_hash,
        "tipo_arquivo": file_ext,
        "tamanho_bytes": file_size,
        "unidade": unidade,
        "status": "suspeito" if fraud_result['fraud_score'] > 70 else "pendente",
        "fraud_score": fraud_result['fraud_score'],
        "fraud_flags": {"flags": fraud_result['fraud_flags']},
        "documento_alterado": fraud_result['documento_alterado']
    }
    
    result = supabase.table("comprovantes").insert(receipt_data).execute()
    receipt_id = result.data[0]['id']
    
    # If high fraud score, add to reconciliation queue with high priority
    if fraud_result['fraud_score'] > 70:
        supabase.table("fila_reconciliacao").insert({
            "comprovante_id": receipt_id,
            "tipo": "fraude_suspeita",
            "prioridade": 10,  # Highest priority
            "matches_sugeridos": [],
            "status": "pendente"
        }).execute()
    
    return result.data[0]

@router.post("/{receipt_id}/process-ocr", response_model=ReceiptOCRResult)
async def process_receipt_ocr(
    receipt_id: str,
    supabase: Client = Depends(get_supabase)
):
    """
    Trigger OCR processing for a receipt.
    Extracts valor, data, NSU, etc.
    """
    # Get receipt
    receipt_result = supabase.table("comprovantes").select("*").eq("id", receipt_id).execute()
    if not receipt_result.data:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    receipt = receipt_result.data[0]
    
    # Check if already processed
    if receipt['ocr_processado']:
        return {
            'ocr_processado': receipt['ocr_processado'],
            'ocr_confianca': receipt['ocr_confianca'],
            'ocr_valor': receipt['ocr_valor'],
            'ocr_data': receipt['ocr_data'],
            'ocr_nsu': receipt['ocr_nsu'],
            'ocr_codigo_barras': receipt['ocr_codigo_barras'],
            'ocr_texto_completo': receipt['ocr_texto_completo'],
            'ocr_erro': receipt['ocr_erro']
        }
    
    # Download file from storage
    try:
        file_response = supabase.storage.from_("receipts").download(receipt['arquivo_url'].split('/')[-1])
        file_content = file_response
    except Exception as e:
        # If download fails, we can't process
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")
    
    # Process with OCR
    ocr_service = OCRService(use_tesseract=False)  # Use mock for now
    ocr_result = await ocr_service.process_receipt(file_content, receipt['tipo_arquivo'])
    
    # Validate barcode if present
    if ocr_result.get('ocr_codigo_barras'):
        from app.services.fraud_detector import FraudDetector
        fraud_detector = FraudDetector()
        
        barcode_validation = fraud_detector.validate_barcode(
            barcode=ocr_result['ocr_codigo_barras'],
            expected_value=float(ocr_result.get('ocr_valor', 0)) if ocr_result.get('ocr_valor') else None
        )
        
        if not barcode_validation['valid']:
            # Update fraud score
            current_fraud_score = receipt.get('fraud_score', 0)
            new_fraud_score = min(current_fraud_score + 30, 100)
            
            ocr_result['fraud_score'] = new_fraud_score
            ocr_result['fraud_flags'] = {
                "flags": receipt.get('fraud_flags', {}).get('flags', []) + [f"barcode_{barcode_validation['reason']}"]
            }
            
            # If barcode value doesn't match OCR value, flag it
            if barcode_validation.get('barcode_value') and barcode_validation.get('expected_value'):
                ocr_result['ocr_erro'] = f"Valor no código de barras (R$ {barcode_validation['barcode_value']:.2f}) difere do valor OCR (R$ {barcode_validation['expected_value']:.2f})"
    
    # Update receipt with OCR results
    supabase.table("comprovantes").update(ocr_result).eq("id", receipt_id).execute()
    
    return ocr_result

@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_id: str,
    supabase: Client = Depends(get_supabase)
):
    """Get receipt details"""
    result = supabase.table("comprovantes").select("*").eq("id", receipt_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return result.data[0]

@router.get("/", response_model=List[ReceiptResponse])
async def list_receipts(
    status: Optional[str] = None,
    unidade: Optional[str] = None,
    supabase: Client = Depends(get_supabase)
):
    """List receipts with optional filters"""
    query = supabase.table("comprovantes").select("*")
    
    if status:
        query = query.eq("status", status)
    if unidade:
        query = query.eq("unidade", unidade)
    
    result = query.order("data_envio", desc=True).execute()
    return result.data
