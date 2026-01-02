from typing import List, Dict, Any, Optional
from datetime import date, datetime
from decimal import Decimal
import httpx
from .base import BankDataProvider, StandardTransaction

class PluggyAdapter(BankDataProvider):
    """
    Adapter for Pluggy Open Finance API.
    Normalizes data to StandardTransaction.
    """
    
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = "https://api.pluggy.ai"
        self.access_token: Optional[str] = None
    
    async def _get_access_token(self) -> str:
        if self.access_token:
            return self.access_token
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/auth",
                json={
                    "clientId": self.client_id,
                    "clientSecret": self.client_secret
                }
            )
            response.raise_for_status()
            data = response.json()
            self.access_token = data['apiKey']
            return self.access_token

    async def create_connect_token(self, user_id: str) -> Dict[str, str]:
        token = await self._get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/connect_token",
                headers={"X-API-KEY": token},
                json={"clientUserId": user_id}
            )
            response.raise_for_status()
            data = response.json()
            return {
                "access_token": data['accessToken'],
                "widget_url": f"https://connect.pluggy.ai?connectToken={data['accessToken']}"
            }

    async def get_accounts(self, item_id: str) -> List[Dict[str, Any]]:
        token = await self._get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/accounts",
                headers={"X-API-KEY": token},
                params={"itemId": item_id}
            )
            response.raise_for_status()
            data = response.json()
            return data['results']

    async def get_transactions(
        self, 
        account_id: str, 
        from_date: date, 
        to_date: Optional[date] = None
    ) -> List[StandardTransaction]:
        token = await self._get_access_token()
        if not to_date:
            to_date = date.today()
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/transactions",
                headers={"X-API-KEY": token},
                params={
                    "accountId": account_id,
                    "from": from_date.isoformat(),
                    "to": to_date.isoformat()
                }
            )
            response.raise_for_status()
            data = response.json()
            
            return [self._to_internal_model(tx) for tx in data['results']]

    async def get_balance(self, account_id: str) -> Decimal:
        token = await self._get_access_token()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/accounts/{account_id}",
                headers={"X-API-KEY": token}
            )
            response.raise_for_status()
            data = response.json()
            return Decimal(str(data['balance']))

    def _to_internal_model(self, pluggy_tx: Dict[str, Any]) -> StandardTransaction:
        """
        The Core Adapter Logic: Pluggy -> Standard
        """
        amount = Decimal(str(pluggy_tx['amount']))
        
        # Pluggy uses negative for debit, positive for credit
        # We want absolute amount and explicit type
        tx_type = 'CREDIT' if amount > 0 else 'DEBIT'
        
        return StandardTransaction(
            id=pluggy_tx['id'],
            amount=abs(amount),
            date=datetime.fromisoformat(pluggy_tx['date'].replace('Z', '+00:00')).date(),
            description=pluggy_tx['description'],
            type=tx_type,
            provider_original_id=pluggy_tx['id'],
            provider_name='pluggy',
            metadata={
                "category": pluggy_tx.get('category'),
                "payment_data": pluggy_tx.get('paymentData')
            }
        )
