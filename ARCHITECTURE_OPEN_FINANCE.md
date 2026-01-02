# Arquitetura Técnica - Open Finance (Adapter Pattern)

## 🏗️ Visão Geral

O módulo de Open Finance foi construído seguindo o padrão **Adapter**, garantindo que a lógica de negócio do sistema seja agnóstica ao provedor de dados (Pluggy, Belvo, etc.).

Isso permite trocar de provedor no futuro com impacto mínimo no código.

## 🔌 Backend: Adapter Pattern

### Estrutura de Arquivos
```
backend/app/services/adapters/
├── base.py          # Interface (Contrato)
├── pluggy.py        # Implementação Pluggy
└── belvo.py         # Implementação Belvo
```

### 1. Modelo Interno Unificado (`StandardTransaction`)
Todas as transações, independente da origem, são convertidas para este formato antes de entrarem no sistema:

```python
class StandardTransaction(BaseModel):
    id: str
    amount: Decimal      # Sempre positivo
    date: date
    description: str
    type: str            # 'CREDIT' ou 'DEBIT'
    provider_original_id: str
    provider_name: str   # 'pluggy', 'belvo'
    metadata: Dict
```

### 2. Interface Base (`BankDataProvider`)
Define os métodos obrigatórios que todo adaptador deve implementar:

```python
class BankDataProvider(ABC):
    @abstractmethod
    async def create_connect_token(self, user_id: str) -> Dict: pass
    
    @abstractmethod
    async def get_transactions(self, account_id: str, ...) -> List[StandardTransaction]: pass
```

### 3. Implementação (Ex: Pluggy)
O adaptador é responsável por falar com a API externa e **normalizar** os dados.

```python
class PluggyAdapter(BankDataProvider):
    def _to_internal_model(self, pluggy_tx):
        # Converte JSON da Pluggy -> StandardTransaction
        return StandardTransaction(...)
```

---

## 🖥️ Frontend: Widget Wrapper

### Componente `BankConnectWrapper`
Encapsula a lógica de qual widget de conexão deve ser aberto. O resto da aplicação não sabe qual provedor está sendo usado.

```tsx
// Uso no código
<BankConnectWrapper 
  provider="pluggy" 
  onSuccess={handleSuccess} 
/>
```

Se mudarmos para Belvo, apenas a prop `provider` muda (ou uma variável de ambiente), e o Wrapper cuida de abrir o widget correto.

---

## 🔄 Como Adicionar um Novo Provedor (Ex: Klavi)

1. **Backend**:
   - Criar `backend/app/services/adapters/klavi.py`
   - Implementar a classe `KlaviAdapter(BankDataProvider)`
   - Adicionar no `OpenFinanceService`

2. **Frontend**:
   - Atualizar `BankConnectWrapper.tsx` para suportar o widget da Klavi

**ZERO alteração necessária em:**
- Banco de dados
- Lógica de reconciliação
- Relatórios
- Dashboards

---

## 🛡️ Benefícios

1. **Vendor Lock-in Reduzido**: Trocar de fornecedor é uma tarefa técnica isolada, não uma refatoração sistêmica.
2. **Testabilidade**: É fácil criar um `MockAdapter` para testes unitários sem depender de APIs reais.
3. **Consistência**: O banco de dados sempre tem dados no mesmo formato, independente da origem.
