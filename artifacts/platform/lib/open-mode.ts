/**
 * Demo / "open mode" switch — TEMPORARY.
 *
 * When `PLATFORM_OPEN_MODE=1`, the platform skips the Clerk login wall and
 * resolves every request to a fixed demo principal so the app shell, agents,
 * research, inbox and company pages render without anyone signing in.
 *
 * SAFETY RULES:
 * - By default this is NEVER active in production (NODE_ENV === 'production'),
 *   regardless of the env var value. A production deployment that accidentally
 *   has PLATFORM_OPEN_MODE=1 will still enforce Clerk authentication.
 * - Set `PLATFORM_PRODUCTION_DEMO=1` to explicitly enable open mode in a
 *   controlled production demo deployment. This is intentional and must be
 *   set alongside PLATFORM_OPEN_MODE=1.
 * - Default is OFF so it never accidentally ships.
 * - Toggle on by setting PLATFORM_OPEN_MODE=1 in a non-production environment
 *   only (local dev, Replit preview, staging), or with PLATFORM_PRODUCTION_DEMO=1
 *   for a controlled live demo deployment.
 */
const RAW = process.env.PLATFORM_OPEN_MODE?.trim().toLowerCase() ?? "";
const ENV_ALLOWS = RAW === "1" || RAW === "true" || RAW === "yes";

/**
 * Explicit opt-in to run open/demo mode in a production deployment.
 * Must be set deliberately alongside PLATFORM_OPEN_MODE=1.
 */
const PRODUCTION_DEMO =
  process.env.PLATFORM_PRODUCTION_DEMO?.trim() === "1";

/** True in non-production environments where PLATFORM_OPEN_MODE is set,
 *  OR in a production deployment where PLATFORM_PRODUCTION_DEMO=1 is also set. */
export const OPEN_MODE: boolean =
  ENV_ALLOWS && (process.env.NODE_ENV !== "production" || PRODUCTION_DEMO);

/**
 * Demo principal used while OPEN_MODE is on.
 *
 * The IDs are deliberately Clerk-shaped (`user_…` / `org_…`) so they pass
 * the format regex inside `withClerkContext()` in lib/db. The local
 * `organizations.id` UUID below mirrors the existing `DEV_PRINCIPAL` UUID
 * so any code that already special-cases that org keeps working.
 */
export const DEMO_USER_ID = "user_demo_open_mode";
export const DEMO_ORG_ID = "org_demo_open_mode";
export const DEMO_ORG_LOCAL_UUID = "00000000-0000-0000-0000-000000000001";
export const DEMO_ORG_NAME = "Dev Org";
export const DEMO_ROLE = "owner" as const;
export const DEMO_CLERK_ROLE = "org:admin" as const;

export interface DemoAuth {
  userId: string;
  orgId: string;
  orgRole: string;
  sessionClaims: Record<string, unknown>;
}

export function demoAuth(): DemoAuth {
  return {
    userId: DEMO_USER_ID,
    orgId: DEMO_ORG_ID,
    orgRole: DEMO_CLERK_ROLE,
    // Mirror the org role into sessionClaims under both keys Clerk emits
    // (`org_role` and the abbreviated `o.rol`) so server pages that gate on
    // `sessionClaims.org_role` (e.g. /app/admin/providers/page.tsx) accept
    // the demo principal as an org admin.
    sessionClaims: {
      org_role: DEMO_CLERK_ROLE,
      "o.rol": DEMO_CLERK_ROLE,
    },
  };
}
