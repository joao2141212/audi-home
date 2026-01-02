"""
Fraud Detection Service
Detects tampering, duplicates, and suspicious patterns in receipts.
"""
import hashlib
from typing import Dict, List, Any, Optional
from datetime import datetime
from PIL import Image
from PIL.ExifTags import TAGS
from io import BytesIO
import re

class FraudDetector:
    """
    Detects fraud in receipt documents through multiple strategies:
    1. Metadata analysis (EXIF/PDF)
    2. Duplicate detection
    3. Document tampering detection
    4. Barcode validation
    """
    
    # Suspicious software that indicates editing
    SUSPICIOUS_SOFTWARE = [
        'photoshop', 'gimp', 'canva', 'pixlr', 'paint.net',
        'ilovepdf', 'smallpdf', 'pdf24', 'sejda'
    ]
    
    # Trusted bank software signatures
    TRUSTED_BANK_SOFTWARE = [
        'itau', 'bradesco', 'santander', 'banco do brasil',
        'caixa', 'nubank', 'inter', 'sicoob', 'sicredi'
    ]
    
    def __init__(self):
        self.fraud_flags: List[str] = []
        self.fraud_score: float = 0.0
    
    async def analyze_receipt(
        self, 
        file_content: bytes, 
        file_type: str,
        file_hash: str,
        existing_hashes: List[str]
    ) -> Dict[str, Any]:
        """
        Comprehensive fraud analysis of a receipt.
        Returns fraud_score (0-100) and list of flags.
        """
        self.fraud_flags = []
        self.fraud_score = 0.0
        
        # 1. Duplicate detection
        if file_hash in existing_hashes:
            self.fraud_flags.append("duplicate_file")
            self.fraud_score += 40
        
        # 2. Metadata analysis
        if file_type in ['jpg', 'jpeg', 'png']:
            metadata_result = self._analyze_image_metadata(file_content)
            self.fraud_flags.extend(metadata_result['flags'])
            self.fraud_score += metadata_result['score']
        elif file_type == 'pdf':
            metadata_result = self._analyze_pdf_metadata(file_content)
            self.fraud_flags.extend(metadata_result['flags'])
            self.fraud_score += metadata_result['score']
        
        # 3. File size anomalies
        size_result = self._check_file_size(file_content, file_type)
        if size_result['suspicious']:
            self.fraud_flags.append(size_result['reason'])
            self.fraud_score += 10
        
        # Cap score at 100
        self.fraud_score = min(self.fraud_score, 100)
        
        return {
            'fraud_score': self.fraud_score,
            'fraud_flags': self.fraud_flags,
            'documento_alterado': self.fraud_score > 50
        }
    
    def _analyze_image_metadata(self, file_content: bytes) -> Dict[str, Any]:
        """Analyze EXIF metadata from images"""
        flags = []
        score = 0.0
        
        try:
            image = Image.open(BytesIO(file_content))
            exif_data = image._getexif()
            
            if not exif_data:
                # No EXIF data is suspicious for bank receipts
                flags.append("no_exif_data")
                score += 15
                return {'flags': flags, 'score': score}
            
            # Extract metadata
            metadata = {}
            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, tag_id)
                metadata[tag] = value
            
            # Check for editing software
            software = str(metadata.get('Software', '')).lower()
            if any(sus in software for sus in self.SUSPICIOUS_SOFTWARE):
                flags.append(f"edited_with_{software}")
                score += 30
            
            # Check modification date vs creation date
            date_time = metadata.get('DateTime')
            date_time_original = metadata.get('DateTimeOriginal')
            
            if date_time and date_time_original:
                if date_time != date_time_original:
                    flags.append("modified_after_creation")
                    score += 20
            
            # Check for screenshot indicators
            if 'Screenshot' in str(metadata.get('UserComment', '')):
                flags.append("screenshot_detected")
                score += 25
                
        except Exception as e:
            # If we can't read EXIF, it might be stripped (suspicious)
            flags.append("exif_read_error")
            score += 10
        
        return {'flags': flags, 'score': score}
    
    def _analyze_pdf_metadata(self, file_content: bytes) -> Dict[str, Any]:
        """Analyze PDF metadata"""
        flags = []
        score = 0.0
        
        try:
            # Simple PDF metadata extraction (without PyPDF2 for now)
            # Look for Creator/Producer in PDF header
            content_str = file_content[:2000].decode('latin-1', errors='ignore')
            
            # Extract Creator
            creator_match = re.search(r'/Creator\s*\((.*?)\)', content_str)
            if creator_match:
                creator = creator_match.group(1).lower()
                
                # Check if created by suspicious software
                if any(sus in creator for sus in self.SUSPICIOUS_SOFTWARE):
                    flags.append(f"pdf_created_with_editor")
                    score += 35
                
                # Check if created by trusted bank software
                if any(bank in creator for bank in self.TRUSTED_BANK_SOFTWARE):
                    # This is good, reduce suspicion
                    score -= 10
            else:
                # No creator metadata is suspicious
                flags.append("no_pdf_creator")
                score += 15
            
            # Check for modification date
            mod_date_match = re.search(r'/ModDate\s*\((.*?)\)', content_str)
            creation_date_match = re.search(r'/CreationDate\s*\((.*?)\)', content_str)
            
            if mod_date_match and creation_date_match:
                mod_date = mod_date_match.group(1)
                creation_date = creation_date_match.group(1)
                
                if mod_date != creation_date:
                    flags.append("pdf_modified_after_creation")
                    score += 20
                    
        except Exception as e:
            flags.append("pdf_metadata_error")
            score += 5
        
        return {'flags': flags, 'score': score}
    
    def _check_file_size(self, file_content: bytes, file_type: str) -> Dict[str, Any]:
        """Check for suspicious file sizes"""
        size = len(file_content)
        
        # Typical bank receipt sizes
        if file_type == 'pdf':
            # Bank PDFs are usually 50KB - 500KB
            if size < 10_000:  # Less than 10KB
                return {'suspicious': True, 'reason': 'file_too_small'}
            if size > 5_000_000:  # More than 5MB
                return {'suspicious': True, 'reason': 'file_too_large'}
        
        elif file_type in ['jpg', 'jpeg', 'png']:
            # Screenshots are usually 100KB - 2MB
            if size < 5_000:  # Less than 5KB
                return {'suspicious': True, 'reason': 'image_too_small'}
            if size > 10_000_000:  # More than 10MB
                return {'suspicious': True, 'reason': 'image_too_large'}
        
        return {'suspicious': False, 'reason': None}
    
    def validate_barcode(self, barcode: str, expected_value: Optional[float] = None) -> Dict[str, Any]:
        """
        Validate Brazilian bank barcode (boleto).
        Returns validation result and extracted value.
        """
        if not barcode or len(barcode) not in [44, 47, 48]:
            return {'valid': False, 'reason': 'invalid_length'}
        
        # Remove spaces and dots
        barcode = re.sub(r'[\s\.]', '', barcode)
        
        # For Brazilian boletos, the value is encoded in positions 37-47 (in centavos)
        try:
            if len(barcode) >= 44:
                # Extract value (simplified - real implementation needs full barcode parsing)
                value_str = barcode[37:47]
                value_centavos = int(value_str)
                value_reais = value_centavos / 100
                
                # If we have an expected value, compare
                if expected_value:
                    tolerance = expected_value * 0.01  # 1% tolerance
                    if abs(value_reais - expected_value) > tolerance:
                        return {
                            'valid': False,
                            'reason': 'value_mismatch',
                            'barcode_value': value_reais,
                            'expected_value': expected_value
                        }
                
                return {
                    'valid': True,
                    'barcode_value': value_reais
                }
        except:
            return {'valid': False, 'reason': 'parsing_error'}
        
        return {'valid': True}
    
    def check_semantic_duplicate(
        self, 
        ocr_text: str, 
        existing_texts: List[str],
        similarity_threshold: float = 0.9
    ) -> bool:
        """
        Check if OCR text is semantically similar to existing receipts.
        This catches cases where someone edits the PDF but the text is almost identical.
        """
        if not ocr_text or not existing_texts:
            return False
        
        # Simple similarity check (in production, use fuzzy matching or embeddings)
        ocr_normalized = self._normalize_text(ocr_text)
        
        for existing in existing_texts:
            existing_normalized = self._normalize_text(existing)
            similarity = self._calculate_similarity(ocr_normalized, existing_normalized)
            
            if similarity >= similarity_threshold:
                return True
        
        return False
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text for comparison"""
        # Remove numbers (dates, values change but structure stays same)
        text = re.sub(r'\d+', '', text)
        # Remove special chars
        text = re.sub(r'[^\w\s]', '', text)
        # Lowercase and strip
        return text.lower().strip()
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Simple Jaccard similarity"""
        if not text1 or not text2:
            return 0.0
        
        words1 = set(text1.split())
        words2 = set(text2.split())
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        if not union:
            return 0.0
        
        return len(intersection) / len(union)
