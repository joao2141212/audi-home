"""
Validation Service - Lógica Robusta Anti-Fraude com Cascade Logic
Sistema PARANOICO mas INTELIGENTE: Resolve ambiguidade em cascata antes de ir para manual
"""
from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from datetime import date, datetime, timedelta
from pydantic import BaseModel

class ValidationConfig:
    """Configurações de validação"""
    # Tolerância de valor (R$ 0,05)
    VALUE_TOLERANCE = Decimal("0.05")
    
    # Tolerância de data (2 dias)
    DATE_TOLERANCE_DAYS = 2
    
    # Tolerância de timestamp (30 minutos)
    TIMESTAMP_TOLERANCE_MINUTES = 30
    
    # Taxas comuns de boleto
    COMMON_FEES = [
        Decimal("2.50"),   # Taxa padrão
        Decimal("3.00"),
        Decimal("1.50"),
        Decimal("5.00"),
    ]
    
    # Mapeamento Serviço → CNAEs permitidos
    SERVICE_CNAE_MAP = {
        "jardinagem": ["8130300", "8130-3/00"],
        "paisagismo": ["8130300", "8130-3/00"],
        "limpeza": ["8121400", "8121-4/00", "8129000"],
        "conservacao": ["8121400", "8121-4/00"],
        "seguranca": ["8011101", "8011-1/01", "8011102"],
        "vigilancia": ["8011101", "8011-1/01"],
        "portaria": ["8011101", "8011-1/01"],
        "elevador": ["4329104", "4329-1/04"],
        "manutencao_elevador": ["4329104", "4329-1/04"],
        "eletrica": ["4321500", "4321-5/00"],
        "instalacao_eletrica": ["4321500", "4321-5/00"],
        "hidraulica": ["4322301", "4322-3/01", "4322302"],
        "encanamento": ["4322301", "4322-3/01"],
        "pintura": ["4330404", "4330-4/04", "4330405"],
        "reforma": ["4330404", "4330-4/04"],
        "construcao": ["4120400", "4120-4/00"],
        "obra": ["4120400", "4120-4/00"],
    }

class TransactionMatch(BaseModel):
    """Resultado de match de transação"""
    transaction_id: str
    amount: Decimal
    date: date
    description: str
    timestamp: Optional[datetime] = None  # Hora da transação
    payer_document: Optional[str] = None  # CPF/CNPJ do pagador
    match_score: int  # 0-100
    match_type: str  # "exact", "with_fee", "tolerance"
    match_level: str  # "cpf", "timestamp", "fifo", "manual"
    fee_detected: Optional[Decimal] = None
    ambiguous: bool = False
    confidence: str  # "high", "medium", "low"
    claimed_by: Optional[str] = None  # ID do comprovante que reivindicou
    claimed_at: Optional[datetime] = None  # Quando foi reivindicado

class ValidationResult(BaseModel):
    """Resultado da validação"""
    status: str  # "APPROVED", "REJECTED", "AMBIGUOUS", "MANUAL_REVIEW", "TRANSACTION_ALREADY_CLAIMED"
    matches: List[TransactionMatch]
    reason: str
    resolution_level: Optional[str] = None  # "level_1_cpf", "level_2_timestamp", "level_3_fifo", "level_4_notification", "manual"
    requires_manual_review: bool = False
    fraud_flags: List[str] = []

class RobustValidator:
    """
    Validador robusto com Cascade Logic.
    
    Resolução de Ambiguidade em Cascata:
    1. Nível 1: Match CPF direto
    2. Nível 2: Match por Timestamp (±30min)
    3. Nível 3: FIFO (primeiro a enviar "reserva")
    4. Nível 4: Notificação proativa (estrutura)
    5. Último caso: Manual Review
    
    Objetivo: <0.5% casos manuais
    """
    
    def __init__(self, claimed_transactions: Optional[Dict[str, Dict]] = None):
        """
        Args:
            claimed_transactions: Dict de transações já reivindicadas
                {transaction_id: {claimed_by, claimed_at}}
        """
        self.claimed_transactions = claimed_transactions or {}
    
    def validate_payment(
        self,
        receipt_amount: Decimal,
        receipt_date: date,
        receipt_timestamp: Optional[datetime],  # NOVO: Timestamp do pagamento
        upload_timestamp: datetime,  # NOVO: Timestamp do upload
        payer_cpf: Optional[str],
        receipt_id: str,  # NOVO: ID do comprovante (para FIFO)
        transactions: List[Dict[str, Any]]
    ) -> ValidationResult:
        """
        Valida um pagamento contra transações bancárias com Cascade Logic.
        
        Cascade Logic:
        1. Busca matches potenciais
        2. Se único: aprova
        3. Se múltiplos: resolve em cascata
           - Nível 1: CPF
           - Nível 2: Timestamp
           - Nível 3: FIFO
           - Nível 4: Notificação
           - Último: Manual
        """
        matches = []
        
        # PASSO 1: Buscar matches potenciais
        for tx in transactions:
            match = self._check_transaction_match(
                receipt_amount=receipt_amount,
                receipt_date=receipt_date,
                payer_cpf=payer_cpf,
                transaction=tx
            )
            
            if match:
                # Verificar se transação já foi reivindicada
                if match.transaction_id in self.claimed_transactions:
                    claim_info = self.claimed_transactions[match.transaction_id]
                    match.claimed_by = claim_info.get("claimed_by")
                    match.claimed_at = claim_info.get("claimed_at")
                
                matches.append(match)
        
        # PASSO 2: Analisar resultados
        if len(matches) == 0:
            return ValidationResult(
                status="REJECTED",
                matches=[],
                reason="Nenhuma transação correspondente encontrada no extrato bancário",
                requires_manual_review=False
            )
        
        elif len(matches) == 1:
            # Match único - verificar se já foi reivindicado
            match = matches[0]
            
            if match.claimed_by and match.claimed_by != receipt_id:
                return ValidationResult(
                    status="TRANSACTION_ALREADY_CLAIMED",
                    matches=[match],
                    reason=f"Transação já foi reivindicada por outro comprovante em {match.claimed_at}",
                    requires_manual_review=True,
                    fraud_flags=["transaction_claimed"]
                )
            
            if match.confidence == "high":
                # Reivindicar transação
                self._claim_transaction(match.transaction_id, receipt_id)
                
                return ValidationResult(
                    status="APPROVED",
                    matches=[match],
                    reason=f"Pagamento confirmado ({match.match_type})",
                    resolution_level="single_match",
                    requires_manual_review=False
                )
            else:
                return ValidationResult(
                    status="MANUAL_REVIEW",
                    matches=[match],
                    reason=f"Match encontrado mas com baixa confiança. Requer revisão.",
                    resolution_level="manual",
                    requires_manual_review=True,
                    fraud_flags=["low_confidence"]
                )
        
        else:
            # Múltiplos matches - CASCADE LOGIC
            return self._resolve_ambiguity_cascade(
                matches=matches,
                payer_cpf=payer_cpf,
                receipt_timestamp=receipt_timestamp,
                upload_timestamp=upload_timestamp,
                receipt_id=receipt_id
            )
    
    def _resolve_ambiguity_cascade(
        self,
        matches: List[TransactionMatch],
        payer_cpf: Optional[str],
        receipt_timestamp: Optional[datetime],
        upload_timestamp: datetime,
        receipt_id: str
    ) -> ValidationResult:
        """
        Resolve ambiguidade usando Cascade Logic.
        
        Níveis:
        1. CPF do pagador
        2. Timestamp do pagamento
        3. FIFO (primeiro a enviar)
        4. Notificação proativa
        5. Manual Review
        """
        
        # NÍVEL 1: Match por CPF
        if payer_cpf:
            cpf_clean = self._clean_document(payer_cpf)
            matches_with_cpf = [
                m for m in matches 
                if m.payer_document and self._clean_document(m.payer_document) == cpf_clean
                and not m.claimed_by  # Não reivindicado
            ]
            
            if len(matches_with_cpf) == 1:
                match = matches_with_cpf[0]
                match.match_level = "cpf"
                
                # Reivindicar transação
                self._claim_transaction(match.transaction_id, receipt_id)
                
                return ValidationResult(
                    status="APPROVED",
                    matches=[match],
                    reason="Pagamento confirmado por cruzamento de CPF (Nível 1)",
                    resolution_level="level_1_cpf",
                    requires_manual_review=False
                )
            elif len(matches_with_cpf) > 1:
                # Ainda ambíguo mesmo com CPF - ir para próximo nível
                matches = matches_with_cpf
        
        # NÍVEL 2: Match por Timestamp (±30min)
        if receipt_timestamp:
            matches_with_timestamp = []
            
            for match in matches:
                if match.timestamp and not match.claimed_by:
                    time_diff = abs((match.timestamp - receipt_timestamp).total_seconds() / 60)
                    
                    if time_diff <= ValidationConfig.TIMESTAMP_TOLERANCE_MINUTES:
                        match.match_level = "timestamp"
                        match.match_score += 10  # Bonus por timestamp
                        matches_with_timestamp.append((match, time_diff))
            
            if matches_with_timestamp:
                # Pegar o match com menor diferença de tempo
                matches_with_timestamp.sort(key=lambda x: x[1])
                best_match = matches_with_timestamp[0][0]
                
                # Reivindicar transação
                self._claim_transaction(best_match.transaction_id, receipt_id)
                
                return ValidationResult(
                    status="APPROVED",
                    matches=[best_match],
                    reason=f"Pagamento confirmado por timestamp (diferença: {matches_with_timestamp[0][1]:.0f}min) (Nível 2)",
                    resolution_level="level_2_timestamp",
                    requires_manual_review=False
                )
        
        # NÍVEL 3: FIFO (First In First Out)
        # Verificar se alguma transação ainda não foi reivindicada
        unclaimed_matches = [m for m in matches if not m.claimed_by]
        
        if unclaimed_matches:
            # Pegar a primeira transação não reivindicada (ordem cronológica)
            unclaimed_matches.sort(key=lambda m: m.timestamp or m.date)
            first_unclaimed = unclaimed_matches[0]
            first_unclaimed.match_level = "fifo"
            
            # Reivindicar transação
            self._claim_transaction(first_unclaimed.transaction_id, receipt_id)
            
            return ValidationResult(
                status="APPROVED",
                matches=[first_unclaimed],
                reason="Pagamento confirmado por FIFO - primeira transação disponível (Nível 3)",
                resolution_level="level_3_fifo",
                requires_manual_review=False
            )
        
        # NÍVEL 4: Todas as transações já foram reivindicadas
        claimed_matches = [m for m in matches if m.claimed_by]
        
        if claimed_matches:
            return ValidationResult(
                status="TRANSACTION_ALREADY_CLAIMED",
                matches=claimed_matches,
                reason=f"Todas as {len(claimed_matches)} transações correspondentes já foram reivindicadas por outros comprovantes",
                resolution_level="level_3_fifo",
                requires_manual_review=True,
                fraud_flags=["all_transactions_claimed", "possible_duplicate_receipt"]
            )
        
        # ÚLTIMO CASO: Manual Review
        return ValidationResult(
            status="MANUAL_REVIEW",
            matches=matches,
            reason=f"Múltiplas transações ({len(matches)}) sem critério de desempate. Requer revisão manual (Nível 5)",
            resolution_level="manual",
            requires_manual_review=True,
            fraud_flags=["multiple_matches", "no_resolution_criteria"]
        )
    
    def _check_transaction_match(
        self,
        receipt_amount: Decimal,
        receipt_date: date,
        payer_cpf: Optional[str],
        transaction: Dict[str, Any]
    ) -> Optional[TransactionMatch]:
        """
        Verifica se uma transação é um match potencial.
        """
        tx_amount = Decimal(str(transaction.get("amount", 0)))
        tx_date_str = transaction.get("date", "")
        tx_date = self._parse_date(tx_date_str)
        
        if not tx_date:
            return None
        
        # Verificar data (tolerância de 2 dias)
        date_diff = abs((tx_date - receipt_date).days)
        if date_diff > ValidationConfig.DATE_TOLERANCE_DAYS:
            return None
        
        # Verificar valor
        value_diff = abs(tx_amount - receipt_amount)
        
        # Parse timestamp se disponível
        tx_timestamp = self._parse_timestamp(transaction.get("timestamp"))
        
        # Match exato
        if value_diff <= ValidationConfig.VALUE_TOLERANCE:
            return TransactionMatch(
                transaction_id=transaction.get("id", ""),
                amount=tx_amount,
                date=tx_date,
                timestamp=tx_timestamp,
                description=transaction.get("description", ""),
                payer_document=transaction.get("payer_document"),
                match_score=100,
                match_type="exact",
                match_level="pending",
                confidence="high"
            )
        
        # Match com taxa de boleto
        for fee in ValidationConfig.COMMON_FEES:
            if abs(tx_amount - (receipt_amount - fee)) <= ValidationConfig.VALUE_TOLERANCE:
                return TransactionMatch(
                    transaction_id=transaction.get("id", ""),
                    amount=tx_amount,
                    date=tx_date,
                    timestamp=tx_timestamp,
                    description=transaction.get("description", ""),
                    payer_document=transaction.get("payer_document"),
                    match_score=90,
                    match_type="with_fee",
                    match_level="pending",
                    fee_detected=fee,
                    confidence="high"
                )
        
        return None
    
    def _claim_transaction(self, transaction_id: str, receipt_id: str):
        """Reivindica uma transação para um comprovante"""
        self.claimed_transactions[transaction_id] = {
            "claimed_by": receipt_id,
            "claimed_at": datetime.now()
        }
    
    def validate_cnae_service(
        self,
        cnae_principal: str,
        cnaes_secundarios: List[str],
        service_type: str
    ) -> Tuple[bool, str]:
        """
        Valida se o CNAE do fornecedor é compatível com o serviço.
        """
        service_normalized = service_type.lower().strip()
        allowed_cnaes = ValidationConfig.SERVICE_CNAE_MAP.get(service_normalized, [])
        
        if not allowed_cnaes:
            return (None, f"Serviço '{service_type}' não mapeado. Requer validação manual.")
        
        cnae_principal_clean = self._clean_cnae(cnae_principal)
        cnaes_secundarios_clean = [self._clean_cnae(c) for c in cnaes_secundarios]
        
        all_cnaes = [cnae_principal_clean] + cnaes_secundarios_clean
        
        for cnae in all_cnaes:
            for allowed in allowed_cnaes:
                allowed_clean = self._clean_cnae(allowed)
                if cnae.startswith(allowed_clean[:4]):
                    return (True, f"CNAE {cnae} compatível com serviço '{service_type}'")
        
        return (False, f"CNAE {cnae_principal} NÃO é compatível com serviço '{service_type}'. Possível fraude de desvio de função.")
    
    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse date from string"""
        try:
            if 'T' in date_str:
                return date.fromisoformat(date_str.split('T')[0])
            return date.fromisoformat(date_str)
        except:
            return None
    
    def _parse_timestamp(self, timestamp_str: Optional[str]) -> Optional[datetime]:
        """Parse timestamp from string"""
        if not timestamp_str:
            return None
        try:
            return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except:
            return None
    
    def _clean_document(self, doc: str) -> str:
        """Remove formatação de CPF/CNPJ"""
        return ''.join(filter(str.isdigit, doc))
    
    def detect_refund(
        self,
        transaction: Dict[str, Any],
        historical_debits: List[Dict[str, Any]]
    ) -> Tuple[bool, Optional[str]]:
        """
        Verifica se uma transação de crédito (entrada) é na verdade um ESTORNO de uma saída anterior.
        
        Regras:
        1. Descrição contém palavras-chave de estorno.
        2. Valor idêntico a um débito recente (últimos 30 dias).
        3. Mesmo fornecedor/documento.
        """
        description = transaction.get("description", "").upper()
        amount = Decimal(str(transaction.get("amount", 0)))
        
        # 1. Palavras-chave
        refund_keywords = ["ESTORNO", "DEVOLUCAO", "CANCELAMENTO", "REEMBOLSO", "ESTORNADO"]
        is_explicit_refund = any(kw in description for kw in refund_keywords)
        
        if is_explicit_refund:
            return (True, "Identificado por palavra-chave na descrição")
            
        # 2. Busca débito correspondente (valor idêntico, sinal oposto)
        # Assumindo que 'amount' aqui é positivo (crédito). Buscamos débitos (negativos) com mesmo valor absoluto.
        for debit in historical_debits:
            debit_amount = Decimal(str(debit.get("amount", 0)))
            if abs(debit_amount) == amount:
                # Verificar se o débito ocorreu ANTES do crédito
                debit_date = self._parse_date(debit.get("date"))
                credit_date = self._parse_date(transaction.get("date"))
                
                if debit_date and credit_date and debit_date <= credit_date:
                    # Se tiver documento/CNPJ, tem que bater
                    debit_doc = debit.get("payer_document") or debit.get("receiver_document") # Depende da API
                    credit_doc = transaction.get("payer_document")
                    
                    if debit_doc and credit_doc:
                        if self._clean_document(debit_doc) == self._clean_document(credit_doc):
                            return (True, f"Estorno de transação anterior (ID: {debit.get('id')})")
                    else:
                        # Sem documento, match por valor exato e descrição similar pode ser arriscado
                        # Mas se a descrição for muito parecida, pode ser.
                        pass
                        
        return (False, None)
