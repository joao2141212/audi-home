import { useEffect, useState } from "react";
import { getDecodex } from "@/ia/guard";

type Fail = { kind: "BOOT" | "SLOW" | "FAIL"; detail: any };

export function ErrorOverlay() {
  const [fail, setFail] = useState<Fail | null>(null);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    const onBoot = (e: any) => setFail({ kind: "BOOT", detail: e.detail });
    const onSlow = (e: any) => setFail({ kind: "SLOW", detail: e.detail });
    const onFail = (e: any) => setFail({ kind: "FAIL", detail: e.detail });
    const onOk = () => setFail(null);

    window.addEventListener("IA_BOOT_FAIL" as any, onBoot);
    window.addEventListener("IA_NAV_SLOW" as any, onSlow);
    window.addEventListener("IA_NAV_FAIL" as any, onFail);
    window.addEventListener("IA_NAV_OK" as any, onOk);

    return () => {
      window.removeEventListener("IA_BOOT_FAIL" as any, onBoot);
      window.removeEventListener("IA_NAV_SLOW" as any, onSlow);
      window.removeEventListener("IA_NAV_FAIL" as any, onFail);
      window.removeEventListener("IA_NAV_OK" as any, onOk);
    };
  }, []);

  if (!fail || process.env.NODE_ENV === "production") return null;

  const isFail = fail.kind === "FAIL";
  const isSlow = fail.kind === "SLOW";
  const bg = isFail ? "rgba(255,0,0,.09)" : isSlow ? "rgba(255,191,0,.10)" : "rgba(255,0,0,.07)"; // vermelho vs amarelo vs boot
  const title = isFail ? "IA Guard — Falha" : isSlow ? "IA Guard — Carregando devagar" : "IA Guard — Falha";

  const path = fail.detail?.path || location.pathname;
  const meta = fail.detail?.meta;

  // Regra simples: usar pageName (quando houver) como scope do Decodex; senão, o path.
  const scope = meta?.pageName ? meta.pageName : (path || "scope");

  function copySTM() {
    const { stm } = getDecodex(scope);
    if (!stm) { setMsg(`Sem snapshot Decodex para scope "${scope}". Acione uma ação/erro nessa página primeiro.`); return; }
    navigator.clipboard?.writeText(stm).then(
      () => setMsg("STM copiado para a área de transferência."),
      () => setMsg("Falha ao copiar STM (permissão do navegador).")
    );
  }

  function downloadSTM() {
    const { stm } = getDecodex(scope);
    if (!stm) { setMsg(`Sem snapshot Decodex para scope "${scope}".`); return; }
    const blob = new Blob([stm], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${scope}.stm.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(`Arquivo baixado: ${scope}.stm.txt`);
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex: 99999, background: bg }}>
      <div style={{ maxWidth: 920, margin:"40px auto", background:"#fff", borderRadius:12, padding:24, boxShadow:"0 12px 48px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>{title}</div>
        <div style={{ fontSize:13, opacity:.75, marginBottom:12 }}>
          Rota: <code>{path}</code>
          {meta?.pageName ? <> | Page: <code>{meta.pageName}</code></> : null}
          {meta?.flag ? <> | Flag: <code>{meta.flag}</code></> : null}
          {meta?.role ? <> | Role: <code>{meta.role}</code></> : null}
        </div>
        <pre style={{ whiteSpace:"pre-wrap", fontSize:13, lineHeight:1.5 }}>
{String(fail.detail?.reason || fail.detail?.detail || fail.detail)}
        </pre>
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button onClick={copySTM} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #ddd" }}>Copiar STM</button>
          <button onClick={downloadSTM} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #ddd" }}>Baixar .stm.txt</button>
        </div>
        {msg && <div style={{ marginTop:8, fontSize:12, color:"#333" }}>{msg}</div>}
      </div>
    </div>
  );
}
