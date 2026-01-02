"""
CNPJ.ws Provider
Implementação do provider usando CNPJ.ws (grátis e pago)
"""
import httpx
import asyncio
from typing import Dict, Any
from datetime import datetime
from app.services.cnpj.base import (
    CNPJProvider, 
    SupplierData, 
    CNAEData,
    CNPJNotFoundError,
    CNPJAPIError,
    CNPJRateLimitError
)

class CNPJWSProvider(CNPJProvider):
    """
    Provider para CNPJ.ws
    
    Versão Grátis: 3 req/minuto (sem token)
    Versão Paga: Sem limite (com token)
    """
    
    BASE_URL_PUBLIC = "https://publica.cnpj.ws/cnpj"
    BASE_URL_COMMERCIAL = "https://comercial.cnpj.ws/cnpj"
    
    def __init__(self, token: str = None):
        """
        Args:
            token: Token da versão paga (opcional)
        """
        self.token = token
        self.is_paid = bool(token)
        self.base_url = self.BASE_URL_COMMERCIAL if self.is_paid else self.BASE_URL_PUBLIC
        
        # Rate limiting (apenas para versão grátis)
        self._last_request_time = None
        self._min_interval = 20  # 20 segundos entre requests (3/min)
    
    def get_provider_name(self) -> str:
        return f"CNPJ.ws ({'Pago' if self.is_paid else 'Grátis'})"
    
    async def validate_cnpj(self, cnpj: str) -> SupplierData:
        """
        Valida CNPJ usando CNPJ.ws
        """
        # Limpar CNPJ
        cnpj_clean = self._clean_cnpj(cnpj)
        
        # Rate limiting (apenas versão grátis)
        if not self.is_paid:
            await self._apply_rate_limit()
        
        # Fazer request
        try:
            url = f"{self.base_url}/{cnpj_clean}"
            
            # Adicionar token se versão paga
            params = {}
            if self.is_paid:
                params['token'] = self.token
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)
                
                # Tratar rate limit
                if response.status_code == 429:
                    raise CNPJRateLimitError("Rate limit atingido. Aguarde alguns segundos.")
                
                # CNPJ não encontrado
                if response.status_code == 404:
                    raise CNPJNotFoundError(f"CNPJ {cnpj} não encontrado na Receita Federal")
                
                # Outros erros
                if response.status_code != 200:
                    raise CNPJAPIError(f"Erro na API CNPJ.ws: {response.status_code}")
                
                data = response.json()
                
                # Normalizar resposta
                return self._normalize_response(data, cnpj_clean)
                
        except (CNPJNotFoundError, CNPJRateLimitError, CNPJAPIError):
            raise
        except Exception as e:
            raise CNPJAPIError(f"Erro ao consultar CNPJ.ws: {str(e)}")
    
    def _normalize_response(self, data: Dict[str, Any], cnpj: str) -> SupplierData:
        """
        Normaliza resposta da CNPJ.ws para o modelo padrão
        
        Estrutura CNPJ.ws:
        {
          "razao_social": "...",
          "estabelecimento": {
            "situacao_cadastral": "02",  # 02 = Ativa
            "nome_fantasia": "...",
            "logradouro": "...",
            "municipio": "...",
            "uf": "...",
            "data_situacao_cadastral": "2015-01-01",
            "atividade_principal": {
              "id": "4321500",
              "descricao": "Instalação elétrica"
            }
          }
        }
        """
        estabelecimento = data.get('estabelecimento', {})
        
        # Mapear situação cadastral
        # A API pode retornar código ("02") ou texto ("Ativa")
        situacao_map_codigo = {
            "01": "NULA",
            "02": "ATIVA",
            "03": "SUSPENSA",
            "04": "INAPTA",
            "08": "BAIXADA"
        }
        
        situacao_map_texto = {
            "nula": "NULA",
            "ativa": "ATIVA",
            "suspensa": "SUSPENSA",
            "inapta": "INAPTA",
            "baixada": "BAIXADA"
        }
        
        situacao_raw = str(estabelecimento.get('situacao_cadastral', '02'))
        
        # Tentar código primeiro, depois texto
        status_receita = situacao_map_codigo.get(situacao_raw)
        if not status_receita:
            # Tentar texto (case-insensitive)
            status_receita = situacao_map_texto.get(situacao_raw.lower(), "DESCONHECIDA")
        
        # CNAE principal
        atividade = estabelecimento.get('atividade_principal', {})
        cnae = CNAEData(
            codigo=str(atividade.get('id', '')),
            descricao=atividade.get('descricao', '')
        )
        
        return SupplierData(
            cnpj=cnpj,
            razao_social=data.get('razao_social', ''),
            nome_fantasia=estabelecimento.get('nome_fantasia'),
            status_receita=status_receita,
            cnae_principal=cnae,
            logradouro=estabelecimento.get('logradouro'),
            municipio=estabelecimento.get('municipio'),
            uf=estabelecimento.get('uf'),
            data_situacao_cadastral=estabelecimento.get('data_situacao_cadastral'),
            provider=self.get_provider_name(),
            cached=False,
            raw_data=data
        )
    
    async def _apply_rate_limit(self):
        """
        Aplica rate limiting para versão grátis (3 req/min)
        """
        if self._last_request_time:
            elapsed = (datetime.now() - self._last_request_time).total_seconds()
            
            if elapsed < self._min_interval:
                wait_time = self._min_interval - elapsed
                print(f"[CNPJ.ws] Rate limit: aguardando {wait_time:.1f}s...")
                await asyncio.sleep(wait_time)
        
        self._last_request_time = datetime.now()
    
    def _clean_cnpj(self, cnpj: str) -> str:
        """Remove formatação do CNPJ"""
        return ''.join(filter(str.isdigit, cnpj))
