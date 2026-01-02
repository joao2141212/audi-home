import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from app.core.config import get_settings
import urllib3

# Suprimir warnings de SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

settings = get_settings()

def create_session():
    """Cria uma sessão HTTP com retry configurado"""
    session = requests.Session()
    
    # Configurar retry
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[500, 502, 503, 504],
    )
    
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    
    return session

class PluggyService:
    """
    Service to interact with Pluggy API.
    Handles authentication, token generation, and transaction fetching.
    """
    
    BASE_URL = "https://api.pluggy.ai"
    
    def __init__(self):
        self.client_id = settings.PLUGGY_CLIENT_ID
        self.client_secret = settings.PLUGGY_CLIENT_SECRET
        self._access_token = None
        self._session = create_session()
        
    def _get_auth_token_sync(self) -> str:
        """
        Authenticates with Pluggy and returns the API Key (access token).
        """
        if self._access_token:
            return self._access_token
        
        print(f"[Pluggy] Autenticando com Client ID: {self.client_id[:8]}...")
        
        try:
            response = self._session.post(
                f"{self.BASE_URL}/auth",
                json={
                    "clientId": self.client_id,
                    "clientSecret": self.client_secret
                },
                timeout=30,
                verify=True  # Mantém verificação SSL
            )
            
            print(f"[Pluggy] Auth response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"[Pluggy] Auth error: {response.text}")
                raise Exception(f"Pluggy auth failed: {response.status_code}")
                
            data = response.json()
            self._access_token = data["apiKey"]
            print(f"[Pluggy] ✅ Autenticado com sucesso!")
            return self._access_token
            
        except requests.exceptions.SSLError as e:
            print(f"[Pluggy] ❌ Erro SSL: {e}")
            # Tentar sem verificação SSL como fallback
            print(f"[Pluggy] Tentando sem verificação SSL...")
            try:
                response = self._session.post(
                    f"{self.BASE_URL}/auth",
                    json={
                        "clientId": self.client_id,
                        "clientSecret": self.client_secret
                    },
                    timeout=30,
                    verify=False
                )
                if response.status_code == 200:
                    data = response.json()
                    self._access_token = data["apiKey"]
                    print(f"[Pluggy] ✅ Autenticado (sem SSL verify)!")
                    return self._access_token
            except Exception as e2:
                print(f"[Pluggy] ❌ Fallback falhou: {e2}")
            raise Exception(f"SSL error connecting to Pluggy: {e}")
            
        except requests.exceptions.ConnectionError as e:
            print(f"[Pluggy] ❌ Erro de conexão: {e}")
            raise Exception(f"Connection error to Pluggy API: {e}")
        except Exception as e:
            print(f"[Pluggy] ❌ Erro: {type(e).__name__}: {e}")
            raise
        
    async def _get_auth_token(self) -> str:
        """Async wrapper around sync auth"""
        return self._get_auth_token_sync()

    async def create_connect_token(self, item_id: Optional[str] = None) -> str:
        """
        Creates a Connect Token to initialize the Pluggy Widget.
        """
        api_key = await self._get_auth_token()
        
        payload = {}
        if item_id:
            payload["itemId"] = item_id
        
        print(f"[Pluggy] Criando Connect Token...")
        
        try:
            response = self._session.post(
                f"{self.BASE_URL}/connect_token",
                headers={"X-API-KEY": api_key},
                json=payload,
                timeout=30,
                verify=True
            )
            
            print(f"[Pluggy] Connect Token response: {response.status_code}")
            
            if response.status_code != 200:
                print(f"[Pluggy] Connect Token error: {response.text}")
                raise Exception(f"Failed to create connect token: {response.status_code}")
                
            data = response.json()
            print(f"[Pluggy] ✅ Connect Token criado!")
            return data["accessToken"]
            
        except requests.exceptions.SSLError as e:
            print(f"[Pluggy] ❌ Erro SSL no Connect Token, tentando fallback...")
            try:
                response = self._session.post(
                    f"{self.BASE_URL}/connect_token",
                    headers={"X-API-KEY": api_key},
                    json=payload,
                    timeout=30,
                    verify=False
                )
                if response.status_code == 200:
                    data = response.json()
                    print(f"[Pluggy] ✅ Connect Token criado (sem SSL verify)!")
                    return data["accessToken"]
            except Exception as e2:
                print(f"[Pluggy] ❌ Fallback Connect Token falhou: {e2}")
            raise Exception(f"SSL error creating connect token: {e}")
            
        except requests.exceptions.ConnectionError as e:
            print(f"[Pluggy] ❌ Erro de conexão no Connect Token: {e}")
            raise Exception(f"Connection error creating connect token: {e}")

    async def get_transactions(self, account_id: str, from_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetches transactions for a specific account.
        """
        api_key = await self._get_auth_token()
        
        if not from_date:
            from_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        try:
            response = self._session.get(
                f"{self.BASE_URL}/transactions",
                headers={"X-API-KEY": api_key},
                params={
                    "accountId": account_id,
                    "from": from_date,
                    "pageSize": 500
                },
                timeout=30,
                verify=True
            )
            
            if response.status_code != 200:
                raise Exception(f"Failed to fetch transactions: {response.text}")
                
            data = response.json()
            return data["results"]
        except Exception as e:
            print(f"[Pluggy] Erro ao buscar transações: {e}")
            raise

    async def get_accounts(self, item_id: str) -> List[Dict[str, Any]]:
        """
        Fetches accounts for a specific item (connection).
        """
        api_key = await self._get_auth_token()
        
        try:
            response = self._session.get(
                f"{self.BASE_URL}/accounts",
                headers={"X-API-KEY": api_key},
                params={"itemId": item_id},
                timeout=30,
                verify=True
            )
            
            if response.status_code != 200:
                raise Exception(f"Failed to fetch accounts: {response.text}")
                
            data = response.json()
            return data["results"]
        except Exception as e:
            print(f"[Pluggy] Erro ao buscar contas: {e}")
            raise
