from pydantic import BaseModel, Field, field_validator
from datetime import date, datetime
from typing import Optional, List, Literal
from decimal import Decimal

# --- Shared Enums ---
ValidationStatus = Literal['ok', 'divergencia', 'erro', 'pendente']
PaymentType = Literal['boleto', 'cheque', 'pix', 'tef', 'debito_automatico']
RfbStatus = Literal['Ativo', 'Inativo', 'Suspenso', 'Baixada', 'Nula']

# --- Budget Models ---
class BudgetBase(BaseModel):
    ano: int
    categoria: str
    subcategoria: Optional[str] = None
    valor_programado: Decimal = Field(gt=0)
    data_aprovacao: Optional[date] = None

class BudgetCreate(BudgetBase):
    pass

class BudgetResponse(BudgetBase):
    id: str
    criado_em: datetime
    
    class Config:
        from_attributes = True

# --- Payment Models ---
class PaymentBase(BaseModel):
    data_pagamento: date
    cnpj_fornecedor: str = Field(pattern=r"^\d{14}$") # Simple regex for 14 digits
    razao_social: Optional[str] = None
    nf_numero: Optional[str] = None
    nf_serie: Optional[str] = None
    valor: Decimal = Field(gt=0)
    tipo_pagamento: PaymentType

class PaymentCreate(PaymentBase):
    pass

class PaymentValidationResult(BaseModel):
    payment_id: str
    status_validacao: ValidationStatus
    status_rfb: Optional[RfbStatus] = None
    cnae_nf: Optional[str] = None
    cnae_consulta: Optional[str] = None
    motivo_divergencia: Optional[str] = None

# --- Reserve Fund Models ---
class ReserveFundBase(BaseModel):
    mes_referencia: date
    saldo_anterior: Decimal
    deposito_programado: Decimal
    deposito_realizado: Decimal = Decimal(0)
    juros_aplicacao: Decimal = Decimal(0)
    correcao_monetaria: Decimal = Decimal(0)
    saques: Decimal = Decimal(0)
    motivo_saque: Optional[str] = None

class ReserveFundCreate(ReserveFundBase):
    pass

class ReserveFundResponse(ReserveFundBase):
    id: str
    saldo_novo: Decimal
    
    class Config:
        from_attributes = True

# --- Bank Statement Models ---
class BankStatementBase(BaseModel):
    arquivo_nome: str
    arquivo_hash: str
    periodo_inicio: Optional[date] = None
    periodo_fim: Optional[date] = None
    fonte: Literal['manual', 'open_finance'] = 'manual'

class BankStatementCreate(BankStatementBase):
    arquivo_url: Optional[str] = None

class BankStatementResponse(BankStatementBase):
    id: str
    arquivo_url: Optional[str] = None
    data_importacao: datetime
    criado_por: Optional[str] = None
    
    class Config:
        from_attributes = True

# --- Bank Transaction Models ---
class BankTransactionBase(BaseModel):
    data_transacao: date
    valor: Decimal = Field(gt=0)
    tipo: Literal['credito', 'debito']
    descricao: Optional[str] = None
    nsu: Optional[str] = None
    codigo_barras: Optional[str] = None
    conta_origem: Optional[str] = None
    conta_destino: Optional[str] = None

class BankTransactionCreate(BankTransactionBase):
    extrato_id: str

class BankTransactionResponse(BankTransactionBase):
    id: str
    extrato_id: str
    status_reconciliacao: Literal['pendente', 'reconciliado', 'divergente', 'ignorado']
    comprovante_id: Optional[str] = None
    criado_em: datetime
    
    class Config:
        from_attributes = True

# --- Receipt Models ---
class ReceiptBase(BaseModel):
    arquivo_nome: str
    tipo_arquivo: Literal['pdf', 'jpg', 'jpeg', 'png']
    unidade: Optional[str] = None

class ReceiptCreate(ReceiptBase):
    arquivo_hash: str
    arquivo_url: str
    tamanho_bytes: Optional[int] = None

class ReceiptOCRResult(BaseModel):
    ocr_processado: bool
    ocr_confianca: Optional[Decimal] = None
    ocr_valor: Optional[Decimal] = None
    ocr_data: Optional[date] = None
    ocr_nsu: Optional[str] = None
    ocr_codigo_barras: Optional[str] = None
    ocr_texto_completo: Optional[str] = None
    ocr_erro: Optional[str] = None

class ReceiptResponse(ReceiptBase):
    id: str
    arquivo_url: str
    arquivo_hash: str
    tamanho_bytes: Optional[int] = None
    enviado_por: Optional[str] = None
    data_envio: datetime
    
    # OCR
    ocr_processado: bool
    ocr_confianca: Optional[Decimal] = None
    ocr_valor: Optional[Decimal] = None
    ocr_data: Optional[date] = None
    ocr_nsu: Optional[str] = None
    
    # Fraud
    fraud_score: Decimal
    fraud_flags: Optional[dict] = None
    documento_alterado: bool
    duplicado_de: Optional[str] = None
    
    # Status
    status: Literal['pendente', 'processando', 'aprovado', 'rejeitado', 'suspeito', 'duplicado']
    transacao_id: Optional[str] = None
    
    # Review
    revisado_por: Optional[str] = None
    data_revisao: Optional[datetime] = None
    motivo_decisao: Optional[str] = None
    
    class Config:
        from_attributes = True

# --- Reconciliation Models ---
class TransactionMatch(BaseModel):
    """Suggested transaction match with confidence score"""
    transacao_id: str
    data_transacao: date
    valor: Decimal
    descricao: Optional[str] = None
    nsu: Optional[str] = None
    match_score: Decimal  # 0-100
    match_reasons: List[str]  # e.g., ["valor_exato", "data_proxima", "nsu_match"]

class ReconciliationQueueItem(BaseModel):
    id: str
    comprovante_id: str
    prioridade: int
    tipo: Literal['manual', 'excecao', 'duplicado', 'fraude_suspeita', 'multiplos_matches', 'baixa_confianca']
    matches_sugeridos: List[TransactionMatch]
    status: Literal['pendente', 'em_revisao', 'concluido', 'cancelado']
    criado_em: datetime
    atribuido_a: Optional[str] = None
    
    class Config:
        from_attributes = True

class ReconciliationApproval(BaseModel):
    """Request to approve a reconciliation"""
    comprovante_id: str
    transacao_id: str
    motivo_decisao: Optional[str] = None

class ReconciliationRejection(BaseModel):
    """Request to reject a receipt"""
    comprovante_id: str
    motivo_decisao: str
