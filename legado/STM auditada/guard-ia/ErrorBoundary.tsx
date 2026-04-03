import React from "react";
import { tracer } from "@/ia/guard";

const t = tracer("IA.ErrorBoundary");

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: any }> {
  constructor(props: any) { super(props); this.state = {}; }
  static getDerivedStateFromError(error: any) { return { err: error }; }
  componentDidCatch(error: any, info: any) {
    t.fail("RENDER_ERROR", (error?.stack || error?.message || String(error)) + "\n" + (info?.componentStack || ""));
    const ev = new CustomEvent("IA_BOOT_FAIL", { detail: { reason: "ErrorBoundary: " + (error?.message || String(error)) } });
    window.dispatchEvent(ev);
  }
  render() {
    if (this.state.err && process.env.NODE_ENV !== "production") {
      return <div style={{ padding:24 }}><h3>Erro de renderização</h3><pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.err?.stack || this.state.err)}</pre></div>;
    }
    return this.props.children as any;
  }
}
