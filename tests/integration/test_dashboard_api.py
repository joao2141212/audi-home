#!/usr/bin/env python3
"""
Script de Teste de Integração - Dashboard
Testa os endpoints necessários para alimentar o Dashboard com dados reais.
"""
import asyncio
import httpx
from datetime import datetime, timedelta
import json

BASE_URL = "http://localhost:8000"

async def test_health():
    """Testa se o backend está rodando"""
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{BASE_URL}/health")
            print(f"✅ Health Check: {r.json()}")
            return True
        except Exception as e:
            print(f"❌ Backend offline: {e}")
            return False

async def test_budget_endpoints():
    """Testa endpoints de orçamento"""
    async with httpx.AsyncClient() as client:
        # GET orçamento
        try:
            r = await client.get(f"{BASE_URL}/api/v1/budget/")
            print(f"📊 GET /budget/: Status {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"   Dados: {json.dumps(data, indent=2)[:200]}...")
            return r.status_code
        except Exception as e:
            print(f"❌ Erro budget: {e}")
            return None

async def test_reconciliation_queue():
    """Testa fila de reconciliação (para Alertas)"""
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{BASE_URL}/api/v1/reconciliation/queue", params={"condominio_id": "test-condo"})
            print(f"🔔 GET /reconciliation/queue: Status {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"   Dados: {json.dumps(data, indent=2)[:200]}...")
            elif r.status_code == 500:
                print(f"   Erro: {r.text[:300]}")
            return r.status_code
        except Exception as e:
            print(f"❌ Erro reconciliation: {e}")
            return None

async def test_pluggy_token():
    """Testa geração de token Pluggy (para Open Finance)"""
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(f"{BASE_URL}/api/v1/pluggy/token")
            print(f"🔑 POST /pluggy/token: Status {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                token = data.get("accessToken", "")[:50]
                print(f"   Token: {token}...")
            return r.status_code
        except Exception as e:
            print(f"❌ Erro pluggy token: {e}")
            return None

async def test_audit_supplier():
    """Testa busca de fornecedor (para validação CNPJ)"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # CNPJ da Petrobras (empresa real)
            cnpj = "33000167000101"
            r = await client.get(f"{BASE_URL}/api/v1/audit/suppliers/{cnpj}")
            print(f"🏢 GET /audit/suppliers/{cnpj}: Status {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"   Razão Social: {data.get('razao_social', 'N/A')}")
                print(f"   Status RFB: {data.get('status_receita', 'N/A')}")
                print(f"   CNAE: {data.get('cnae_principal', {}).get('descricao', 'N/A')}")
            return r.status_code
        except Exception as e:
            print(f"❌ Erro audit supplier: {e}")
            return None

async def test_open_finance_connect():
    """Testa conexão Open Finance"""
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{BASE_URL}/api/v1/open-finance/connect",
                params={"user_id": "test-condo-1", "provider": "pluggy"}
            )
            print(f"🏦 POST /open-finance/connect: Status {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"   Widget URL: {data.get('widget_url', '')[:80]}...")
                print(f"   Provider: {data.get('provider', 'N/A')}")
            return r.status_code
        except Exception as e:
            print(f"❌ Erro open-finance connect: {e}")
            return None

async def main():
    print("=" * 60)
    print("🧪 TESTE DE INTEGRAÇÃO - DASHBOARD APIs")
    print("=" * 60)
    print(f"📍 Base URL: {BASE_URL}")
    print(f"🕐 Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Testa se backend está online
    if not await test_health():
        print("\n❌ Backend offline. Encerrando testes.")
        return
    
    print("\n" + "-" * 40)
    print("📋 TESTANDO ENDPOINTS DO DASHBOARD:")
    print("-" * 40)
    
    # Testa cada endpoint
    results = {}
    
    print("\n1️⃣ Orçamento (para Cards)")
    results['budget'] = await test_budget_endpoints()
    
    print("\n2️⃣ Fila de Reconciliação (para Alertas)")
    results['reconciliation'] = await test_reconciliation_queue()
    
    print("\n3️⃣ Token Pluggy (para Open Finance)")
    results['pluggy_token'] = await test_pluggy_token()
    
    print("\n4️⃣ Validação Fornecedor (para Auditoria)")
    results['supplier'] = await test_audit_supplier()
    
    print("\n5️⃣ Conexão Open Finance")
    results['open_finance'] = await test_open_finance_connect()
    
    # Resumo
    print("\n" + "=" * 60)
    print("📊 RESUMO DOS TESTES:")
    print("=" * 60)
    for endpoint, status in results.items():
        emoji = "✅" if status == 200 else "⚠️" if status else "❌"
        print(f"   {emoji} {endpoint}: {status}")
    
    print("\n" + "=" * 60)
    print("🎯 PRÓXIMOS PASSOS PARA DASHBOARD:")
    print("=" * 60)
    print("1. Criar endpoint /api/v1/dashboard/summary (agregador)")
    print("2. Conectar Dashboard.tsx a esse endpoint")
    print("3. Buscar alertas reais de fila_reconciliacao")
    print("4. Buscar dados de transações para gráfico")

if __name__ == "__main__":
    asyncio.run(main())
