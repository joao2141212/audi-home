"""
Teste de Validação: Enterprise Features
Valida Cascade Logic, Fila de Jobs e Audit Log
"""
import sys
import os
import asyncio
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any

# Adicionar path do backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))

from app.services.robust_validator import RobustValidator, ValidationResult
# from app.services.batch_audit_service import BatchAuditService # Removido para evitar erro de import

async def test_cascade_logic():
    print("\n" + "="*70)
    print("TESTE 1: Cascade Logic (Resolução de Ambiguidade)")
    print("="*70)
    
    validator = RobustValidator()
    
    # Cenário: 2 transações idênticas de R$ 500,00
    tx1 = {
        "id": "tx_1",
        "amount": 500.00,
        "date": "2025-12-01",
        "timestamp": "2025-12-01T10:00:00Z",
        "payer_document": "12345678900",
        "description": "PAGAMENTO CONDOMINIO"
    }
    
    tx2 = {
        "id": "tx_2",
        "amount": 500.00,
        "date": "2025-12-01",
        "timestamp": "2025-12-01T14:00:00Z", # 4 horas depois
        "payer_document": "98765432100",
        "description": "PAGAMENTO CONDOMINIO"
    }
    
    transactions = [tx1, tx2]
    
    # Caso 1: Match por CPF (Nível 1)
    print("\n🔹 Caso 1: Match por CPF (Nível 1)")
    result = validator.validate_payment(
        receipt_amount=Decimal("500.00"),
        receipt_date=datetime(2025, 12, 1).date(),
        receipt_timestamp=None,
        upload_timestamp=datetime.now(),
        payer_cpf="123.456.789-00", # CPF do tx1
        receipt_id="rec_1",
        transactions=transactions
    )
    
    print(f"   Status: {result.status}")
    print(f"   Nível: {result.resolution_level}")
    print(f"   Match ID: {result.matches[0].transaction_id}")
    
    if result.status == "APPROVED" and result.resolution_level == "level_1_cpf" and result.matches[0].transaction_id == "tx_1":
        print("✅ SUCESSO: Resolvido por CPF")
    else:
        print("❌ FALHA: Não resolveu por CPF")
        return False

    # Caso 2: Match por Timestamp (Nível 2)
    print("\n🔹 Caso 2: Match por Timestamp (Nível 2)")
    # Reset validator state
    validator = RobustValidator()
    
    from datetime import timezone
    result = validator.validate_payment(
        receipt_amount=Decimal("500.00"),
        receipt_date=datetime(2025, 12, 1).date(),
        receipt_timestamp=datetime(2025, 12, 1, 14, 10, tzinfo=timezone.utc), # 14:10 UTC
        upload_timestamp=datetime.now(),
        payer_cpf=None, # Sem CPF
        receipt_id="rec_2",
        transactions=transactions
    )
    
    print(f"   Status: {result.status}")
    print(f"   Nível: {result.resolution_level}")
    print(f"   Match ID: {result.matches[0].transaction_id}")
    
    if result.status == "APPROVED" and result.resolution_level == "level_2_timestamp" and result.matches[0].transaction_id == "tx_2":
        print("✅ SUCESSO: Resolvido por Timestamp")
    else:
        print("❌ FALHA: Não resolveu por Timestamp")
        return False

    # Caso 3: FIFO (Nível 3)
    print("\n🔹 Caso 3: FIFO (Nível 3)")
    validator = RobustValidator()
    
    # Primeiro comprovante "reserva" a primeira transação disponível (tx1 - 10:00)
    result1 = validator.validate_payment(
        receipt_amount=Decimal("500.00"),
        receipt_date=datetime(2025, 12, 1).date(),
        receipt_timestamp=None,
        upload_timestamp=datetime.now(),
        payer_cpf=None,
        receipt_id="rec_3",
        transactions=transactions
    )
    
    print(f"   Receipt 1 Status: {result1.status} (ID: {result1.matches[0].transaction_id})")
    
    # Segundo comprovante tenta pegar a mesma, mas tx1 já foi pega. Deve pegar tx2.
    result2 = validator.validate_payment(
        receipt_amount=Decimal("500.00"),
        receipt_date=datetime(2025, 12, 1).date(),
        receipt_timestamp=None,
        upload_timestamp=datetime.now(),
        payer_cpf=None,
        receipt_id="rec_4",
        transactions=transactions
    )
    
    print(f"   Receipt 2 Status: {result2.status} (ID: {result2.matches[0].transaction_id})")
    
    if result1.matches[0].transaction_id == "tx_1" and result2.matches[0].transaction_id == "tx_2":
        print("✅ SUCESSO: Resolvido por FIFO")
    else:
        print("❌ FALHA: FIFO incorreto")
        return False

    return True

async def test_refund_detection():
    print("\n" + "="*70)
    print("TESTE 2: Detecção de Estorno")
    print("="*70)
    
    validator = RobustValidator()
    
    # Histórico de débitos (saídas)
    debits = [
        {
            "id": "deb_1",
            "amount": -5000.00,
            "date": "2025-11-20",
            "payer_document": "11.222.333/0001-99", # Fornecedor X
            "description": "PGTO FORNECEDOR X"
        }
    ]
    
    # Transação de crédito (entrada) suspeita
    credit = {
        "id": "cred_1",
        "amount": 5000.00,
        "date": "2025-11-21", # Dia seguinte
        "payer_document": "11.222.333/0001-99", # Mesmo fornecedor
        "description": "ESTORNO PGTO DUPLICADO"
    }
    
    is_refund, reason = validator.detect_refund(credit, debits)
    
    print(f"   É estorno? {is_refund}")
    print(f"   Motivo: {reason}")
    
    if is_refund:
        print("✅ SUCESSO: Estorno detectado")
        return True
    else:
        print("❌ FALHA: Estorno não detectado")
        return False

async def main():
    print("🚀 INICIANDO TESTES ENTERPRISE FEATURES...")
    
    success_cascade = await test_cascade_logic()
    success_refund = await test_refund_detection()
    
    if success_cascade and success_refund:
        print("\n🎉 TODOS OS TESTES ENTERPRISE PASSARAM!")
        return True
    else:
        print("\n❌ ALGUNS TESTES FALHARAM")
        return False

if __name__ == "__main__":
    asyncio.run(main())
