from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.endpoints import budget, payments, statements, receipts, reconciliation, open_finance, pluggy_routes, audit, dashboard

settings = get_settings()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(dashboard.router, prefix=f"{settings.API_V1_STR}/dashboard", tags=["dashboard"])
app.include_router(budget.router, prefix=f"{settings.API_V1_STR}/budget", tags=["budget"])
app.include_router(payments.router, prefix=f"{settings.API_V1_STR}/payments", tags=["payments"])
app.include_router(statements.router, prefix=f"{settings.API_V1_STR}/statements", tags=["statements"])
app.include_router(receipts.router, prefix=f"{settings.API_V1_STR}/receipts", tags=["receipts"])
app.include_router(reconciliation.router, prefix=f"{settings.API_V1_STR}/reconciliation", tags=["reconciliation"])
app.include_router(open_finance.router, prefix=f"{settings.API_V1_STR}/open-finance", tags=["open-finance"])
app.include_router(pluggy_routes.router, prefix=f"{settings.API_V1_STR}/pluggy", tags=["pluggy"])
app.include_router(audit.router, prefix=f"{settings.API_V1_STR}/audit", tags=["audit"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
