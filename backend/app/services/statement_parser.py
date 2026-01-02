import hashlib
import pandas as pd
from io import BytesIO
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, date
from decimal import Decimal
import re

class StatementParser:
    """
    Parses bank statements in multiple formats (CSV, OFX, PDF).
    Normalizes data to a standard transaction format.
    """
    
    def __init__(self):
        self.supported_formats = ['csv', 'ofx', 'pdf']
    
    def calculate_file_hash(self, file_content: bytes) -> str:
        """Calculate SHA-256 hash of file for deduplication"""
        return hashlib.sha256(file_content).hexdigest()
    
    def parse_csv(self, file_content: bytes) -> Tuple[List[Dict[str, Any]], date, date]:
        """
        Parse CSV bank statement.
        Expected columns: data, descricao, valor, tipo (or similar variations)
        Returns: (transactions, periodo_inicio, periodo_fim)
        """
        try:
            df = pd.read_csv(BytesIO(file_content), encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(BytesIO(file_content), encoding='latin-1')
        
        # Normalize column names
        df.columns = [self._normalize_column_name(col) for col in df.columns]
        
        # Map common column variations
        column_mapping = {
            'data': ['data', 'date', 'data_transacao', 'dt_transacao'],
            'descricao': ['descricao', 'historico', 'description', 'desc'],
            'valor': ['valor', 'value', 'amount', 'montante'],
            'tipo': ['tipo', 'type', 'natureza', 'dc']
        }
        
        # Find actual column names
        actual_columns = {}
        for key, variations in column_mapping.items():
            for var in variations:
                if var in df.columns:
                    actual_columns[key] = var
                    break
        
        if 'data' not in actual_columns or 'valor' not in actual_columns:
            raise ValueError("CSV must contain at least 'data' and 'valor' columns")
        
        # Parse transactions
        transactions = []
        for _, row in df.iterrows():
            data_str = str(row[actual_columns['data']])
            valor_str = str(row[actual_columns['valor']])
            
            # Parse date (try multiple formats)
            data_transacao = self._parse_date(data_str)
            if not data_transacao:
                continue
            
            # Parse value
            valor = self._parse_decimal(valor_str)
            if valor is None:
                continue
            
            # Determine tipo (credito/debito)
            tipo = 'credito' if valor > 0 else 'debito'
            if 'tipo' in actual_columns:
                tipo_str = str(row[actual_columns['tipo']]).lower()
                if tipo_str in ['c', 'credito', 'credit']:
                    tipo = 'credito'
                elif tipo_str in ['d', 'debito', 'debit']:
                    tipo = 'debito'
            
            # Description
            descricao = str(row[actual_columns.get('descricao', actual_columns['valor'])]) if 'descricao' in actual_columns else None
            
            transactions.append({
                'data_transacao': data_transacao,
                'valor': abs(valor),
                'tipo': tipo,
                'descricao': descricao,
                'nsu': None,  # CSV usually doesn't have NSU
                'codigo_barras': None,
                'conta_origem': None,
                'conta_destino': None
            })
        
        # Determine period
        dates = [t['data_transacao'] for t in transactions]
        periodo_inicio = min(dates) if dates else None
        periodo_fim = max(dates) if dates else None
        
        return transactions, periodo_inicio, periodo_fim
    
    def parse_ofx(self, file_content: bytes) -> Tuple[List[Dict[str, Any]], date, date]:
        """
        Parse OFX bank statement.
        OFX is a structured format used by many banks.
        """
        # This is a simplified implementation
        # In production, use a library like ofxparse
        raise NotImplementedError("OFX parsing requires ofxparse library. Use CSV for now.")
    
    def parse_pdf(self, file_content: bytes) -> Tuple[List[Dict[str, Any]], date, date]:
        """
        Parse PDF bank statement using tabula-py.
        This is the most complex format as PDFs vary widely.
        """
        # This requires tabula-py and Java
        # For MVP, we'll skip this and focus on CSV
        raise NotImplementedError("PDF parsing requires tabula-py. Use CSV for now.")
    
    def _normalize_column_name(self, col: str) -> str:
        """Normalize column name to lowercase, no spaces"""
        return col.lower().strip().replace(' ', '_')
    
    def _parse_date(self, date_str: str) -> Optional[date]:
        """Try to parse date from various formats"""
        formats = [
            '%Y-%m-%d',
            '%d/%m/%Y',
            '%m/%d/%Y',
            '%d-%m-%Y',
            '%Y/%m/%d'
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
        
        return None
    
    def _parse_decimal(self, value_str: str) -> Optional[Decimal]:
        """Parse decimal value from string"""
        try:
            # Remove currency symbols and spaces
            cleaned = re.sub(r'[R$\s]', '', value_str)
            # Replace comma with dot if it's the decimal separator
            if ',' in cleaned and '.' not in cleaned:
                cleaned = cleaned.replace(',', '.')
            elif ',' in cleaned and '.' in cleaned:
                # European format: 1.234,56 -> 1234.56
                cleaned = cleaned.replace('.', '').replace(',', '.')
            
            return Decimal(cleaned)
        except:
            return None
