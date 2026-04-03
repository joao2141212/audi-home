// src/ia/rbac.ts
export type Role = "Any" | "Agente" | "Supervisor" | "Admin";

export function getRole(): Role {
  if (process.env.NODE_ENV === "production") return "Any";
  return (localStorage.getItem("ia:role") as Role) || "Supervisor";
}

export function setRole(r: Role) {
  localStorage.setItem("ia:role", r);
}
