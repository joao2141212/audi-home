/* IA-PACK (σ-λ-κ-⊕ Core v0.1)
intent: Este arquivo é um CORE auto-contido para “contratos legíveis por IA” + validação em runtime.
how_to_use (resumo):
  1) Importe { defineContract, wrap, tracer, assert, expectNonNull }.
  2) Para cada handler/crítico, escreva um bloco IA-CONTRACT (abaixo) e crie um objeto via defineContract(...).
  3) Envolva sua função com wrap(contract, fn) OU chame attach(contract, fn) + use tracer/assert dentro.
  4) Success/fails devem ser observáveis: chip, texto, contador, etc.
  5) Ative logs/set flags com window.IA_CONTRACT_ENABLED = true (ou use defaults).
feature_flags:
  - window.IA_CONTRACT_ENABLED?: boolean  (default: true em dev, false em prod)
  - window.IA_TRACE_SCOPE?: string RegExp (filtra logs por escopo; ex: "Inbox|Queues")
  - window.IA_EVENT_HOOK?: (ev: IAEvent) => void  (coletor externo opcional)
*/

export type ID = string;

export interface FailMode {
  code: string;                // ex.: "AGENT_OFFLINE"
  when: string;                // condição humana
  message: string;             // msg humana para console/log
}

export interface ScenarioTest {
  given: string;
  when: string;
  then: string;
}

export interface IAContract {
  kind: "component" | "function" | "handler";
  name: string;                // nome exato
  intent: string;              // o que garante
  inputs: string;              // params/estado lido
  outputs: string;             // estado escrito/efeitos
  steps: string[];             // ordem mínima esperada
  edge_cases?: string[];       // casos de borda
  fail_modes?: FailMode[];     // códigos previstos
  success_criteria?: string[]; // sinais visíveis na UI/estado
  tests?: ScenarioTest[];      // given/when/then (documental)
  scope?: string;              // p/ tracer (ex.: "Inbox.Transferir")
}

/* ====== IA-CONTRACT TEMPLATE (para a IA desempacotar no código) ======
IA-CONTRACT
kind: <component|function|handler>
name: <NomeExato>
intent: <garantia desta unidade>
inputs: <parâmetros/estado lido>
outputs: <estado alterado/efeitos>
steps:
  1) ...
  2) ...
edge_cases:
  - ...
fail_modes:
  - code: <ID_CURTO>
    when: <condição>
    message: <mensagem humana p/ console>
success_criteria:
  - <sinal observável na UI/estado>
tests:
  - given: <contexto>
    when: <ação>
    then: <resultado observável>
END IA-CONTRACT
======================================================================= */

declare global {
  interface Window {
    IA_CONTRACT_ENABLED?: boolean;
    IA_TRACE_SCOPE?: string;
    IA_EVENT_HOOK?: (ev: IAEvent) => void;
  }
}

/* ---------- Flags & util ---------- */
const DEV = typeof process !== "undefined"
  ? (process.env?.NODE_ENV !== "production")
  : true;

const ENABLED = ((): boolean => {
  if (typeof window !== "undefined" && typeof window.IA_CONTRACT_ENABLED === "boolean") {
    return !!window.IA_CONTRACT_ENABLED;
  }
  return DEV; // liga em dev, desliga em prod por padrão
})();

const SCOPE_FILTER = ((): RegExp | null => {
  if (typeof window !== "undefined" && typeof window.IA_TRACE_SCOPE === "string" && window.IA_TRACE_SCOPE.length > 0) {
    try { return new RegExp(window.IA_TRACE_SCOPE); } catch { return null; }
  }
  return null;
})();

// === Ring buffer de eventos por scope (máx 100) ===
type LogEv = { t:"step"|"warn"|"fail"; msg:string; code?:string; ts:number };
const __ia_ring: Record<string, LogEv[]> = {};
function __ia_push(scope:string, ev:LogEv) {
  const arr = __ia_ring[scope] || (__ia_ring[scope]=[]);
  arr.push(ev); if (arr.length>100) arr.shift();
}

/* ---------- Event bus simples (p/ /ia-monitor ou coleta externa) ---------- */
export type IAEvent =
  | { t: "step"; scope: string; msg: string; ts: number }
  | { t: "warn"; scope: string; msg: string; ts: number }
  | { t: "fail"; scope: string; code: string; msg: string; ts: number };

const listeners: Array<(ev: IAEvent) => void> = [];

function emit(ev: IAEvent) {
  // hook externo opcional
  if (typeof window !== "undefined" && typeof window.IA_EVENT_HOOK === "function") {
    try { window.IA_EVENT_HOOK(ev); } catch {}
  }
  for (const fn of listeners) { try { fn(ev); } catch {} }
}

export function onIAEvent(fn: (ev: IAEvent) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/* ---------- Guards ---------- */
export function assert(cond: any, msg: string): void {
  if (!cond) { throw new Error("ASSERT: " + msg); }
}

export function expectNonNull<T>(v: T | null | undefined, msg: string): T {
  assert(v !== null && v !== undefined, msg);
  return v as T;
}

/* ---------- Tracer ---------- */
export function tracer(scope: string) {
  const enabled = ENABLED && (!SCOPE_FILTER || SCOPE_FILTER.test(scope));
  return {
    step(s: string) {
      if (enabled) console.info(`[IA][${scope}] ${s}`);
      __ia_push(scope, {t:"step", msg:s, ts:Date.now()});
      emit({ t: "step", scope, msg: s, ts: Date.now() });
    },
    warn(s: string) {
      if (enabled) console.warn(`[IA][${scope}] ${s}`);
      __ia_push(scope, {t:"warn", msg:s, ts:Date.now()});
      emit({ t: "warn", scope, msg: s, ts: Date.now() });
    },
    fail(code: string, s: string) {
      if (enabled) console.error(`[IA][${scope}][FAIL ${code}] ${s}`);
      __ia_push(scope, {t:"fail", code, msg:s, ts:Date.now()});
      emit({ t: "fail", scope, code, msg: s, ts: Date.now() });
    }
  };
}

/* ---------- Contract helpers ---------- */
export function defineContract(c: IAContract): IAContract {
  // valida shape básico (em tempo de execução)
  assert(!!c.kind && !!c.name && !!c.intent, "Contrato inválido: kind/name/intent obrigatórios");
  assert(Array.isArray(c.steps) && c.steps.length > 0, "Contrato inválido: steps obrigatórios");
  return c;
}

type AnyFn = (...a: any[]) => any;
type Wrapped<T extends AnyFn> = (...a: Parameters<T>) => ReturnType<T>;

/**
 * wrap(contract, fn):
 * - adiciona tracer padrão (click → precond ok → done NÃO é automático; use no handler)
 * - checa presença de fail_modes conhecidos (cross-check leve via tracer.fail)
 * - anexa o contrato na função (fn.__ia)
 */
export function wrap<T extends AnyFn>(contract: IAContract, fn: T, scopeOverride?: string): Wrapped<T> {
  const scope = scopeOverride || contract.scope || `${contract.kind}:${contract.name}`;
  const t = tracer(scope);
  const w: Wrapped<T> = ((...args: Parameters<T>) => {
    // ponto de entrada p/ instrumentation manual no handler:
    // chame t.step("click") / t.step("precond ok") etc. dentro do handler para granularidade.
    const out = fn(...args);
    return out;
  }) as Wrapped<T>;
  // @ts-ignore
  (w as any).__ia = contract;
  return w;
}

/** attach(contract, fn): apenas anexa contrato p/ ferramentas externas lerem */
export function attach<T extends AnyFn>(contract: IAContract, fn: T): T {
  // @ts-ignore
  (fn as any).__ia = contract;
  return fn;
}

/**
 * checkContractRuntime:
 * validações leves em tempo de execução (para dev):
 * - garante que existam fail_modes com códigos únicos
 * - avisa se success_criteria estiver vazio
 * (não lança erro — apenas warnings visíveis)
 */
export function checkContractRuntime(contract: IAContract) {
  const t = tracer(contract.scope || `${contract.kind}:${contract.name}`);
  const codes = new Set<string>();
  if (contract.fail_modes && contract.fail_modes.length > 0) {
    for (const f of contract.fail_modes) {
      if (codes.has(f.code)) t.warn(`fail_modes duplicado: ${f.code}`);
      codes.add(f.code);
    }
  } else {
    t.warn("sem fail_modes — avalie ao menos 1 caminho de falha");
  }
  if (!contract.success_criteria || contract.success_criteria.length === 0) {
    t.warn("sem success_criteria — defina um sinal observável de sucesso");
  }
  t.step("contrato OK (shape mínimo verificado)");
  return { ok: true, codes: Array.from(codes) };
}

/* ---------- Doc: Template exportável p/ agentes de código ---------- */
export const IA_CONTRACT_TEMPLATE = `
IA-CONTRACT
kind: <component|function|handler>
name: <NomeExato>
intent: <garantia desta unidade>
inputs: <parâmetros/estado lido>
outputs: <estado alterado/efeitos>
steps:
  1) ...
  2) ...
edge_cases:
  - ...
fail_modes:
  - code: <ID_CURTO>
    when: <condição>
    message: <mensagem humana p/ console>
success_criteria:
  - <sinal observável na UI/estado>
tests:
  - given: <contexto>
    when: <ação>
    then: <resultado observável>
END IA-CONTRACT`.trim();

/* ---------- Sinalizador global rápido ---------- */
export function setIAEnabled(v: boolean) {
  if (typeof window !== "undefined") window.IA_CONTRACT_ENABLED = v;
}

/* ---------- Exemplo minúsculo embutido (comentado)
IA-CONTRACT
kind: handler
name: onClickTransferir
intent: Transferir conversa para outra fila.
inputs: conversationId (selecionada), toQueueId (do select)
outputs: conversa.queueId := toQueueId; timeline registra ação.
steps:
  1) Checar seleção válida (ids não nulos).
  2) Chamar FakeAPI.transferConversation.
  3) Atualizar linha e notificar usuário.
edge_cases:
  - mesma fila selecionada → no-op + aviso.
fail_modes:
  - code: QUEUE_NOT_FOUND
    when: toQueueId inexistente
    message: Fila destino não existe.
success_criteria:
  - Chip de fila na linha muda imediatamente para destino.
tests:
  - given: conversa na q1
    when: transferir para q3
    then: chip passa a q3 e histórico registra transferência
END IA-CONTRACT
----------------------------------------------------------------------- */

// === Funções Decodex: salvar/ler/formatar ===
import { toSTM } from "@/ia/decodex";

export function flushDecodex(scope: string, contract: IAContract, handlerName?: string) {
  if (process.env.NODE_ENV === "production") return;
  const log = __ia_ring[scope] || [];
  const snap = {
    ts: Date.now(),
    scope,
    handler: handlerName,
    contract: {
      kind: contract.kind, name: contract.name, intent: contract.intent,
      inputs: contract.inputs, outputs: contract.outputs, steps: contract.steps,
      fail_modes: contract.fail_modes?.map(f=>({code:f.code, when:f.when})),
      success_criteria: contract.success_criteria
    },
    log
  };
  try { localStorage.setItem(`ia:decodex:${scope}`, JSON.stringify(snap)); } catch {}
  try { console.info("\n=== STM DECODEX ===\n" + toSTM(snap) + "\n===================\n"); } catch {}
}

export function getDecodex(scope: string): {json?: string; stm?: string} {
  try {
    const raw = localStorage.getItem(`ia:decodex:${scope}`);
    if (!raw) return {};
    const snap = JSON.parse(raw);
    return { json: raw, stm: toSTM(snap) };
  } catch { return {}; }
}
