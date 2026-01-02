"""
Script de Validação: Pluggy API Connection
Testa autenticação e criação de connect token SEM Supabase
"""
import asyncio
import httpx
import sys
from datetime import datetime

# Credenciais (substitua com as reais)
PLUGGY_CLIENT_ID = "8ee661fe-855d-40ee-994c-2988f42941b0"
PLUGGY_CLIENT_SECRET = "be675088-9dc2-4a9f-b122-892bfc7fffb4"
BASE_URL = "https://api.pluggy.ai"

async def test_pluggy_auth():
    """Testa autenticação com Pluggy"""
    print("🔐 Testando autenticação Pluggy...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/auth",
                json={
                    "clientId": PLUGGY_CLIENT_ID,
                    "clientSecret": PLUGGY_CLIENT_SECRET
                },
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                print("✅ Autenticação bem-sucedida!")
                print(f"   API Key: {data['apiKey'][:20]}...")
                return data['apiKey']
            else:
                print(f"❌ Erro na autenticação: {response.status_code}")
                print(f"   Resposta: {response.text}")
                return None
                
    except Exception as e:
        print(f"❌ Exceção: {str(e)}")
        return None

async def test_create_connect_token(api_key: str):
    """Testa criação de Connect Token"""
    print("\n🎫 Testando criação de Connect Token...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/connect_token",
                headers={"X-API-KEY": api_key},
                json={},
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                print("✅ Connect Token criado!")
                print(f"   Token: {data['accessToken'][:30]}...")
                return data['accessToken']
            else:
                print(f"❌ Erro ao criar token: {response.status_code}")
                print(f"   Resposta: {response.text}")
                return None
                
    except Exception as e:
        print(f"❌ Exceção: {str(e)}")
        return None

async def test_get_connectors(api_key: str):
    """Testa listagem de conectores disponíveis"""
    print("\n🏦 Testando listagem de bancos disponíveis...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/connectors",
                headers={"X-API-KEY": api_key},
                params={"countries": "BR"},
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                connectors = data.get('results', [])
                print(f"✅ {len(connectors)} bancos disponíveis!")
                
                # Mostrar alguns bancos
                print("\n   Principais bancos:")
                for conn in connectors[:5]:
                    print(f"   - {conn['name']}")
                
                return True
            else:
                print(f"❌ Erro ao listar bancos: {response.status_code}")
                return False
                
    except Exception as e:
        print(f"❌ Exceção: {str(e)}")
        return False

async def main():
    print("=" * 60)
    print("VALIDAÇÃO: Integração Pluggy")
    print(f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Teste 1: Autenticação
    api_key = await test_pluggy_auth()
    if not api_key:
        print("\n❌ FALHA: Não foi possível autenticar")
        print("   Verifique as credenciais em credenciais.md")
        sys.exit(1)
    
    # Teste 2: Connect Token
    connect_token = await test_create_connect_token(api_key)
    if not connect_token:
        print("\n❌ FALHA: Não foi possível criar connect token")
        sys.exit(1)
    
    # Teste 3: Listar Bancos
    success = await test_get_connectors(api_key)
    if not success:
        print("\n❌ FALHA: Não foi possível listar bancos")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✅ TODOS OS TESTES PASSARAM!")
    print("=" * 60)
    print("\n📝 Próximos passos:")
    print("   1. Credenciais Pluggy estão corretas")
    print("   2. Pode prosseguir com integração no backend")
    print("   3. Testar fluxo completo com Supabase")

if __name__ == "__main__":
    asyncio.run(main())
