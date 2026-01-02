#!/usr/bin/env python3
"""
Teste direto da API Pluggy para validar credenciais
"""
import asyncio
import httpx

# Credenciais do seu painel Pluggy
CLIENT_ID = "8ee661fe-855d-40ee-994c-2988f42941b0"
CLIENT_SECRET = "be675088-9dc2-4a9f-b122-892bfc7fffb4"

async def test_pluggy_auth():
    print("=" * 60)
    print("🔑 TESTE DIRETO - AUTENTICAÇÃO PLUGGY")
    print("=" * 60)
    
    async with httpx.AsyncClient() as client:
        # 1. Autenticar para obter API Key
        print("\n1️⃣ Autenticando com Pluggy...")
        r = await client.post(
            "https://api.pluggy.ai/auth",
            json={
                "clientId": CLIENT_ID,
                "clientSecret": CLIENT_SECRET
            }
        )
        
        if r.status_code == 200:
            data = r.json()
            api_key = data.get("apiKey", "")
            print(f"   ✅ Autenticação OK!")
            print(f"   API Key: {api_key[:50]}...")
        else:
            print(f"   ❌ Erro: {r.status_code}")
            print(f"   Resposta: {r.text}")
            return
        
        # 2. Criar Connect Token
        print("\n2️⃣ Gerando Connect Token...")
        r = await client.post(
            "https://api.pluggy.ai/connect_token",
            headers={"X-API-KEY": api_key},
            json={}
        )
        
        if r.status_code == 200:
            data = r.json()
            access_token = data.get("accessToken", "")
            print(f"   ✅ Token gerado!")
            print(f"   Token: {access_token[:50]}...")
            
            # URL do widget
            widget_url = f"https://connect.pluggy.ai?connectToken={access_token}"
            print(f"\n   📎 WIDGET URL PARA TESTE:")
            print(f"   {widget_url[:100]}...")
            
        else:
            print(f"   ❌ Erro: {r.status_code}")
            print(f"   Resposta: {r.text}")
            return
        
        # 3. Listar Items (conexões existentes)
        print("\n3️⃣ Verificando conexões existentes...")
        r = await client.get(
            "https://api.pluggy.ai/items",
            headers={"X-API-KEY": api_key}
        )
        
        if r.status_code == 200:
            data = r.json()
            items = data.get("results", [])
            print(f"   Conexões encontradas: {len(items)}")
            
            for item in items:
                print(f"\n   📌 Item ID: {item.get('id')}")
                print(f"      Status: {item.get('status')}")
                print(f"      Conector: {item.get('connector', {}).get('name', 'N/A')}")
        else:
            print(f"   ⚠️  Código: {r.status_code}")
        
        print("\n" + "=" * 60)
        print("✅ CREDENCIAIS PLUGGY FUNCIONANDO!")
        print("=" * 60)
        print("""
    ⚠️  IMPORTANTE: Você precisa adicionar "Allowed Origins" no painel Pluggy!
    
    Vá em: https://dashboard.pluggy.ai/applications
    Clique no app "audi home"
    Em "Allowed Origins", adicione:
    
    ➡️  http://localhost:5173
    ➡️  http://localhost:8000
    
    Sem isso, o widget não vai funcionar no browser.
""")

if __name__ == "__main__":
    asyncio.run(test_pluggy_auth())
