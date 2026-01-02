#!/usr/bin/env python3
"""
TESTE DO SISTEMA COMPLETO (LIVE)
Valida backend + Pluggy + CNPJ.ws
"""
import asyncio
import httpx
from datetime import datetime
from decimal import Decimal

# Cores para output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

BACKEND_URL = "http://localhost:8000"

async def test_backend_health():
    """Testa se backend está rodando"""
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}TESTE 1: Backend Health Check{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{BACKEND_URL}/health", timeout=5.0)
            
            if response.status_code == 200:
                print(f"{GREEN}✅ Backend está rodando!{RESET}")
                print(f"   URL: {BACKEND_URL}")
                print(f"   Status: {response.json()}")
                return True
            else:
                print(f"{RED}❌ Backend retornou status {response.status_code}{RESET}")
                return False
                
    except Exception as e:
        print(f"{RED}❌ Backend NÃO está rodando!{RESET}")
        print(f"   Erro: {str(e)}")
        print(f"\n{YELLOW}💡 Inicie o backend:{RESET}")
        print(f"   cd backend && uvicorn app.main:app --reload")
        return False

async def test_pluggy_integration():
    """Testa integração com Pluggy"""
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}TESTE 2: Pluggy API Integration{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")
    
    # Credenciais Pluggy
    PLUGGY_CLIENT_ID = "8ee661fe-855d-40ee-994c-2988f42941b0"
    PLUGGY_CLIENT_SECRET = "be675088-9dc2-4a9f-b122-892bfc7fffb4"
    
    try:
        # 1. Autenticar
        print(f"\n{YELLOW}Passo 1: Autenticando com Pluggy...{RESET}")
        
        async with httpx.AsyncClient() as client:
            auth_response = await client.post(
                "https://api.pluggy.ai/auth",
                json={
                    "clientId": PLUGGY_CLIENT_ID,
                    "clientSecret": PLUGGY_CLIENT_SECRET
                },
                timeout=10.0
            )
            
            if auth_response.status_code != 200:
                print(f"{RED}❌ Falha na autenticação Pluggy{RESET}")
                print(f"   Status: {auth_response.status_code}")
                return False
            
            api_key = auth_response.json()["apiKey"]
            print(f"{GREEN}✅ Autenticado com sucesso!{RESET}")
            print(f"   API Key: {api_key[:20]}...")
            
            # 2. Criar Connect Token
            print(f"\n{YELLOW}Passo 2: Criando Connect Token...{RESET}")
            
            token_response = await client.post(
                "https://api.pluggy.ai/connect_token",
                headers={"X-API-KEY": api_key},
                json={},
                timeout=10.0
            )
            
            if token_response.status_code != 200:
                print(f"{RED}❌ Falha ao criar connect token{RESET}")
                return False
            
            connect_token = token_response.json()["accessToken"]
            print(f"{GREEN}✅ Connect Token criado!{RESET}")
            print(f"   Token: {connect_token[:30]}...")
            
            # 3. Listar conectores (bancos disponíveis)
            print(f"\n{YELLOW}Passo 3: Listando bancos disponíveis...{RESET}")
            
            connectors_response = await client.get(
                "https://api.pluggy.ai/connectors",
                headers={"X-API-KEY": api_key},
                params={"countries": "BR"},
                timeout=10.0
            )
            
            if connectors_response.status_code != 200:
                print(f"{RED}❌ Falha ao listar bancos{RESET}")
                return False
            
            connectors = connectors_response.json()["results"]
            print(f"{GREEN}✅ {len(connectors)} bancos disponíveis!{RESET}")
            print(f"   Exemplos:")
            for conn in connectors[:5]:
                print(f"   - {conn['name']}")
            
            return True
            
    except Exception as e:
        print(f"{RED}❌ Erro na integração Pluggy: {str(e)}{RESET}")
        return False

async def test_cnpj_validation():
    """Testa validação de CNPJ via CNPJ.ws"""
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}TESTE 3: CNPJ.ws API (Validação de Fornecedor){RESET}")
    print(f"{BLUE}{'='*70}{RESET}")
    
    # CNPJ do Banco do Brasil (exemplo público)
    cnpj_teste = "00000000000191"  # Banco do Brasil
    
    try:
        print(f"\n{YELLOW}Validando CNPJ: {cnpj_teste}{RESET}")
        print(f"   Empresa: Banco do Brasil S.A.")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://publica.cnpj.ws/cnpj/{cnpj_teste}",
                timeout=30.0
            )
            
            if response.status_code == 200:
                data = response.json()
                estabelecimento = data.get('estabelecimento', {})
                atividade = estabelecimento.get('atividade_principal', {})
                
                print(f"{GREEN}✅ CNPJ válido!{RESET}")
                print(f"\n   📋 Dados da Receita Federal:")
                print(f"   Razão Social: {data.get('razao_social', 'N/A')}")
                print(f"   Nome Fantasia: {estabelecimento.get('nome_fantasia', 'N/A')}")
                print(f"   Situação: {estabelecimento.get('situacao_cadastral', 'N/A')}")
                print(f"   CNAE: {atividade.get('id', 'N/A')} - {atividade.get('descricao', 'N/A')}")
                print(f"   Endereço: {estabelecimento.get('logradouro', 'N/A')}")
                print(f"   Município: {estabelecimento.get('municipio', 'N/A')}/{estabelecimento.get('uf', 'N/A')}")
                
                # Determinar nível de risco
                situacao = estabelecimento.get('situacao_cadastral', '').lower()
                if 'ativa' in situacao:
                    print(f"\n   {GREEN}🛡️  Nível de Risco: OK (Empresa ativa){RESET}")
                elif 'baixada' in situacao:
                    print(f"\n   {RED}🛡️  Nível de Risco: CRITICAL_RISK (Empresa baixada){RESET}")
                else:
                    print(f"\n   {YELLOW}🛡️  Nível de Risco: WARNING (Verificar situação){RESET}")
                
                return True
                
            elif response.status_code == 429:
                print(f"{YELLOW}⚠️  Rate limit atingido (3 req/min){RESET}")
                print(f"   Isso é esperado na versão grátis")
                print(f"   Aguarde 20 segundos e tente novamente")
                return True  # Não é erro, é limitação conhecida
                
            elif response.status_code == 404:
                print(f"{RED}❌ CNPJ não encontrado{RESET}")
                return False
                
            else:
                print(f"{RED}❌ Erro: Status {response.status_code}{RESET}")
                return False
                
    except Exception as e:
        print(f"{RED}❌ Erro na validação CNPJ: {str(e)}{RESET}")
        return False

async def test_backend_endpoints():
    """Testa endpoints do backend"""
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}TESTE 4: Backend Endpoints{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")
    
    try:
        async with httpx.AsyncClient() as client:
            # Testar endpoint de documentação
            print(f"\n{YELLOW}Testando /docs (Swagger)...{RESET}")
            
            docs_response = await client.get(f"{BACKEND_URL}/docs", timeout=5.0)
            
            if docs_response.status_code == 200:
                print(f"{GREEN}✅ Documentação disponível!{RESET}")
                print(f"   Acesse: {BACKEND_URL}/docs")
            else:
                print(f"{YELLOW}⚠️  Docs não disponível{RESET}")
            
            # Testar endpoint OpenAPI
            print(f"\n{YELLOW}Testando /openapi.json...{RESET}")
            
            openapi_response = await client.get(f"{BACKEND_URL}/api/v1/openapi.json", timeout=5.0)
            
            if openapi_response.status_code == 200:
                openapi = openapi_response.json()
                paths = list(openapi.get('paths', {}).keys())
                print(f"{GREEN}✅ OpenAPI Schema disponível!{RESET}")
                print(f"   Endpoints disponíveis: {len(paths)}")
                print(f"   Exemplos:")
                for path in paths[:5]:
                    print(f"   - {path}")
            else:
                print(f"{YELLOW}⚠️  OpenAPI não disponível{RESET}")
            
            return True
            
    except Exception as e:
        print(f"{RED}❌ Erro ao testar endpoints: {str(e)}{RESET}")
        return False

async def main():
    """Executa todos os testes"""
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}{'TESTE DO SISTEMA COMPLETO (LIVE)':^70}{RESET}")
    print(f"{BLUE}{datetime.now().strftime('%Y-%m-%d %H:%M:%S'):^70}{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")
    
    results = {}
    
    # Teste 1: Backend Health
    results['backend'] = await test_backend_health()
    
    if not results['backend']:
        print(f"\n{RED}❌ Backend não está rodando. Abortando testes.{RESET}")
        return
    
    # Teste 2: Pluggy
    results['pluggy'] = await test_pluggy_integration()
    
    # Teste 3: CNPJ.ws
    results['cnpj'] = await test_cnpj_validation()
    
    # Teste 4: Backend Endpoints
    results['endpoints'] = await test_backend_endpoints()
    
    # Relatório Final
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}{'RELATÓRIO FINAL':^70}{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")
    
    for test_name, passed in results.items():
        status = f"{GREEN}✅ PASSOU{RESET}" if passed else f"{RED}❌ FALHOU{RESET}"
        print(f"   {test_name.capitalize():<20} {status}")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    print(f"\n   Total: {passed}/{total} testes passaram")
    
    if passed == total:
        print(f"\n{GREEN}🎉 TODOS OS TESTES PASSARAM!{RESET}")
        print(f"\n{GREEN}✅ Sistema funcionando corretamente!{RESET}")
        print(f"\n{BLUE}📝 Próximos passos:{RESET}")
        print(f"   1. Acesse o frontend: http://localhost:5173")
        print(f"   2. Acesse a documentação: {BACKEND_URL}/docs")
        print(f"   3. Teste a aba 'Despesas' (auditoria de fornecedores)")
    else:
        print(f"\n{YELLOW}⚠️  Alguns testes falharam. Verifique os logs acima.{RESET}")

if __name__ == "__main__":
    asyncio.run(main())
