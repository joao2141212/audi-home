import { tracer } from "@/ia/guard";
import { getRole } from "@/ia/rbac";

type Probe = { path: string; page?: string; startedAt: number; timer?: number; hardTimer?: number };
type RouteMeta = { path: string; pageName: string; flag?: string; role?: "Admin"|"Supervisor"|"Agente"|"Any" };

const t = tracer("IA.Nav");

function computeProbeMs(): number {
  // override manual (ex.: localStorage.setItem('ia:probe_ms','3000'))
  const override = Number(localStorage.getItem("ia:probe_ms") || "");
  if (override > 0) return override;

  // adaptar por rede (quando disponível)
  // 2g ⇒ 4500ms, 3g ⇒ 3000ms, 4g/5g/wifi ⇒ 1500ms
  const et = (navigator as any).connection?.effectiveType as string | undefined;
  if (et === "2g" || et === "slow-2g") return 4500;
  if (et === "3g") return 3000;
  return 1500;
}

export const RouteRegistry: RouteMeta[] = [
  { path: "/",            pageName: "Home",          role:"Any" },
  { path: "/live",        pageName: "LiveQueue",     role:"Any" },
  { path: "/conversations", pageName: "Conversations", role:"Any" },
  { path: "/settings",    pageName: "Settings",      role:"Any" },
  { path: "/channels",    pageName: "ChannelsPage",  flag:"labs.whatsapp_suite", role:"Admin" },
  { path: "/queues",      pageName: "QueuesPage",    flag:"labs.whatsapp_suite", role:"Admin" },
  { path: "/agents",      pageName: "AgentsPage",    flag:"labs.whatsapp_suite", role:"Supervisor" },
  { path: "/macros",      pageName: "MacrosPage",    flag:"labs.whatsapp_suite", role:"Supervisor" },
  { path: "/slas",        pageName: "SlasPage",      flag:"labs.whatsapp_suite", role:"Supervisor" },
  { path: "/reports",     pageName: "ReportsPage",   flag:"labs.whatsapp_suite", role:"Supervisor" },
  { path: "/integrations",pageName: "IntegrationsPage", flag:"labs.whatsapp_suite", role:"Admin" },
  { path: "/permissions", pageName: "PermissionsPage", flag:"labs.whatsapp_suite", role:"Admin" },
  { path: "/tags",        pageName: "TagsPage",        flag:"labs.whatsapp_suite", role:"Supervisor" }
];

let currentProbe: Probe | null = null;

// Hook a ser chamado quando Router fizer push/replace
export function startRouteProbe(path: string) {
  if (process.env.NODE_ENV === "production") return;
  const meta = RouteRegistry.find(r => r.path === path);
  const startedAt = Date.now();
  const softMs = computeProbeMs();        // ex.: 1500/3000/4500
  const hardMs = softMs + 5000;           // +5s de janela dura

  currentProbe = { path, page: meta?.pageName, startedAt };

  // SOFT timeout → aviso
  currentProbe.timer = window.setTimeout(() => {
    emitRouteSlow(path, meta, softMs);
    // arma um HARD timeout (fail de verdade)
    currentProbe.hardTimer = window.setTimeout(() => {
      // se até aqui não chegou beacon, então falha real
      if (currentProbe && currentProbe.path === path) {
        emitRouteFailure(path, meta, hardMs);
      }
    }, hardMs - softMs);
  }, softMs);
}

// Chamar quando PageBeacon sinalizar readiness
export function markPageReady(pageName: string) {
  if (!currentProbe) return;
  if (currentProbe.page && currentProbe.page !== pageName) return; // outro pageName
  if (currentProbe.timer) clearTimeout(currentProbe.timer);
  if (currentProbe.hardTimer) clearTimeout(currentProbe.hardTimer);
  t.step(`probe success ← ${pageName} (${Date.now() - currentProbe.startedAt}ms)`);
  currentProbe = null;

  // ao chegar tarde, esconda qualquer overlay "SLOW"
  window.dispatchEvent(new CustomEvent("IA_NAV_OK", { detail: { pageName } }));
}

function emitRouteSlow(path: string, meta?: RouteMeta, waitedMs?: number) {
  const detail = `Carregando devagar (${waitedMs}ms). Possíveis causas:\n• CHUNK_LOAD (lazy import)\n• Rede/CPU lenta\n• RBAC/FLAG conferindo\n• PAGE_BEACON atrasado`;
  const ev = new CustomEvent("IA_NAV_SLOW", { detail: { path, meta, detail } });
  window.dispatchEvent(ev);
  t.warn(`route slow: ${path} (${waitedMs}ms)`);
}

function emitRouteFailure(path: string, meta?: RouteMeta, waitedMs?: number) {
  const reasons: string[] = [];
  // 1) rota não registrada
  if (!meta) reasons.push("ROUTE_NOT_REGISTERED: Menu aponta para rota não registrada no RouteRegistry.");
  // 2) flag desligada
  const flag = meta?.flag;
  if (flag && !(window as any)?.localStorage?.getItem?.(flag)) {
    reasons.push(`FLAG_OFF: Feature flag "${flag}" ausente/desligada.`);
  }
  // 3) papel insuficiente
  const currentRole = getRole();
  const requiredRole = meta?.role;
  if (requiredRole && requiredRole !== "Any") {
    if (currentRole === "Any" || currentRole !== requiredRole) {
      reasons.push(`RBAC_GUARD: Rota requer papel ${requiredRole}, atual é ${currentRole}.`);
    }
  }
  // 4) import chunk (lazy) quebrado
  reasons.push("CHUNK_LOAD: Verifique lazy import/erro de rede — veja network tab por 404/ChunkLoadError.");
  // 5) export incorreto
  reasons.push("EXPORT_MISMATCH: Componente não exportado como default/nome esperado.");
  // 6) CSS ocultando
  reasons.push("CSS_HIDDEN: Container da página com display:none/opacity:0/height:0.");
  // 7) ErrorBoundary/Suspense
  reasons.push("BOUNDARY_SUSPENSE: ErrorBoundary capturou erro silencioso/Suspense sem fallback.");

  const detail = reasons.join("\n• ");
  const ev = new CustomEvent("IA_NAV_FAIL", { detail: { path, meta, detail } });
  window.dispatchEvent(ev);
  t.fail("ROUTE_TIMEOUT", `Sem page-ready em ${waitedMs}ms para ${path}\n• ${detail}`);
}
