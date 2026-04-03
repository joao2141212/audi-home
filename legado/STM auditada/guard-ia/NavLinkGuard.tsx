import { NavLink } from "react-router-dom";
import { startRouteProbe } from "@/ia/navGuardian";
export function NavLinkGuard(props: React.ComponentProps<typeof NavLink>) {
  return <NavLink {...props} onClick={(e) => { startRouteProbe(String(props.to)); props.onClick?.(e); }} />;
}
