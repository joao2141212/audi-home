// src/ia/decodex.ts
export type DecodexSnapshot = {
  ts: number;
  scope: string;            // ex.: "LiveQueue.Transfer"
  handler?: string;         // ex.: "handleTransfer"
  contract: {
    kind: string;
    name: string;
    intent: string;
    inputs: string;
    outputs: string;
    steps: string[];
    fail_modes?: { code:string; when:string }[];
    success_criteria?: string[];
  };
  log: Array<{ t:"step"|"fail"|"warn"; msg:string; code?:string }>;
};

export function toSTM(s: DecodexSnapshot): string {
  const seq  = s.log.filter(e => e.t==="step").map(e => e.msg).join("→") || "start";
  const fm   = (s.contract.fail_modes||[]).map(f => `${f.code}:${f.when}`).join(",") || "none";
  const fails= s.log.filter(e => e.t==="fail").map(e => `${e.code}:${e.msg}`).join(" | ") || "none";
  return [
    `[stm-js] scope=${s.scope} handler=${s.handler||"?"}`,
    `σ/seq=${seq}`,
    `δ/contract: ${s.contract.kind}:${s.contract.name} :: ${s.contract.intent}`,
    `δ/inputs: ${s.contract.inputs}`,
    `δ/outputs: ${s.contract.outputs}`,
    `κ/fail_modes: ${fm}`,
    `⊕/fails: ${fails}`,
    `⊕/ts:${s.ts}` 
  ].join("\n");
}
