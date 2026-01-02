"""
CNPJ Service - Serviço Agnóstico
Gerencia validação de CNPJ com cache e múltiplos providers
"""
from typing import Optional
from datetime import datetime, timedelta
from app.services.cnpj.base import CNPJProvider, SupplierData, CNPJNotFoundError, CNPJAPIError
from app.services.cnpj.cnpjws_provider import CNPJWSProvider
from app.core.config import get_settings

settings = get_settings()

class CNPJService:
    """
    Serviço agnóstico para validação de CNPJ.
    Usa Provider Pattern para permitir troca fácil de API.
    """
    
    # Cache em memória (em produção, usar Redis ou banco)
    _cache = {}
    _cache_ttl = timedelta(days=30)
    
    def __init__(self, provider: Optional[CNPJProvider] = None):
        """
        Args:
            provider: Provider customizado (opcional)
        """
        if provider:
            self.provider = provider
        else:
            # Provider padrão: CNPJ.ws
            token = getattr(settings, 'CNPJ_WS_TOKEN', None)
            self.provider = CNPJWSProvider(token=token)
    
    async def validate_cnpj(self, cnpj: str) -> SupplierData:
        """
        Valida um CNPJ.
        
        1. Verifica cache (30 dias)
        2. Se não está em cache, consulta provider
        3. Salva no cache
        
        Args:
            cnpj: CNPJ a validar
            
        Returns:
            SupplierData com informações do fornecedor
        """
        # Limpar CNPJ
        cnpj_clean = self._clean_cnpj(cnpj)
        
        # Verificar cache
        cached_data = self._get_from_cache(cnpj_clean)
        if cached_data:
            print(f"[CNPJ Service] Cache HIT para {cnpj_clean}")
            cached_data.cached = True
            return cached_data
        
        # Consultar provider
        print(f"[CNPJ Service] Validando CNPJ {cnpj_clean} via {self.provider.get_provider_name()}...")
        
        try:
            supplier_data = await self.provider.validate_cnpj(cnpj_clean)
            
            # Salvar no cache
            self._save_to_cache(cnpj_clean, supplier_data)
            
            print(f"[CNPJ Service] ✅ {supplier_data.razao_social} - Status: {supplier_data.status_receita}")
            
            return supplier_data
            
        except CNPJNotFoundError as e:
            print(f"[CNPJ Service] ❌ CNPJ não encontrado: {cnpj_clean}")
            raise
        except CNPJAPIError as e:
            print(f"[CNPJ Service] ⚠️  Erro na API: {str(e)}")
            raise
    
    def is_supplier_active(self, supplier_data: SupplierData) -> bool:
        """
        Verifica se fornecedor está ativo (apto para receber pagamentos)
        """
        return supplier_data.status_receita == "ATIVA"
    
    def get_risk_level(self, supplier_data: SupplierData) -> str:
        """
        Determina nível de risco do fornecedor
        
        Returns:
            "OK", "WARNING", "CRITICAL_RISK"
        """
        if supplier_data.status_receita == "ATIVA":
            return "OK"
        elif supplier_data.status_receita in ["SUSPENSA", "INAPTA"]:
            return "WARNING"
        else:  # BAIXADA, NULA
            return "CRITICAL_RISK"
    
    def _clean_cnpj(self, cnpj: str) -> str:
        """Remove formatação do CNPJ"""
        return ''.join(filter(str.isdigit, cnpj))
    
    def _get_from_cache(self, cnpj: str) -> Optional[SupplierData]:
        """Busca no cache (30 dias de validade)"""
        if cnpj in self._cache:
            cached_entry = self._cache[cnpj]
            cached_at = cached_entry.get("cached_at")
            
            if cached_at and datetime.now() - cached_at < self._cache_ttl:
                return cached_entry.get("data")
            else:
                # Cache expirado
                del self._cache[cnpj]
        
        return None
    
    def _save_to_cache(self, cnpj: str, data: SupplierData):
        """Salva no cache"""
        self._cache[cnpj] = {
            "data": data,
            "cached_at": datetime.now()
        }
        print(f"[CNPJ Service] Cache SAVE para {cnpj} (válido por 30 dias)")
    
    def clear_cache(self, cnpj: Optional[str] = None):
        """
        Limpa cache
        
        Args:
            cnpj: Se fornecido, limpa apenas esse CNPJ. Senão, limpa tudo.
        """
        if cnpj:
            cnpj_clean = self._clean_cnpj(cnpj)
            if cnpj_clean in self._cache:
                del self._cache[cnpj_clean]
                print(f"[CNPJ Service] Cache cleared para {cnpj_clean}")
        else:
            self._cache.clear()
            print(f"[CNPJ Service] Cache cleared (all)")
