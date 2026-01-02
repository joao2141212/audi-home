#!/usr/bin/env python3
"""
MASTER VALIDATION SCRIPT
Executa todos os testes de validação em sequência
"""
import subprocess
import sys
from pathlib import Path
from datetime import datetime

def run_test(test_name: str, script_path: Path) -> bool:
    """Executa um script de teste"""
    print(f"\n{'='*60}")
    print(f"Executando: {test_name}")
    print(f"{'='*60}\n")
    
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=False,
            text=True
        )
        
        if result.returncode == 0:
            print(f"\n✅ {test_name}: PASSOU")
            return True
        else:
            print(f"\n❌ {test_name}: FALHOU")
            return False
            
    except Exception as e:
        print(f"\n❌ {test_name}: ERRO - {str(e)}")
        return False

def main():
    print("=" * 70)
    print(" " * 15 + "VALIDAÇÃO COMPLETA DO SISTEMA")
    print(f" " * 20 + datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print("=" * 70)
    
    tests_dir = Path(__file__).parent
    
    tests = [
        ("Fraud Detection", tests_dir / "test_fraud_detection.py"),
        ("OCR Service", tests_dir / "test_ocr.py"),
        ("Pluggy API", tests_dir / "test_pluggy.py"),
        ("BrasilAPI Service", tests_dir / "test_brasil_api.py"),
        ("Complete Flow (Mock)", tests_dir / "test_complete_flow.py"),
    ]
    
    results = {}
    
    for test_name, script_path in tests:
        if not script_path.exists():
            print(f"\n⚠️  {test_name}: Script não encontrado - {script_path}")
            results[test_name] = False
            continue
        
        results[test_name] = run_test(test_name, script_path)
    
    # Relatório Final
    print("\n" + "=" * 70)
    print(" " * 25 + "RELATÓRIO FINAL")
    print("=" * 70)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, success in results.items():
        status = "✅ PASSOU" if success else "❌ FALHOU"
        print(f"{test_name:.<50} {status}")
    
    print("=" * 70)
    print(f"Total: {passed}/{total} testes passaram")
    print("=" * 70)
    
    if passed == total:
        print("\n🎉 TODOS OS TESTES PASSARAM!")
        print("\n📝 Próximos passos:")
        print("   1. Configurar credenciais Supabase no .env")
        print("   2. Executar migrations do banco de dados")
        print("   3. Testar integração completa com Supabase")
        print("   4. Iniciar backend: cd backend && uvicorn app.main:app --reload")
        print("   5. Iniciar frontend: cd frontend && npm run dev")
        return 0
    else:
        print("\n❌ ALGUNS TESTES FALHARAM")
        print("\n📝 Ações necessárias:")
        print("   1. Verificar logs de erro acima")
        print("   2. Corrigir problemas identificados")
        print("   3. Executar novamente: python tests/validation/run_all_tests.py")
        return 1

if __name__ == "__main__":
    sys.exit(main())
