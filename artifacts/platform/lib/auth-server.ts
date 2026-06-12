/**
 * Server-side replacement for `auth()` from `@clerk/nextjs/server`.
 *
 * Behaviour:
 * - When `PLATFORM_OPEN_MODE` is OFF (default), this delegates straight to
 *   Clerk's real `auth()` — every API route gets the same shape it has always
 *   gotten and the login wall is enforced.
 * - When `PLATFORM_OPEN_MODE` is ON, this returns a fixed demo principal
 *   (`user_demo_open_mode` / `org_demo_open_mode`) so server code that reads
 *   `{ userId, orgId, orgRole }` resolves consistently and `withClerkContext`
 *   binds an RLS context for the demo workspace.
 *
 * Import this module in place of `@clerk/nextjs/server`'s `auth` from any
 * route handler / server component that wants to honour open mode.
 */
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { OPEN_MODE, demoAuth } from "./open-mode";

type ClerkAuthResult = Awaited<ReturnType<typeof clerkAuth>>;

export async function auth(): Promise<ClerkAuthResult> {
  if (OPEN_MODE) {
    // The Clerk auth() return type carries dozens of fields the rest of the
    // codebase never reads. We only synthesise the handful that are actually
    // destructured (`userId`, `orgId`, `orgRole`, `sessionClaims`) — anything
    // else falls through as undefined, which matches Clerk's shape for an
    // unauthenticated request and is safely ignored downstream.
    return demoAuth() as unknown as ClerkAuthResult;
  }
  return clerkAuth();
}
