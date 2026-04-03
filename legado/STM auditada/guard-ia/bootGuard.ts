/**
 * IA BootGuard — prova de vida do app (anti tela branca).
 * Liga capturas globais e exige "heartbeat" do React em 1500ms.
 */
import { tracer } from "@/ia/guard";

const t = tracer("IA.Boot");

let bootTimer: number | null = null;
let booted = false;

function showBootOverlay(reason: string) {
  const ev = new CustomEvent("IA_BOOT_FAIL", { detail: { reason } });
  window.dispatchEvent(ev);
  t.fail("BOOT_TIMEOUT", reason);
}

export function startBootGuard(rootSelector = "#root", timeoutMs = 1500) {
  if (process.env.NODE_ENV === "production") return;

  // 1) onerror + unhandledrejection
  window.addEventListener("error", (e) => {
    showBootOverlay("window.onerror: " + (e.error?.message || e.message || "erro desconhecido"));
  });
  window.addEventListener("unhandledrejection", (e: any) => {
    const msg = (e?.reason && (e.reason.stack || e.reason.message || String(e.reason))) || "unhandled rejection";
    showBootOverlay("unhandledrejection: " + msg);
  });

  // 2) root existence + CSS visibility
  const root = document.querySelector(rootSelector) as HTMLElement | null;
  if (!root) {
    showBootOverlay(`ROOT_NOT_FOUND: não existe ${rootSelector} no index.html`);
    return;
  }

  // 3) heartbeat timer
  bootTimer = window.setTimeout(() => {
    if (booted) return;
    const style = root ? getComputedStyle(root) : ({} as CSSStyleDeclaration);
    const invis =
      !root ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      root.clientHeight === 0 ||
      root.clientWidth === 0;

    const hints = [
      invis ? "CSS_HIDDEN: root invisível/altura 0" : "",
      "APP_NOT_RENDERED: React não montou ou export default incorreto",
      "CHUNK_LOAD: falha no lazy import (ver Network/Console)",
      "ROUTER_FAIL: rota inicial não registrada/guard bloqueando",
      "BOUNDARY: erro capturado silenciosamente por ErrorBoundary",
    ]
      .filter(Boolean)
      .join("\n• ");

    showBootOverlay(`Sem heartbeat do React em ${timeoutMs}ms\n• ${hints}`);
  }, timeoutMs);
}

export function markAppRendered() {
  // Chamar assim que App renderizar (PageBeacon de Home também chama).
  if (bootTimer) window.clearTimeout(bootTimer);
  booted = true;
  t.step("heartbeat recebido — app renderizou");
}
