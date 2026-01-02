"""
Script de Validação: OCR Service
Testa processamento OCR SEM Supabase
"""
import sys
from pathlib import Path
from datetime import datetime

# Adicionar path do backend
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from app.services.ocr_service import OCRService

async def test_ocr_service():
    """Testa serviço de OCR"""
    print("=" * 60)
    print("VALIDAÇÃO: Serviço de OCR")
    print(f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Criar arquivo de teste
    test_dir = Path(__file__).parent / "test_files"
    test_dir.mkdir(exist_ok=True)
    
    # PDF de teste
    pdf_path = test_dir / "test_receipt.pdf"
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n190\n%%EOF"
    pdf_path.write_bytes(pdf_content)
    
    # Teste 1: OCR com Mock (padrão)
    print("\n🤖 Teste 1: OCR com Mock (sem Tesseract)...")
    try:
        ocr_service = OCRService(use_tesseract=False)
        
        with open(pdf_path, 'rb') as f:
            file_content = f.read()
        
        result = await ocr_service.process_receipt(file_content, 'pdf')
        
        print(f"✅ OCR Mock executado!")
        print(f"   Processado: {result['ocr_processado']}")
        print(f"   Confiança: {result['ocr_confianca']}%")
        print(f"   Valor: R$ {result['ocr_valor']}")
        print(f"   Data: {result['ocr_data']}")
        print(f"   NSU: {result['ocr_nsu']}")
        
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n" + "=" * 60)
    print("✅ TODOS OS TESTES DE OCR PASSARAM!")
    print("=" * 60)
    print("\n📝 Nota:")
    print("   - OCR Mock está funcionando")
    print("   - Para OCR real, instale: pip install pytesseract pillow")
    print("   - E configure o Tesseract no sistema")
    
    return True

if __name__ == "__main__":
    import asyncio
    success = asyncio.run(test_ocr_service())
    sys.exit(0 if success else 1)
