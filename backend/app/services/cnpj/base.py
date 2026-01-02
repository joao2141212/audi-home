"""
CNPJ Service - Provider Pattern
Serviço agnóstico para validação de CNPJ com múltiplos provedores
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from pydantic import BaseModel
from datetime import date

class CNAEData(BaseModel):
    """Dados do CNAE"""
    codigo: str
    descricao: str

class SupplierData(BaseModel):
    """
    Modelo padronizado de dados de fornecedor.
    Independente do provider usado.
    """
    cnpj: str
    razao_social: str
    nome_fantasia: Optional[str] = None
    status_receita: str  # "ATIVA", "BAIXADA", "SUSPENSA", "INAPTA"
    cnae_principal: CNAEData
    logradouro: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    data_situacao_cadastral: Optional[str] = None
    
    # Metadados
    provider: str  # Nome do provider usado
    cached: bool = False  # Se veio do cache
    
    # Dados completos (para debug)
    raw_data: Optional[Dict[str, Any]] = None

class CNPJProvider(ABC):
    """
    Interface base para provedores de validação de CNPJ.
    Qualquer provider (CNPJ.ws, BrasilAPI, ReceitaWS, etc) deve implementar esta interface.
    """
    
    @abstractmethod
    async def validate_cnpj(self, cnpj: str) -> SupplierData:
        """
        Valida um CNPJ e retorna dados padronizados.
        
        Args:
            cnpj: CNPJ a ser validado (com ou sem formatação)
            
        Returns:
            SupplierData com informações do fornecedor
            
        Raises:
            CNPJNotFoundError: Se CNPJ não existe
            CNPJAPIError: Se houver erro na API
        """
        pass
    
    @abstractmethod
    def get_provider_name(self) -> str:
        """Retorna o nome do provider"""
        pass

class CNPJNotFoundError(Exception):
    """CNPJ não encontrado na Receita Federal"""
    pass

class CNPJAPIError(Exception):
    """Erro ao consultar API de CNPJ"""
    pass

class CNPJRateLimitError(Exception):
    """Rate limit atingido"""
    pass
