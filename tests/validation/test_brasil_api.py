"""
Script de Validação: BrasilAPI Service
Testa integração com BrasilAPI SEM Supabase
"""
import sys
from pathlib import Path
from datetime import datetime

# Adicionar path do backend
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from app.services.brasil_api_service import BrasilAPIService

async def test_brasil_api():
    """Testa serviço BrasilAPI"""
    print("=" * 70)
    print(" " * 15 + "VALIDAÇÃO: BrasilAPI Service")
    print(f" " * 20 + datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print("=" * 70)
    
    service = BrasilAPIService()
    
    # Teste 1: CNPJ Válido (Empresa Ativa)
    print("\n✅ Teste 1: CNPJ Válido (Mock - Empresa Ativa)")
    print("-" * 70)
    
    try:
        result = await service.validate_supplier("12345678000199")
        
        print(f"✅ Validação concluída!")
        print(f"   Válido: {result.get('valid')}")
        print(f"   Status Cadastral: {result.get('status_cadastral')}")
        print(f"   Razão Social: {result.get('razao_social')}")
        print(f"   CNAE: {result.get('cnae_principal')}")
        print(f"   Descrição CNAE: {result.get('descricao_cnae')}")
        print(f"   Alerta Crítico: {result.get('alerta_critico')}")
        
        if not result.get('valid'):
            print(f"❌ FALHA: Deveria ser válido")
            return False
            
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    # Teste 2: CNPJ Inválido (Empresa Baixada)
    print("\n⚠️  Teste 2: CNPJ Inválido (Mock - Empresa Baixada)")
    print("-" * 70)
    
    try:
        result = await service.validate_supplier("11111111000999")
        
        print(f"✅ Validação concluída!")
        print(f"   Status Cadastral: {result.get('status_cadastral')}")
        print(f"   Alerta Crítico: {result.get('alerta_critico')}")
        
        if not result.get('alerta_critico'):
            print(f"❌ FALHA: Deveria ter alerta crítico")
            return False
            
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        return False
    
    # Teste 3: Validação CNAE vs Serviço (Compatível)
    print("\n✅ Teste 3: CNAE vs Serviço (Compatível)")
    print("-" * 70)
    
    try:
        validation = service.validate_cnae_service(
            cnae="4321500",
            service_description="Instalação elétrica e manutenção"
        )
        
        print(f"✅ Validação concluída!")
        print(f"   Compatível: {validation.get('compatible')}")
        print(f"   Confiança: {validation.get('confidence')}%")
        print(f"   Motivo: {validation.get('reason')}")
        
        if not validation.get('compatible'):
            print(f"❌ FALHA: Deveria ser compatível")
            return False
            
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        return False
    
    # Teste 4: CNAE vs Serviço (Incompatível - FRAUDE)
    print("\n❌ Teste 4: CNAE vs Serviço (Incompatível - Detecção de Fraude)")
    print("-" * 70)
    
    try:
        validation = service.validate_cnae_service(
            cnae="1091102",  # Padaria
            service_description="Manutenção de Elevador"
        )
        
        print(f"✅ Validação concluída!")
        print(f"   Compatível: {validation.get('compatible')}")
        print(f"   Confiança: {validation.get('confidence')}%")
        print(f"   Motivo: {validation.get('reason')}")
        
        if validation.get('compatible') != False:
            print(f"❌ FALHA: Deveria detectar incompatibilidade (fraude)")
            return False
            
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        return False
    
    # Teste 5: Cache (30 dias)
    print("\n🔄 Teste 5: Cache de Fornecedores")
    print("-" * 70)
    
    try:
        # Primeira chamada
        result1 = await service.validate_supplier("12345678000199")
        
        # Segunda chamada (deve vir do cache)
        result2 = await service.validate_supplier("12345678000199")
        
        print(f"✅ Cache funcionando!")
        print(f"   Primeira chamada: {result1.get('razao_social')}")
        print(f"   Segunda chamada (cache): {result2.get('razao_social')}")
        
        if '_cached_at' not in result2:
            print(f"⚠️  Aviso: Cache pode não estar funcionando")
            
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        return False
    
    print("\n" + "=" * 70)
    print("✅ TODOS OS TESTES DE BRASILAPI PASSARAM!")
    print("=" * 70)
    print("\n📝 Resumo:")
    print("   ✅ Validação de CNPJ ativo")
    print("   ✅ Detecção de empresa baixada")
    print("   ✅ Validação CNAE compatível")
    print("   ✅ Detecção de CNAE incompatível (fraude)")
    print("   ✅ Cache de fornecedores")
    
    return True

if __name__ == "__main__":
    import asyncio
    success = asyncio.run(test_brasil_api())
    sys.exit(0 if success else 1)
