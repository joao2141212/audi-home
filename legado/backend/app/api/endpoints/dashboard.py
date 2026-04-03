"""
Dashboard API Endpoint
Agregador de dados para o Dashboard principal
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from supabase import create_client, Client
from app.core.config import get_settings
from datetime import datetime, timedelta
from decimal import Decimal

router = APIRouter()
settings = get_settings()

def get_supabase() -> Client:
    try:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    except Exception:
        return None

class DashboardSummary(BaseModel):
    orcamento_anual: float
    orcamento_trend: str
    despesas_totais: float
    despesas_trend: str
    fundo_reserva: float
    fundo_trend: str
    grafico_dados: List[Dict[str, Any]]
    alertas: List[Dict[str, Any]]
    ultima_atualizacao: str

class Alert(BaseModel):
    title: str
    description: str
    severity: str  # low, medium, high, critical
    created_at: Optional[str] = None

@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    condominio_id: str = "default",
    supabase: Client = Depends(get_supabase)
):
    """
    Retorna resumo consolidado para o Dashboard.
    Busca dados reais quando disponíveis, fallback para estimativas.
    """
    
    # If Supabase is missing or queries fail, we already have logic for empty data.
    # Just need to make sure we don't crash on supabase.table(...) calls.
    
    if not supabase:
        print("⚠️ [Dashboard] Demo Mode: Supabase offline, returning mock summary.")
        return DashboardSummary(
            orcamento_anual=150000.0,
            orcamento_trend="+2.5%",
            despesas_totais=12450.80,
            despesas_trend="-1.2%",
            fundo_reserva=45000.0,
            fundo_trend="+0.5%",
            grafico_dados=[
                {"name": "Jul", "receitas": 25000, "despesas": 22000},
                {"name": "Ago", "receitas": 26000, "despesas": 21000},
                {"name": "Set", "receitas": 24000, "despesas": 23000},
                {"name": "Out", "receitas": 27000, "despesas": 20000},
                {"name": "Nov", "receitas": 25500, "despesas": 24500},
                {"name": "Dez", "receitas": 28000, "despesas": 21500},
            ],
            alertas=[
                {"title": "Sistema em Modo Demo", "description": "Conecte o Supabase para dados reais", "severity": "medium", "created_at": datetime.now().isoformat()},
                {"title": "Manutenção Elevador", "description": "NF pendente de auditoria", "severity": "high", "created_at": (datetime.now() - timedelta(hours=2)).isoformat()},
            ],
            ultima_atualizacao=datetime.now().isoformat()
        )
    
    return DashboardSummary(
        orcamento_anual=orcamento_anual,
        orcamento_trend=orcamento_trend,
        despesas_totais=despesas_totais,
        despesas_trend=despesas_trend,
        fundo_reserva=fundo_reserva,
        fundo_trend=fundo_trend,
        grafico_dados=grafico_dados,
        alertas=alertas,
        ultima_atualizacao=datetime.now().isoformat()
    )

@router.get("/health")
async def dashboard_health():
    """Check se o endpoint de dashboard está funcionando"""
    return {
        "status": "ok",
        "endpoint": "dashboard",
        "timestamp": datetime.now().isoformat()
    }
