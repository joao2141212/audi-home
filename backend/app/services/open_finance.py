"""
Open Finance Service
Integrates with Open Finance providers using the Adapter Pattern.
"""
from typing import List, Dict, Any
from datetime import date, timedelta
from decimal import Decimal
from app.core.config import get_settings
from app.services.adapters.base import BankDataProvider, StandardTransaction
from app.services.adapters.pluggy import PluggyAdapter
from app.services.adapters.belvo import BelvoAdapter

settings = get_settings()

class OpenFinanceService:
    """
    Main service for Open Finance operations.
    Uses the Adapter Pattern to switch between providers seamlessly.
    """
    
    def __init__(self, provider: str = "pluggy"):
        self.provider_name = provider
        self.provider: BankDataProvider
        
        if provider == "pluggy":
            self.provider = PluggyAdapter(
                client_id=settings.PLUGGY_CLIENT_ID or "",
                client_secret=settings.PLUGGY_CLIENT_SECRET or ""
            )
        elif provider == "belvo":
            self.provider = BelvoAdapter(
                secret_id=settings.BELVO_SECRET_ID or "",
                secret_password=settings.BELVO_SECRET_PASSWORD or ""
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    async def create_bank_connection(self, user_id: str) -> Dict[str, str]:
        """
        Create a connection token for the user to link their bank account.
        Delegates to the configured adapter.
        """
        return await self.provider.create_connect_token(user_id)
    
    async def sync_transactions(
        self, 
        account_id: str, 
        days_back: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Sync transactions from the bank.
        Returns normalized dictionary format ready for database insertion.
        """
        from_date = date.today() - timedelta(days=days_back)
        
        # Get standardized transactions from adapter
        standard_txs: List[StandardTransaction] = await self.provider.get_transactions(
            account_id, 
            from_date
        )
        
        # Convert to dictionary format expected by the API/DB
        return [self._standard_to_dict(tx) for tx in standard_txs]
    
    async def get_real_time_balance(self, account_id: str) -> Decimal:
        """Get current balance from the bank"""
        return await self.provider.get_balance(account_id)

    def _standard_to_dict(self, tx: StandardTransaction) -> Dict[str, Any]:
        """
        Convert StandardTransaction to the dictionary format expected by our database schema.
        This maps the Internal Model -> Database Schema.
        """
        return {
            "id": tx.id,
            "data_transacao": tx.date,
            "valor": tx.amount,
            "tipo": "credito" if tx.type == 'CREDIT' else "debito",
            "descricao": tx.description,
            "nsu": tx.provider_original_id, # Using provider ID as NSU/Reference
            "codigo_barras": None,
            "conta_origem": None,
            "conta_destino": None,
            "metadata": tx.metadata
        }
