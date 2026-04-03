from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import List, Dict
import pandas as pd
from io import BytesIO
from app.models.schemas import BudgetCreate, BudgetResponse
from supabase import create_client, Client
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@router.post("/upload", response_model=Dict[str, int])
async def upload_budget(
    file: UploadFile = File(...),
    supabase: Client = Depends(get_supabase)
):
    """
    Uploads an Excel file with budget data.
    Expected columns: ano, categoria, subcategoria, valor_programado
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")

    contents = await file.read()
    try:
        df = pd.read_excel(BytesIO(contents))
        
        # Normalize columns
        df.columns = [c.lower().strip() for c in df.columns]
        
        required_cols = ['ano', 'categoria', 'valor_programado']
        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing column: {col}")

        # Convert to records
        records = df.to_dict('records')
        
        # Insert into Supabase
        # Note: In a real app, we should validate each record against BudgetCreate schema
        data = supabase.table("orcamento").insert(records).execute()
        
        return {"inserted": len(data.data)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[BudgetResponse])
async def get_budgets(supabase: Client = Depends(get_supabase)):
    data = supabase.table("orcamento").select("*").execute()
    return data.data
