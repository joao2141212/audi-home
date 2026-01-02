from typing import List, Dict, Any, Optional
from datetime import date, datetime
from decimal import Decimal
import httpx
from .base import BankDataProvider, StandardTransaction

class BelvoAdapter(BankDataProvider):
    """
    Adapter for Belvo Open Finance API.
    Normalizes data to StandardTransaction.
    """
    
    def __init__(self, secret_id: str, secret_password: str):
        self.secret_id = secret_id
        self.secret_password = secret_password
        self.base_url = "https://api.belvo.com"
    
    async def create_connect_token(self, user_id: str) -> Dict[str, str]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/token/",
                auth=(self.secret_id, self.secret_password),
                json={
                    "scopes": "read_accounts,read_transactions",
                    "external_id": user_id
                }
            )
            response.raise_for_status()
            data = response.json()
            return {
                "access_token": data['access'],
                "widget_url": f"https://widget.belvo.com?access_token={data['access']}"
            }

    async def get_accounts(self, item_id: str) -> List[Dict[str, Any]]:
        # Belvo implementation for accounts
        # Simplified for this example
        return []

    async def get_transactions(
        self, 
        account_id: str, 
        from_date: date, 
        to_date: Optional[date] = None
    ) -> List[StandardTransaction]:
        if not to_date:
            to_date = date.today()
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/transactions/",
                auth=(self.secret_id, self.secret_password),
                params={
                    "link": account_id,
                    "date_from": from_date.isoformat(),
                    "date_to": to_date.isoformat()
                }
            )
            response.raise_for_status()
            data = response.json()
            
            return [self._to_internal_model(tx) for tx in data['results']]

    async def get_balance(self, account_id: str) -> Decimal:
        # Belvo implementation for balance
        return Decimal('0.00')

    def _to_internal_model(self, belvo_tx: Dict[str, Any]) -> StandardTransaction:
        """
        The Core Adapter Logic: Belvo -> Standard
        """
        # Belvo explicit types: 'INFLOW' or 'OUTFLOW'
        tx_type = 'CREDIT' if belvo_tx['type'] == 'INFLOW' else 'DEBIT'
        
        return StandardTransaction(
            id=belvo_tx['id'],
            amount=abs(Decimal(str(belvo_tx['amount']))),
            date=datetime.fromisoformat(belvo_tx['value_date']).date(),
            description=belvo_tx['description'],
            type=tx_type,
            provider_original_id=belvo_tx['id'],
            provider_name='belvo',
            metadata={
                "category": belvo_tx.get('category'),
                "merchant": belvo_tx.get('merchant')
            }
        )
