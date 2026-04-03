import { supabase } from './supabase'

// A flag VITE_USE_LOCAL_DB foi desativada no .env
// O condomínio ID agora deve vir do AuthContext

export const api = {
    // 1. EXTRATOS E TRANSAÇÕES
    async saveStatement(data: {
        filename: string,
        periodo_inicio: string | null,
        periodo_fim: string | null,
        instituicao: string,
        transacoes: any[],
        condominio_id: string
    }) {
        const { data: extrato, error } = await supabase
            .from('extratos_bancarios')
            .insert({
                arquivo_nome: data.filename,
                periodo_inicio: data.periodo_inicio,
                periodo_fim: data.periodo_fim,
                instituicao: data.instituicao,
                condominio_id: data.condominio_id,
                status: 'processado',
                total_creditos: data.transacoes
                    .filter((t: any) => t.type === 'CREDIT')
                    .reduce((acc: number, t: any) => acc + (t.valor || 0), 0),
                total_debitos: data.transacoes
                    .filter((t: any) => t.type === 'DEBIT')
                    .reduce((acc: number, t: any) => acc + Math.abs(t.valor || 0), 0)
            })
            .select()
            .single()

        if (error) throw error

        const txToInsert = data.transacoes.map((tx: any) => ({
            extrato_id: extrato.id,
            condominio_id: data.condominio_id,
            data_transacao: tx.data,
            descricao: tx.descricao,
            valor: tx.valor,
            type: tx.type,
            conciliado: false
        }))

        const { error: txError } = await supabase
            .from('transacoes_bancarias')
            .insert(txToInsert)

        if (txError) throw txError
        return { extrato_id: extrato.id }
    },

    async getTransactions(condominio_id: string) {
        const { data, error } = await supabase
            .from('transacoes_bancarias')
            .select('*')
            .eq('condominio_id', condominio_id)
            .order('data_transacao', { ascending: false })

        if (error) throw error
        return data
    },

    // 2. COMPROVANTES E RECONCILIAÇÃO
    async saveReceipt(data: {
        condominio_id: string,
        fornecedor_id?: string,
        data_emissao: string,
        valor: number,
        descricao: string,
        arquivo_nome: string,
        status_auditoria?: string,
        audit_flags?: string
    }) {
        const { data: receipt, error } = await supabase
            .from('comprovantes')
            .insert({
                condominio_id: data.condominio_id,
                fornecedor_id: data.fornecedor_id,
                data_emissao: data.data_emissao,
                valor: data.valor,
                descricao: data.descricao,
                arquivo_nome: data.arquivo_nome,
                status_auditoria: data.status_auditoria,
                audit_flags: data.audit_flags
            })
            .select()
            .single()

        if (error) throw error
        return receipt
    },

    async getReceipts(condominio_id: string) {
        const { data, error } = await supabase
            .from('comprovantes')
            .select('*, fornecedores(*)')
            .eq('condominio_id', condominio_id)

        if (error) throw error
        return data
    },

    async getReconciliationQueue(condominio_id: string) {
        const { data, error } = await supabase
            .from('comprovantes')
            .select('*, fornecedores(razao_social)')
            .eq('condominio_id', condominio_id)
            .is('transacao_id', null)

        if (error) throw error
        return {
            queue: data.map(i => ({
                id: i.id,
                valor: i.valor,
                data: i.data_emissao,
                unidade: i.fornecedores?.razao_social || 'Fornecedor Desconhecido',
                status: i.status_auditoria,
                ocrConfianca: 100
            }))
        }
    },

    async getReconciliationMatches(condominio_id: string, valor: number) {
        // Usa a RPC que criamos no banco
        const { data, error } = await supabase.rpc('find_reconciliation_matches', {
            p_condominio_id: condominio_id,
            p_valor: valor
        })

        if (error) throw error
        return {
            matches: (data || []).map((m: any) => ({
                id: m.id,
                valor: m.valor,
                data: m.data_transacao,
                descricao: m.descricao,
                matchScore: m.score,
                matchReasons: ['Valor exato', 'Data aproximada']
            }))
        }
    },

    async approveReconciliation(receiptId: string, transactionId: string) {
        // 1. Atualizar transação para conciliada
        const { error: txError } = await supabase
            .from('transacoes_bancarias')
            .update({ conciliado: true, status_reconciliacao: 'reconciliado' })
            .eq('id', transactionId)

        if (txError) throw txError

        // 2. Vincular no comprovante
        const { error: compError } = await supabase
            .from('comprovantes')
            .update({ transacao_id: transactionId, status_auditoria: 'auditado' })
            .eq('id', receiptId)

        if (compError) throw compError

        return { success: true }
    },

    // 3. FUNDO DE RESERVA
    async getReserveConfig(condominio_id: string) {
        const { data, error } = await supabase
            .from('reserva_config')
            .select('*')
            .eq('condominio_id', condominio_id)
            .single()

        if (error && error.code !== 'PGRST116') throw error // Ignora erro de "não encontrado"
        return data || { valor_mensal_programado: 0, saldo_inicial: 0 }
    },

    async saveReserveMovimentacao(data: {
        condominio_id: string,
        tipo: string,
        valor: number,
        data_movimentacao: string,
        descricao: string
    }) {
        const { data: move, error } = await supabase
            .from('reserva_movimentacoes')
            .insert(data)
            .select()
            .single()

        if (error) throw error
        return move
    },

    // 4. AUDITORIA EXTERNA (CNPJ)
    async validateCNPJ(cnpj: string) {
        try {
            const cleanCnpj = cnpj.replace(/\D/g, '')
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`)
            if (!response.ok) return { valid: false, error: 'CNPJ não encontrado' }
            const data = await response.json()
            return {
                valid: true,
                razao_social: data.razao_social,
                situacao: data.descricao_situacao_cadastral,
                cnaes: [data.cnae_fiscal, ...(data.cnaes_secundarios?.map((c: any) => c.codigo) || [])]
            }
        } catch (e) {
            return { valid: false, error: 'Falha na consulta externa' }
        }
    },

    // 5. VISÃO MACRO (MASTER)
    async getMacroVision() {
        const { data, error } = await supabase
            .from('view_macro_financeira')
            .select('*')

        if (error) throw error
        return data
    },

    async getAuditDivergences(condominio_id: string) {
        // Simula auditoria básica via query cloud
        const { data: missing } = await supabase
            .from('transacoes_bancarias')
            .select('*')
            .eq('condominio_id', condominio_id)
            .eq('type', 'DEBIT')
            .is('conciliado', false)

        return {
            rfb_cnae: [],
            nf_faltante: missing || [],
            juros_multa: [],
            titularidade: [],
            receita_antecipada: [],
            timestamp: new Date().toISOString()
        }
    },

    // 6. FUNÇÕES ADICIONAIS
    async getExpenses(condominio_id: string) {
        const { data, error } = await supabase
            .from('comprovantes')
            .select('*, fornecedores(*)')
            .eq('condominio_id', condominio_id)
            .order('data_emissao', { ascending: false })

        if (error) throw error
        return data || []
    },

    async getBudget(condominio_id: string) {
        const { data, error } = await supabase
            .from('orcamento_anual')
            .select('*')
            .eq('condominio_id', condominio_id)

        if (error && error.code !== 'PGRST116') throw error
        return data || []
    },

    async saveBudget(data: {
        condominio_id: string,
        categoria: string,
        valor_previsto: number,
        ano: number
    }) {
        const { data: budget, error } = await supabase
            .from('orcamento_anual')
            .upsert(data, { onConflict: 'condominio_id,categoria,ano' })
            .select()
            .single()

        if (error) throw error
        return budget
    },

    async getBoletos(condominio_id: string) {
        // Retorna transações de crédito como "boletos" recebidos
        const { data, error } = await supabase
            .from('transacoes_bancarias')
            .select('*')
            .eq('condominio_id', condominio_id)
            .eq('type', 'CREDIT')
            .order('data_transacao', { ascending: false })

        if (error) throw error
        return data || []
    },

    async getReserveMovimentacoes(condominio_id: string) {
        const { data, error } = await supabase
            .from('reserva_movimentacoes')
            .select('*')
            .eq('condominio_id', condominio_id)
            .order('data_movimentacao', { ascending: false })

        if (error) throw error
        return data || []
    }
}
