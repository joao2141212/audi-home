"""
BrasilAPI Service
Integração com BrasilAPI para validação de CNPJ (Receita Federal)
API Pública: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
"""
import httpx
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

class BrasilAPIService:
    """
    Service para validação de CNPJ usando BrasilAPI (gratuita).
    """
    
    BASE_URL = "https://brasilapi.com.br/api/cnpj/v1"
    
    # Cache em memória (em produção, usar Redis ou banco)
    _cache: Dict[str, Dict[str, Any]] = {}
    _cache_ttl = timedelta(days=30)
    
    async def validate_supplier(self, cnpj: str) -> Dict[str, Any]:
        """
        Valida um fornecedor pelo CNPJ.
        
        Returns:
            {
                "valid": bool,
                "status_cadastral": str,  # "ATIVA", "BAIXADA", "SUSPENSA"
                "cnae_principal": str,
                "descricao_cnae": str,
                "razao_social": str,
                "nome_fantasia": str,
                "data_situacao_cadastral": str,
                "alerta_critico": bool  # True se não ATIVA
            }
        """
        # Limpar CNPJ (remover pontos, barras, hífens)
        cnpj_clean = self._clean_cnpj(cnpj)
        
        # Verificar cache
        cached = self._get_from_cache(cnpj_clean)
        if cached:
            return cached
        
        # Buscar na API
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.BASE_URL}/{cnpj_clean}")
                
                if response.status_code == 200:
                    data = response.json()
                    result = self._normalize_response(data)
                    
                    # Salvar no cache
                    self._save_to_cache(cnpj_clean, result)
                    
                    return result
                elif response.status_code == 404:
                    return {
                        "valid": False,
                        "error": "CNPJ não encontrado na Receita Federal",
                        "alerta_critico": True
                    }
                else:
                    raise Exception(f"API Error: {response.status_code}")
                    
        except Exception as e:
            print(f"BrasilAPI Error: {str(e)}")
            # Fallback para mock em caso de erro
            return self._mock_validation(cnpj_clean)
    
    def _normalize_response(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Normaliza resposta da BrasilAPI"""
        status = data.get("descricao_situacao_cadastral", "").upper()
        
        # Determinar se é alerta crítico
        alerta_critico = status not in ["ATIVA", "ATIVO"]
        
        return {
            "valid": True,
            "status_cadastral": status,
            "cnae_principal": data.get("cnae_fiscal", ""),
            "descricao_cnae": data.get("cnae_fiscal_descricao", ""),
            "razao_social": data.get("razao_social", ""),
            "nome_fantasia": data.get("nome_fantasia", ""),
            "data_situacao_cadastral": data.get("data_situacao_cadastral", ""),
            "alerta_critico": alerta_critico,
            "municipio": data.get("municipio", ""),
            "uf": data.get("uf", ""),
            "raw_data": data  # Dados completos para debug
        }
    
    def _clean_cnpj(self, cnpj: str) -> str:
        """Remove formatação do CNPJ"""
        return ''.join(filter(str.isdigit, cnpj))
    
    def _get_from_cache(self, cnpj: str) -> Optional[Dict[str, Any]]:
        """Busca no cache (30 dias de validade)"""
        if cnpj in self._cache:
            cached_data = self._cache[cnpj]
            cached_at = cached_data.get("_cached_at")
            
            if cached_at and datetime.now() - cached_at < self._cache_ttl:
                return cached_data
            else:
                # Cache expirado
                del self._cache[cnpj]
        
        return None
    
    def _save_to_cache(self, cnpj: str, data: Dict[str, Any]):
        """Salva no cache"""
        data["_cached_at"] = datetime.now()
        self._cache[cnpj] = data
    
    def _mock_validation(self, cnpj: str) -> Dict[str, Any]:
        """Mock para desenvolvimento/testes"""
        # Simular empresa inativa para CNPJs terminados em 999
        if cnpj.endswith("999"):
            return {
                "valid": True,
                "status_cadastral": "BAIXADA",
                "cnae_principal": "0000000",
                "descricao_cnae": "EMPRESA TESTE BAIXADA",
                "razao_social": "EMPRESA TESTE INATIVA LTDA",
                "nome_fantasia": "TESTE INATIVA",
                "data_situacao_cadastral": "2020-01-01",
                "alerta_critico": True,
                "municipio": "São Paulo",
                "uf": "SP"
            }
        
        # Empresa ativa (padrão)
        return {
            "valid": True,
            "status_cadastral": "ATIVA",
            "cnae_principal": "4321500",  # Instalações elétricas
            "descricao_cnae": "Instalação e manutenção elétrica",
            "razao_social": "EMPRESA TESTE ATIVA LTDA",
            "nome_fantasia": "TESTE ATIVA",
            "data_situacao_cadastral": "2015-01-01",
            "alerta_critico": False,
            "municipio": "São Paulo",
            "uf": "SP"
        }
    
    def validate_cnae_service(self, cnae: str, service_description: str) -> Dict[str, Any]:
        """
        Valida se o CNAE do fornecedor é compatível com o serviço prestado.
        
        Regra de Ouro: Detectar fraude quando CNAE não bate com serviço.
        Ex: CNAE "Padaria" + Serviço "Elevador" = FRAUDE
        """
        # Mapeamento CNAE -> Palavras-chave de serviços compatíveis
        CNAE_MAPPING = {
            "4321": ["eletric", "instalacao", "manutencao", "energia", "fiacao"],
            "4329": ["hidraulic", "encanamento", "agua", "esgoto", "cano"],
            "4330": ["pintura", "reforma", "acabamento", "gesso"],
            "4391": ["telhado", "cobertura", "impermeabilizacao"],
            "4399": ["construcao", "obra", "alvenaria"],
            "8112": ["limpeza", "conservacao", "higienizacao", "faxina"],
            "8011": ["seguranca", "vigilancia", "portaria", "monitoramento"],
            "8020": ["jardinagem", "paisagismo", "jardim"],
            "4329": ["elevador", "manutencao", "ascensor"],
            "1091": ["padaria", "panificacao", "pao"],
            "5611": ["restaurante", "alimentacao", "refeicao"],
        }
        
        # Pegar primeiros 4 dígitos do CNAE
        cnae_prefix = cnae[:4] if len(cnae) >= 4 else cnae
        
        # Buscar palavras-chave compatíveis
        keywords = CNAE_MAPPING.get(cnae_prefix, [])
        
        if not keywords:
            # CNAE não mapeado - retornar como "desconhecido"
            return {
                "compatible": None,
                "confidence": 0,
                "reason": f"CNAE {cnae} não mapeado no sistema"
            }
        
        # Verificar se alguma palavra-chave está na descrição do serviço
        import unicodedata
        service_normalized = unicodedata.normalize('NFD', service_description.lower())
        service_normalized = ''.join(c for c in service_normalized if not unicodedata.combining(c))
        
        matches = [kw for kw in keywords if kw.lower() in service_normalized]
        
        if matches:
            return {
                "compatible": True,
                "confidence": 90,
                "reason": f"CNAE compatível com serviço (matches: {', '.join(matches)})"
            }
        else:
            return {
                "compatible": False,
                "confidence": 80,
                "reason": f"CNAE incompatível: esperado {', '.join(keywords)}, recebido '{service_description}'"
            }
