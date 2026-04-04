/**
 * AUDICONDO — Camada de Verificação Determinística (Multi-Verify Layer)
 * 
 * Esta camada roda INDEPENDENTE da IA (Gemini). Ela aplica regras matemáticas
 * e lógicas fixas que não podem ser enganadas por geração de linguagem.
 * Redundância deliberada: mesmo que o Gemini erre, estas regras pegam a fraude.
 */

// ============================================================
// CONSTANTES
// ============================================================

/** ISPB oficiais dos principais bancos (fonte: BACEN SGS) */
const ISPB_BANCO: Record<string, string> = {
    '00000000': 'Banco do Brasil',
    '00360305': 'Caixa Econômica Federal',
    '60746948': 'Bradesco',
    '60701190': 'Itaú Unibanco',
    '33172537': 'Santander',
    '92894922': 'Nubank / Nu Pagamentos',
    '18236120': 'BS2',
    '00204963': 'Banco Inter',
    '13505419': 'C6 Bank',
    '20855875': 'Neon Pagamentos',
    '45246410': 'Mercado Pago',
    '32997490': 'PicPay',
    '07679404': 'Sicoob',
    '04902979': 'Banrisul',
    '58160789': 'Banco Safra',
    '30680829': 'Banco BMG',
    '34111187': 'Ame Digital',
}

/** Aliases para normalização: nome declarado → chave ISPB */
const BANK_NAME_TO_ISPB: Record<string, string> = {
    'bradesco': '60746948', 'banco bradesco': '60746948',
    'itau': '60701190', 'itaú': '60701190', 'itau unibanco': '60701190',
    'santander': '33172537', 'banco santander': '33172537',
    'caixa': '00360305', 'cef': '00360305', 'caixa economica': '00360305',
    'bb': '00000000', 'banco do brasil': '00000000',
    'nubank': '92894922', 'nu pagamentos': '92894922', 'nu bank': '92894922',
    'inter': '00204963', 'banco inter': '00204963',
    'c6': '13505419', 'c6 bank': '13505419',
    'mercado pago': '45246410',
    'picpay': '32997490',
    'neon': '20855875',
}

// ============================================================
// TYPES
// ============================================================

export interface PixData {
    e2e_id?: string | null
    valor?: number | null
    data?: string | null          // YYYY-MM-DD
    hora_declarada?: string | null // HH:MM:SS
    pagador_cpf_cnpj?: string | null
    pagador_banco?: string | null
    recebedor_cpf_cnpj?: string | null
    recebedor_banco?: string | null
    recebedor_chave?: string | null
    banco_origem_declarado?: string | null
}

export interface E2EValidation {
    valid: boolean
    length: number
    ispb: string | null
    banco_e2e: string | null
    date_e2e: string | null   // YYYYMMDD
    time_e2e: string | null   // HHmm
    suffix: string | null
    error: string | null
}

export interface FraudSignal {
    flag: string
    score: number
    evidence: string
}

export interface DeterministicResult {
    signals: FraudSignal[]
    total_score: number
    multi_verify_passed: boolean  // true = nenhum sinal crítico
    e2e_validation: E2EValidation | null
}

// ============================================================
// VALIDATOR 1 — Pix E2E ID (Número de Controle)
// ============================================================
// BACEN format: E {ISPB:8} {YYYYMMDD:8} {HHmm:4} {random:11} = 32 chars total

export function validatePixE2EId(e2eId: string): E2EValidation {
    const base: E2EValidation = {
        valid: false, length: e2eId?.length ?? 0,
        ispb: null, banco_e2e: null, date_e2e: null, time_e2e: null, suffix: null, error: null
    }

    if (!e2eId) return { ...base, error: 'E2E ID ausente' }
    if (!e2eId.startsWith('E')) return { ...base, error: 'Não começa com E' }
    if (e2eId.length !== 32) return { ...base, error: `Comprimento ${e2eId.length} ≠ 32` }

    const ispb   = e2eId.slice(1, 9)
    const date   = e2eId.slice(9, 17)
    const time   = e2eId.slice(17, 21)
    const suffix = e2eId.slice(21)     // 11 chars

    if (!/^\d{8}$/.test(ispb))   return { ...base, ispb, error: `ISPB "${ispb}" não são 8 dígitos` }
    if (!/^\d{8}$/.test(date))   return { ...base, ispb, error: `Data "${date}" inválida no E2E` }
    if (!/^\d{4}$/.test(time))   return { ...base, ispb, date_e2e: date, error: `Hora "${time}" inválida no E2E` }
    if (!/^[A-Za-z0-9]{11}$/.test(suffix)) return { ...base, ispb, date_e2e: date, time_e2e: time, error: `Sufixo "${suffix}" inválido` }

    // Validate calendar date inside E2E
    const year  = parseInt(date.slice(0, 4))
    const month = parseInt(date.slice(4, 6))
    const day   = parseInt(date.slice(6, 8))
    if (year < 2020 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
        return { ...base, ispb, error: `Data ${date} fora do range esperado` }
    }

    return {
        valid: true,
        length: 32,
        ispb,
        banco_e2e: ISPB_BANCO[ispb] || `ISPB desconhecido: ${ispb}`,
        date_e2e: date,
        time_e2e: time,
        suffix,
        error: null
    }
}

// ============================================================
// VALIDATOR 2 — Date consistency (E2E vs documento)
// ============================================================

export function checkE2EDateVsDoc(e2eDate: string, docDate: string): boolean {
    if (!e2eDate || !docDate) return true // can't check, don't penalize

    // e2eDate = YYYYMMDD
    // docDate can be YYYY-MM-DD or DD/MM/YYYY or YYYYMMDD
    let normalized = docDate.replace(/[-/]/g, '')
    // if DD/MM/YYYY → DDMMYYYY → rearrange to YYYYMMDD
    if (normalized.length === 8) {
        const firstFour = parseInt(normalized.slice(0, 4))
        if (firstFour < 1900) {
            // Likely DD/MM/YYYY format → convert
            normalized = normalized.slice(4, 8) + normalized.slice(2, 4) + normalized.slice(0, 2)
        }
    }
    return e2eDate === normalized
}

// ============================================================
// VALIDATOR 3 — ISPB vs Banco declarado
// ============================================================

export function checkBankVsISPB(declaredBankName: string, ispbFromE2E: string): {
    match: boolean
    expected_ispb: string | null
    declared_normalized: string
} {
    const normalized = declaredBankName?.toLowerCase().trim() ?? ''
    const expectedISPB = BANK_NAME_TO_ISPB[normalized]
    
    if (!expectedISPB) return { match: true, expected_ispb: null, declared_normalized: normalized } // unknown bank, skip
    
    return {
        match: expectedISPB === ispbFromE2E,
        expected_ispb: expectedISPB,
        declared_normalized: normalized
    }
}

// ============================================================
// VALIDATOR 4 — Auto-transferência (pagador == recebedor)
// ============================================================

export function checkSelfTransfer(pix: PixData): {
    is_self_transfer: boolean
    evidence: string
} {
    const pagDoc = (pix.pagador_cpf_cnpj ?? '').replace(/\D/g, '')
    const recDoc = (pix.recebedor_cpf_cnpj ?? '').replace(/\D/g, '')

    // Compare raw digits — even masked values like ***.513.512-** match if same string
    const docMatch = pagDoc.length >= 4 && recDoc.length >= 4 && pagDoc === recDoc

    // Compare masked strings directly (e.g., "***.513.512-**" == "***.513.512-**")
    const rawMatch = (pix.pagador_cpf_cnpj ?? '') !== '' &&
        pix.pagador_cpf_cnpj === pix.recebedor_cpf_cnpj

    // Compare CNPJ/chave with recebedor_chave
    const chaveIsDoc = pix.recebedor_chave &&
        pix.recebedor_chave.replace(/\D/g, '') === pagDoc && pagDoc.length >= 8

    if (docMatch || rawMatch) {
        return { is_self_transfer: true, evidence: `CPF/CNPJ pagador "${pix.pagador_cpf_cnpj}" = recebedor "${pix.recebedor_cpf_cnpj}"` }
    }
    if (chaveIsDoc) {
        return { is_self_transfer: true, evidence: `Chave Pix "${pix.recebedor_chave}" é o próprio CPF/CNPJ do pagador` }
    }
    return { is_self_transfer: false, evidence: '' }
}

// ============================================================
// VALIDATOR 5 — Chave Pix format
// ============================================================

export function validatePixKey(chave: string): { valid: boolean; type: string; reason?: string } {
    if (!chave) return { valid: false, type: 'AUSENTE', reason: 'Chave vazia' }

    // CPF: 000.000.000-00 or 11 digits
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(chave) || /^\d{11}$/.test(chave)) return { valid: true, type: 'CPF' }

    // CNPJ: 00.000.000/0000-00 or 14 digits
    if (/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(chave) || /^\d{14}$/.test(chave)) return { valid: true, type: 'CNPJ' }

    // Phone: +55 11 91234-5678 or similar
    if (/^\+55\d{10,11}$/.test(chave.replace(/[\s-]/g, ''))) return { valid: true, type: 'TELEFONE' }

    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave)) return { valid: true, type: 'EMAIL' }

    // Random key: 36 char UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) return { valid: true, type: 'ALEATORIO' }

    return { valid: false, type: 'DESCONHECIDO', reason: `Formato não reconhecido: ${chave.slice(0, 30)}` }
}

// ============================================================
// MAIN — Run all deterministic checks and produce fraud signals
// ============================================================

export function runDeterministicFraudChecks(pix: PixData): DeterministicResult {
    const signals: FraudSignal[] = []
    let e2eValidation: E2EValidation | null = null

    // --- Check 1: Self-transfer ---
    const selfCheck = checkSelfTransfer(pix)
    if (selfCheck.is_self_transfer) {
        signals.push({ flag: 'AUTOTRANSFERENCIA', score: 90, evidence: selfCheck.evidence })
    }

    // --- Check 2: E2E ID ---
    if (pix.e2e_id) {
        e2eValidation = validatePixE2EId(pix.e2e_id)

        if (!e2eValidation.valid) {
            signals.push({ flag: 'CODIGO_E2E_INVALIDO', score: 65, evidence: e2eValidation.error ?? 'Formato inválido' })
        } else {
            // --- Check 3: Bank vs ISPB ---
            const bankName = pix.banco_origem_declarado || pix.pagador_banco || ''
            if (bankName) {
                const bankCheck = checkBankVsISPB(bankName, e2eValidation.ispb!)
                if (!bankCheck.match) {
                    signals.push({
                        flag: 'BANCO_E2E_INCOMPATIVEL',
                        score: 55,
                        evidence: `ISPB ${e2eValidation.ispb} (${e2eValidation.banco_e2e}) ≠ banco declarado "${bankName}" (ISPB esperado: ${bankCheck.expected_ispb})`
                    })
                }
            }

            // --- Check 4: Date in E2E vs document date ---
            if (pix.data && e2eValidation.date_e2e) {
                const dateMatch = checkE2EDateVsDoc(e2eValidation.date_e2e, pix.data)
                if (!dateMatch) {
                    signals.push({
                        flag: 'DATA_E2E_INCOMPATIVEL',
                        score: 50,
                        evidence: `Data no E2E ID: ${e2eValidation.date_e2e} ≠ data declarada: ${pix.data}`
                    })
                }
            }
        }
    } else {
        signals.push({ flag: 'SEM_CODIGO_E2E', score: 35, evidence: 'Comprovante Pix sem Número de Controle E2E' })
    }

    // --- Check 5: Chave Pix format ---
    if (pix.recebedor_chave) {
        const chaveCheck = validatePixKey(pix.recebedor_chave)
        if (!chaveCheck.valid) {
            signals.push({ flag: 'CHAVE_PIX_INVALIDA', score: 30, evidence: chaveCheck.reason ?? `Chave inválida: ${pix.recebedor_chave}` })
        }
    }

    const totalScore = Math.min(signals.reduce((acc, s) => acc + s.score, 0), 100)
    const criticalFlags = ['AUTOTRANSFERENCIA', 'CODIGO_E2E_INVALIDO', 'BANCO_E2E_INCOMPATIVEL', 'DATA_E2E_INCOMPATIVEL', 'CODIGO_E2E_DUPLICADO']
    const hasCritical = signals.some(s => criticalFlags.includes(s.flag))

    return {
        signals,
        total_score: totalScore,
        multi_verify_passed: !hasCritical,
        e2e_validation: e2eValidation
    }
}
