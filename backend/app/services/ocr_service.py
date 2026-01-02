import re
from typing import Dict, Any, Optional
from decimal import Decimal
from datetime import datetime, date
from PIL import Image
from io import BytesIO
import hashlib

# Note: For production, install pytesseract and tesseract-ocr
# pip install pytesseract pillow
# For now, we'll create a mock implementation that can be replaced

class OCRService:
    """
    OCR service for extracting structured data from receipts.
    Uses Tesseract OCR (or can be swapped for cloud OCR like Google Vision).
    """
    
    def __init__(self, use_tesseract: bool = False):
        self.use_tesseract = use_tesseract
        if use_tesseract:
            try:
                import pytesseract
                self.pytesseract = pytesseract
            except ImportError:
                print("Warning: pytesseract not installed. Using mock OCR.")
                self.use_tesseract = False
    
    async def process_receipt(self, file_content: bytes, file_type: str) -> Dict[str, Any]:
        """
        Process a receipt image/PDF and extract structured data.
        Returns OCR results with confidence scores.
        """
        try:
            if self.use_tesseract:
                return await self._process_with_tesseract(file_content, file_type)
            else:
                return self._mock_ocr(file_content)
        except Exception as e:
            return {
                'ocr_processado': False,
                'ocr_erro': str(e),
                'ocr_confianca': 0
            }
    
    async def _process_with_tesseract(self, file_content: bytes, file_type: str) -> Dict[str, Any]:
        """Real OCR processing with Tesseract"""
        # Convert to image
        if file_type == 'pdf':
            # For PDF, we'd need pdf2image library
            # For now, skip PDF processing
            raise NotImplementedError("PDF OCR requires pdf2image library")
        
        image = Image.open(BytesIO(file_content))
        
        # Perform OCR
        text = self.pytesseract.image_to_string(image, lang='por')
        
        # Extract structured data
        extracted = self._extract_fields(text)
        extracted['ocr_texto_completo'] = text
        extracted['ocr_processado'] = True
        
        return extracted
    
    def _mock_ocr(self, file_content: bytes) -> Dict[str, Any]:
        """
        Mock OCR for development without Tesseract.
        Returns realistic-looking data based on file hash.
        """
        file_hash = hashlib.md5(file_content).hexdigest()
        
        # Generate deterministic but varied mock data
        hash_int = int(file_hash[:8], 16)
        
        return {
            'ocr_processado': True,
            'ocr_confianca': Decimal('85.5'),
            'ocr_valor': Decimal(str((hash_int % 10000) / 100)),  # Random value 0-100
            'ocr_data': date(2024, (hash_int % 12) + 1, (hash_int % 28) + 1),
            'ocr_nsu': f"{hash_int % 1000000:06d}",
            'ocr_codigo_barras': None,
            'ocr_texto_completo': f"COMPROVANTE DE PAGAMENTO\\nValor: R$ {(hash_int % 10000) / 100:.2f}\\nData: {date(2024, (hash_int % 12) + 1, (hash_int % 28) + 1)}",
            'ocr_erro': None
        }
    
    def _extract_fields(self, text: str) -> Dict[str, Any]:
        """
        Extract structured fields from OCR text.
        Uses regex patterns to find valor, data, NSU, etc.
        """
        result = {
            'ocr_confianca': Decimal('70'),  # Base confidence
            'ocr_valor': None,
            'ocr_data': None,
            'ocr_nsu': None,
            'ocr_codigo_barras': None,
            'ocr_erro': None
        }
        
        # Extract valor (value)
        # Patterns: R$ 123,45 | 123.45 | R$123,45
        valor_patterns = [
            r'R\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})',  # R$ 1.234,56
            r'R\$?\s*(\d+,\d{2})',                    # R$ 123,45
            r'valor[:\s]+R?\$?\s*(\d+[,\.]\d{2})',   # Valor: 123,45
        ]
        
        for pattern in valor_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                valor_str = match.group(1).replace('.', '').replace(',', '.')
                try:
                    result['ocr_valor'] = Decimal(valor_str)
                    result['ocr_confianca'] += Decimal('10')
                    break
                except:
                    pass
        
        # Extract data (date)
        # Patterns: 01/12/2024 | 2024-12-01
        data_patterns = [
            r'(\d{2}[/-]\d{2}[/-]\d{4})',  # DD/MM/YYYY or DD-MM-YYYY
            r'(\d{4}[/-]\d{2}[/-]\d{2})',  # YYYY-MM-DD
        ]
        
        for pattern in data_patterns:
            match = re.search(pattern, text)
            if match:
                date_str = match.group(1)
                parsed_date = self._parse_date(date_str)
                if parsed_date:
                    result['ocr_data'] = parsed_date
                    result['ocr_confianca'] += Decimal('10')
                    break
        
        # Extract NSU
        # Pattern: NSU: 123456 | NSU 123456
        nsu_pattern = r'NSU[:\s]+(\d{6,})'
        match = re.search(nsu_pattern, text, re.IGNORECASE)
        if match:
            result['ocr_nsu'] = match.group(1)
            result['ocr_confianca'] += Decimal('10')
        
        # Extract código de barras (barcode)
        # Pattern: long sequence of digits
        barcode_pattern = r'(\d{44,48})'  # Typical Brazilian barcode length
        match = re.search(barcode_pattern, text)
        if match:
            result['ocr_codigo_barras'] = match.group(1)
            result['ocr_confianca'] += Decimal('5')
        
        # Cap confidence at 100
        result['ocr_confianca'] = min(result['ocr_confianca'], Decimal('100'))
        
        return result
    
    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse date from string"""
        formats = [
            '%d/%m/%Y',
            '%d-%m-%Y',
            '%Y-%m-%d',
            '%Y/%m/%d'
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
        
        return None
