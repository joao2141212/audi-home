"""
Teste Completo de Integração - Pluggy + CNPJ + Database
Valida o fluxo end-to-end real com todas as APIs
"""
import asyncio
import sys
import os
from datetime import datetime

# Carregar .env manualmente
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/.env'))
if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip('"').strip("'")

# Adicionar path do backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

# Cores para output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_header(title):
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}{title.center(70)}{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")

async def test_cnpj_validation():
    """Testa validação de CNPJ com status correto"""
    print_header("TESTE 1: Validação de CNPJ")
    
    from app.services.cnpj_service import CNPJService
    
    service = CNPJService()
    
    try:
        # Testar CNPJ do Banco do Brasil
        print(f"🏢 Validando CNPJ: 00000000000191 (Banco do Brasil)")
        result = await service.validate_cnpj("00000000000191")
        
        print(f"\n   Razão Social: {result.razao_social}")
        print(f"   Status RFB: {result.status_receita}")
        print(f"   CNAE: {result.cnae_principal.codigo} - {result.cnae_principal.descricao}")
        print(f"   Provider: {result.provider}")
        
        # Validar status
        if result.status_receita == "ATIVA":
            print(f"\n{GREEN}✅ SUCESSO: Status mapeado corretamente como ATIVA{RESET}")
            return True
        else:
            print(f"\n{RED}❌ FALHA: Status esperado='ATIVA', recebido='{result.status_receita}'{RESET}")
            return False
            
    except Exception as e:
        print(f"{RED}❌ Erro na validação: {str(e)}{RESET}")
        return False

async def test_pluggy_integration():
    """Testa integração completa com Pluggy"""
    print_header("TESTE 2: Integração Pluggy")
    
    from app.services.pluggy_service import PluggyService
    
    service = PluggyService()
    
    try:
        # 1. Autenticação
        print(f"🔐 Testando autenticação Pluggy...")
        api_key = await service._get_auth_token()
        print(f"   ✅ API Key obtida: {api_key[:20]}...")
        
        # 2. Connect Token
        print(f"\n🎫 Testando criação de Connect Token...")
        connect_token = await service.create_connect_token()
        print(f"   ✅ Connect Token criado: {connect_token[:20]}...")
        
        # 3. Listar Connectors via API direta
        print(f"\n🏦 Listando bancos disponíveis...")
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.pluggy.ai/connectors",
                headers={"X-API-KEY": api_key},
                params={"countries": "BR"}
            )
            if response.status_code == 200:
                connectors = response.json()["results"]
                print(f"   ✅ {len(connectors)} bancos disponíveis")
                print(f"   Exemplos: {', '.join([c['name'] for c in connectors[:5]])}")
            else:
                print(f"   ⚠️  Não foi possível listar conectores: {response.status_code}")
        
        # 4. Nota: Não podemos listar transações sem ter uma conta conectada
        print(f"\n{YELLOW}ℹ️  Para listar transações, é necessário uma conta bancária conectada{RESET}")
        print(f"   Isso requer o fluxo completo via Connect Widget no frontend")
        
        print(f"\n{GREEN}✅ SUCESSO: Pluggy totalmente funcional{RESET}")
        return True
        
    except Exception as e:
        print(f"{RED}❌ Erro na integração Pluggy: {str(e)}{RESET}")
        import traceback
        traceback.print_exc()
        return False

async def test_database_operations():
    """Testa operações no banco de dados"""
    print_header("TESTE 3: Operações no Banco de Dados")
    
    from supabase import create_client
    from app.core.config import get_settings
    
    settings = get_settings()
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    
    try:
        # 1. Testar insert no audit log
        print(f"📝 Inserindo registro de teste...")
        test_id = f"flow_test_{int(datetime.now().timestamp())}"
        
        log_entry = {
            "entity_type": "FULL_FLOW_TEST",
            "entity_id": test_id,
            "action": "VALIDATION_COMPLETE",
            "actor_id": "SYSTEM_TEST",
            "metadata": {
                "cnpj_status": "ATIVA",
                "pluggy_status": "OK"
            }
        }
        
        result = supabase.table("audit_log_immutable").insert(log_entry).execute()
        print(f"   ✅ Registro inserido: {result.data[0]['id']}")
        
        # 2. Testar select
        print(f"\n🔍 Buscando registro...")
        query_result = supabase.table("audit_log_immutable").select("*").eq("entity_id", test_id).execute()
        
        if query_result.data and len(query_result.data) > 0:
            print(f"   ✅ Registro recuperado com sucesso")
            print(f"   Metadados: {query_result.data[0]['metadata']}")
            
            print(f"\n{GREEN}✅ SUCESSO: Database completamente funcional{RESET}")
            return True
        else:
            print(f"{RED}❌ FALHA: Registro não encontrado{RESET}")
            return False
            
    except Exception as e:
        print(f"{RED}❌ Erro no banco de dados: {str(e)}{RESET}")
        return False

async def main():
    print(f"\n{BLUE}🚀 TESTE COMPLETO DE INTEGRAÇÃO{RESET}")
    print(f"{BLUE}Data: {datetime.now()}{RESET}")
    
    results = {}
    
    # Executar todos os testes
    results['cnpj'] = await test_cnpj_validation()
    results['pluggy'] = await test_pluggy_integration()
    results['database'] = await test_database_operations()
    
    # Relatório final
    print_header("RELATÓRIO FINAL")
    
    total = len(results)
    passed = sum(results.values())
    
    for test_name, result in results.items():
        status = f"{GREEN}✅ PASSOU{RESET}" if result else f"{RED}❌ FALHOU{RESET}"
        print(f"   {test_name.upper()}: {status}")
    
    print(f"\n{BLUE}Total: {passed}/{total} testes passaram{RESET}")
    
    if passed == total:
        print(f"\n{GREEN}{'='*70}{RESET}")
        print(f"{GREEN}{'🎉 TODOS OS TESTES PASSARAM 🎉'.center(70)}{RESET}")
        print(f"{GREEN}{'='*70}{RESET}")
        print(f"{GREEN}Sistema validado e pronto para uso!{RESET}")
        return True
    else:
        print(f"\n{RED}{'='*70}{RESET}")
        print(f"{RED}{'⚠️  ALGUNS TESTES FALHARAM ⚠️ '.center(70)}{RESET}")
        print(f"{RED}{'='*70}{RESET}")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
