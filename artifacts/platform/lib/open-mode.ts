/**
 * Demo / "open mode" switch — TEMPORARY.
 *
 * When `PLATFORM_OPEN_MODE=1`, the platform skips the Clerk login wall and
 * resolves every request to a fixed demo principal so the app shell, agents,
 * research, inbox and company pages render without anyone signing in. This
 * exists because Google OAuth is currently broken and no demo Clerk user
 * has been provisioned yet (tracked separately under Task #104).
 *
 * MUST be off in any environment that touches real customer data.
 *
 * Toggle off by clearing the env var (or setting it to anything other than
 * "1" / "true"). Default is OFF so this never accidentally ships.
 */
const RAW = process.env.PLATFORM_OPEN_MODE?.trim().toLowerCase() ?? "";
export const OPEN_MODE: boolean = RAW === "1" || RAW === "true" || RAW === "yes";

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
