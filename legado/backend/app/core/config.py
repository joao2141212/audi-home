from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Auditoria Financeira Condomínio"
    API_V1_STR: str = "/api/v1"
    
    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str
    
    # External APIs
    OPEN_BANKING_CLIENT_ID: Optional[str] = None
    OPEN_BANKING_CLIENT_SECRET: Optional[str] = None
    
    # Pluggy (Open Finance)
    PLUGGY_CLIENT_ID: str = ""
    PLUGGY_CLIENT_SECRET: str = ""
    
    # Belvo (Open Finance - Alternative)
    BELVO_SECRET_ID: str = ""
    BELVO_SECRET_PASSWORD: str = ""
    
    # CNPJ.ws (Validação de Fornecedores)
    CNPJ_WS_TOKEN: str = ""  # Opcional: Token da versão paga
    
    # RFB Validator (Legacy - pode remover)
    DBDIRETO_API_KEY: str = ""
    
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

@lru_cache
def get_settings():
    return Settings()
