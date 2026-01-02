from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import date
from decimal import Decimal
from pydantic import BaseModel

class StandardTransaction(BaseModel):
    """
    Internal standard model for transactions.
    All providers must convert their data to this format.
    """
    id: str
    amount: Decimal
    date: date
    description: str
    type: str  # 'CREDIT' or 'DEBIT'
    provider_original_id: str
    provider_name: str
    metadata: Dict[str, Any] = {}

class BankDataProvider(ABC):
    """
    Abstract Base Class for Bank Data Providers.
    Enforces the Adapter Pattern.
    """
    
    @abstractmethod
    async def create_connect_token(self, user_id: str) -> Dict[str, str]:
        """Create a token/url for the frontend widget"""
        pass
    
    @abstractmethod
    async def get_accounts(self, item_id: str) -> List[Dict[str, Any]]:
        """Get accounts from the provider"""
        pass
    
    @abstractmethod
    async def get_transactions(
        self, 
        account_id: str, 
        from_date: date, 
        to_date: Optional[date] = None
    ) -> List[StandardTransaction]:
        """
        Fetch and normalize transactions.
        MUST return List[StandardTransaction].
        """
        pass
    
    @abstractmethod
    async def get_balance(self, account_id: str) -> Decimal:
        """Get real-time balance"""
        pass
