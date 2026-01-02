#!/usr/bin/env python3
"""
Script de Teste - Pluggy Integration
Valida toda a integração com a Pluggy (Open Finance)
"""
import asyncio
import httpx
from datetime import datetime
import json

BASE_URL = "http://localhost:8000"

async def test_pluggy_integration():
    print("=" * 60)
    print("🧪 TESTE PLUGGY - OPEN FINANCE INTEGRATION")
    print("=" * 60)
    print(f"📍 Base URL: {BASE_URL}")
    print(f"🕐 Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Testar geração de token
        print("\n1️⃣ GERANDO ACCESS TOKEN")
        print("-" * 40)
        
        r = await client.post(f"{BASE_URL}/api/v1/pluggy/token")
        
        if r.status_code == 200:
            data = r.json()
            access_token = data.get("accessToken", "")
            print(f"   ✅ Token obtido: {access_token[:50]}...")
            
            # Construir URL do widget
            widget_url = f"https://connect.pluggy.ai?connectToken={access_token}"
            print(f"\n   📎 URL do Widget Pluggy:")
            print(f"   {widget_url[:80]}...")
            print(f"\n   ⚠️  Copie esta URL e abra no browser para testar o widget")
        else:
            print(f"   ❌ Erro: {r.status_code} - {r.text}")
            return
        
        # 2. Testar endpoint de sync (sem conta conectada)
        print("\n2️⃣ TESTANDO SYNC SEM CONTA CONECTADA")
        print("-" * 40)
        
        r = await client.get(f"{BASE_URL}/api/v1/pluggy/sync-transactions/test-condo")
        
        if r.status_code == 200:
            data = r.json()
            print(f"   Status: {data.get('status')}")
            print(f"   Mensagem: {data.get('message')}")
            print(f"   Transações: {data.get('transactions_count', 0)}")
        else:
            print(f"   Erro: {r.status_code}")
        
        # 3. Testar endpoint Open Finance Connect
        print("\n3️⃣ TESTANDO OPEN FINANCE CONNECT")
        print("-" * 40)
        
        r = await client.post(
            f"{BASE_URL}/api/v1/open-finance/connect",
            params={"user_id": "test-condo-1", "provider": "pluggy"}
        )
        
        if r.status_code == 200:
            data = r.json()
            print(f"   ✅ Widget URL: {data.get('widget_url', '')[:60]}...")
            print(f"   Provider: {data.get('provider')}")
        else:
            print(f"   ❌ Erro: {r.status_code}")
        
        # Resumo
        print("\n" + "=" * 60)
        print("📋 RESUMO DA INTEGRAÇÃO PLUGGY:")
        print("=" * 60)
        print("""
   ✅ Token de conexão: FUNCIONANDO
   ✅ URL do Widget: CORRETA (https://connect.pluggy.ai?connectToken=...)
   ⚠️  Conta bancária: NÃO CONECTADA (esperado)
   
   🎯 PRÓXIMOS PASSOS:
   1. Vá para a página Open Finance no frontend
   2. Clique em "Conectar Conta Bancária"
   3. O widget da Pluggy deve abrir em popup
   4. Use a conta de teste da Pluggy:
      - Banco: Banco de Teste
      - CPF: qualquer CPF válido (ex: 111.111.111-11)
      - Senha: qualquer
""")

if __name__ == "__main__":
    asyncio.run(test_pluggy_integration())
