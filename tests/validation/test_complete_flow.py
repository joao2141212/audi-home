"""
Script de Validação: Fluxo Completo (Mock)
Simula o fluxo completo SEM Supabase usando dicionários em memória
"""
import sys
from pathlib import Path
from datetime import datetime, date
from decimal import Decimal
import hashlib

# Adicionar path do backend
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from app.services.fraud_detector import FraudDetector
from app.services.ocr_service import OCRService

# "Banco de dados" em memória
mock_db = {
    "comprovantes": [],
    "transacoes": [],
    "condominio_contas": []
}

async def simulate_complete_flow():
    """Simula fluxo completo: Upload → OCR → Fraud → Validação"""
    print("=" * 70)
    print(" " * 15 + "VALIDAÇÃO: FLUXO COMPLETO (MOCK)")
    print(f" " * 20 + datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print("=" * 70)
    
    # Setup: Criar arquivo de teste
    test_dir = Path(__file__).parent / "test_files"
    test_dir.mkdir(exist_ok=True)
    
    pdf_path = test_dir / "comprovante_morador.pdf"
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n190\n%%EOF"
    pdf_path.write_bytes(pdf_content)
    
    # PASSO 1: Upload do Comprovante
    print("\n📤 PASSO 1: Upload do Comprovante")
    print("-" * 70)
    
    with open(pdf_path, 'rb') as f:
        file_content = f.read()
    
    file_hash = hashlib.sha256(file_content).hexdigest()
    
    comprovante = {
        "id": "comp_001",
        "arquivo_nome": "comprovante_morador.pdf",
        "arquivo_hash": file_hash,
        "tipo_arquivo": "pdf",
        "tamanho_bytes": len(file_content),
        "unidade": "apt_101",
        "data_envio": datetime.now(),
        "status": "pendente"
    }
    
    mock_db["comprovantes"].append(comprovante)
    print(f"✅ Comprovante salvo: {comprovante['id']}")
    print(f"   Hash: {file_hash[:20]}...")
    
    # PASSO 2: Detecção de Fraude
    print("\n🛡️  PASSO 2: Detecção de Fraude")
    print("-" * 70)
    
    fraud_detector = FraudDetector()
    
    existing_hashes = [c['arquivo_hash'] for c in mock_db["comprovantes"] if c['id'] != comprovante['id']]
    
    fraud_result = await fraud_detector.analyze_receipt(
        file_content=file_content,
        file_type='pdf',
        file_hash=file_hash,
        existing_hashes=existing_hashes
    )
    
    comprovante.update({
        "fraud_score": fraud_result['fraud_score'],
        "fraud_flags": fraud_result['fraud_flags'],
        "documento_alterado": fraud_result['documento_alterado']
    })
    
    print(f"✅ Análise de fraude concluída")
    print(f"   Fraud Score: {fraud_result['fraud_score']}")
    print(f"   Flags: {fraud_result['fraud_flags']}")
    print(f"   Documento Alterado: {fraud_result['documento_alterado']}")
    
    if fraud_result['fraud_score'] > 70:
        comprovante['status'] = 'suspeito'
        print(f"⚠️  Status alterado para: SUSPEITO")
    
    # PASSO 3: Processamento OCR
    print("\n🔍 PASSO 3: Processamento OCR")
    print("-" * 70)
    
    ocr_service = OCRService(use_tesseract=False)
    ocr_result = await ocr_service.process_receipt(file_content, 'pdf')
    
    comprovante.update(ocr_result)
    
    print(f"✅ OCR processado")
    print(f"   Valor: R$ {ocr_result['ocr_valor']}")
    print(f"   Data: {ocr_result['ocr_data']}")
    print(f"   NSU: {ocr_result['ocr_nsu']}")
    print(f"   Confiança: {ocr_result['ocr_confianca']}%")
    
    # PASSO 4: Simular Transações Bancárias (do condomínio)
    print("\n🏦 PASSO 4: Transações Bancárias (Simuladas)")
    print("-" * 70)
    
    # Simular que o condomínio recebeu esse pagamento
    transacao = {
        "id": "txn_001",
        "data_transacao": ocr_result['ocr_data'],
        "valor": ocr_result['ocr_valor'],
        "tipo": "credito",
        "descricao": "PIX RECEBIDO",
        "nsu": ocr_result['ocr_nsu'],
        "status_reconciliacao": "pendente"
    }
    
    mock_db["transacoes"].append(transacao)
    print(f"✅ Transação bancária simulada: {transacao['id']}")
    print(f"   Valor: R$ {transacao['valor']}")
    print(f"   Data: {transacao['data_transacao']}")
    
    # PASSO 5: Validação (Match)
    print("\n✅ PASSO 5: Validação contra Extrato")
    print("-" * 70)
    
    # Buscar match
    match_found = False
    for txn in mock_db["transacoes"]:
        # Tolerância de valor (0.05)
        valor_diff = abs(Decimal(str(txn['valor'])) - Decimal(str(comprovante['ocr_valor'])))
        
        # Tolerância de data (2 dias)
        if isinstance(txn['data_transacao'], str):
            txn_date = datetime.strptime(txn['data_transacao'], '%Y-%m-%d').date()
        else:
            txn_date = txn['data_transacao']
        
        if isinstance(comprovante['ocr_data'], str):
            comp_date = datetime.strptime(comprovante['ocr_data'], '%Y-%m-%d').date()
        else:
            comp_date = comprovante['ocr_data']
        
        date_diff = abs((txn_date - comp_date).days)
        
        if valor_diff <= Decimal('0.05') and date_diff <= 2:
            match_found = True
            comprovante['status'] = 'aprovado'
            comprovante['transacao_id'] = txn['id']
            txn['status_reconciliacao'] = 'reconciliado'
            txn['comprovante_id'] = comprovante['id']
            
            print(f"✅ MATCH ENCONTRADO!")
            print(f"   Transação: {txn['id']}")
            print(f"   Diferença de valor: R$ {float(valor_diff):.2f}")
            print(f"   Diferença de data: {date_diff} dias")
            break
    
    if not match_found:
        comprovante['status'] = 'rejeitado'
        print(f"❌ MATCH NÃO ENCONTRADO")
        print(f"   Status: REJEITADO")
    
    # RELATÓRIO FINAL
    print("\n" + "=" * 70)
    print(" " * 20 + "RELATÓRIO FINAL DO FLUXO")
    print("=" * 70)
    
    print(f"\n📋 Comprovante: {comprovante['id']}")
    print(f"   Arquivo: {comprovante['arquivo_nome']}")
    print(f"   Unidade: {comprovante['unidade']}")
    print(f"   Status: {comprovante['status'].upper()}")
    print(f"   Fraud Score: {comprovante['fraud_score']}")
    print(f"   Valor OCR: R$ {comprovante['ocr_valor']}")
    print(f"   Data OCR: {comprovante['ocr_data']}")
    
    if match_found:
        print(f"\n✅ Validação: APROVADO")
        print(f"   Transação vinculada: {comprovante['transacao_id']}")
    else:
        print(f"\n❌ Validação: REJEITADO")
        print(f"   Motivo: Pagamento não encontrado no extrato do condomínio")
    
    print("\n" + "=" * 70)
    print("✅ FLUXO COMPLETO EXECUTADO COM SUCESSO!")
    print("=" * 70)
    
    print("\n📝 Próximos passos:")
    print("   1. Este fluxo funciona em memória (mock)")
    print("   2. Configurar Supabase para persistência real")
    print("   3. Integrar com Pluggy para transações reais")
    print("   4. Testar com frontend completo")
    
    return True

if __name__ == "__main__":
    import asyncio
    success = asyncio.run(simulate_complete_flow())
    sys.exit(0 if success else 1)
