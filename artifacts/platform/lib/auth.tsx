"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function roleAtLeast(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export interface Principal {
  userId: string;
  orgId: string;
  orgName: string;
  role: Role;
}

const PrincipalContext = createContext<Principal | null>(null);

export function PrincipalProvider({
  value,
  children,
}: {
  value: Principal | null;
  children: ReactNode;
}) {
  return <PrincipalContext.Provider value={value}>{children}</PrincipalContext.Provider>;
}

export function usePrincipal(): Principal | null {
  return useContext(PrincipalContext);
}

export function useHasRole(required: Role): boolean {
  const p = usePrincipal();
  return !!p && roleAtLeast(p.role, required);
}

/**
 * Wraps an affordance (button, link, settings panel) so it only renders for
 * principals at or above the required role. Mirrors the server-side
 * `assertRole()` guard so the UI never offers an action the API will reject.
 */
export function RoleGate({
  required,
  fallback = null,
  children,
}: {
  required: Role;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = useHasRole(required);
  return <>{allowed ? children : fallback}</>;
}

/**
 * Headers to attach to every fetch from the platform to the API server so the
 * gateway can hydrate `req.principal` and `withOrgContext()` can bind the
 * tenant id on the database connection.
 */
export function principalHeaders(p: Principal): Record<string, string> {
  return {
    "x-user-id": p.userId,
    "x-org-id": p.orgId,
    "x-user-role": p.role,
  };
}

/**
 * Dev-only stub principal so screens can render in the workspace before the
 * real auth task lands.
 *
 * NOTE: when `PLATFORM_OPEN_MODE=1` the server resolves every request to the
 * demo principal in `lib/open-mode.ts` (`user_demo_open_mode` /
 * `org_demo_open_mode`, mapped to local org UUID
 * `00000000-0000-0000-0000-000000000001`). The IDs below mirror that demo
 * identity so client-side `usePrincipal()` reads consistent values across
 * components — including for fetches to the api-server gateway, which expects
 * Clerk-shaped `x-user-id` / `x-org-id` headers.
 */
export const DEV_PRINCIPAL: Principal = {
  userId: "user_demo_open_mode",
  orgId: "org_demo_open_mode",
  orgName: "Dev Org",
  role: "owner",
};
