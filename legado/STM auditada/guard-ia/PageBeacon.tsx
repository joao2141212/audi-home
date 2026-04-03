import { useEffect } from "react";
import { markPageReady } from "@/ia/navGuardian";
import { markAppRendered } from "@/ia/bootGuard";

/** Colocar no topo do JSX de cada página (inclui Home) */
export function PageBeacon({ name }: { name: string }) {
  useEffect(() => {
    markPageReady(name);
    markAppRendered(); // 1º render = heartbeat do app
  }, [name]);
  return <div data-ia-page={name} style={{ display: "contents" }} />;
}
