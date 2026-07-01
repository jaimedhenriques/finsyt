/**
 * Enterprise SSO / SCIM role mapping utilities.
 *
 * Clerk represents organization roles as `org:<role>` strings (e.g.
 * `org:admin`, `org:member`). Enterprise directory roles arriving via
 * SCIM may also carry custom labels. This module normalises all of them
 * to the four-level internal model (owner / admin / member / viewer).
 */

import type { Role } from "@workspace/db";

/**
 * Map a raw Clerk organization role string to the internal Role enum.
 *
 * Clerk → internal mapping:
 *   org:owner  → owner
 *   org:admin  → admin
 *   org:member → member  (default for SCIM-provisioned users)
 *   org:viewer / guest_member → viewer
 *   <anything else> → member  (safe default)
 */
export function clerkRoleToInternal(clerkRole: string): Role {
  const normalized = clerkRole.replace(/^org:/, "").toLowerCase();
  switch (normalized) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "viewer":
    case "guest_member":
    case "guest":
      return "viewer";
    case "member":
    case "basic_member":
    default:
      return "member";
  }
}

/**
 * Map an internal Role back to the Clerk org:<role> string used in the
 * Clerk SDK (invitations, updateOrganizationMembership, etc.).
 *
 * NOTE: Clerk does not support a first-class "viewer" role in the SDK, so
 * viewer maps to `org:member` (it is enforced at the application layer).
 */
export const INTERNAL_TO_CLERK_ROLE: Record<Role, string> = {
  owner: "org:admin",
  admin: "org:admin",
  member: "org:member",
  viewer: "org:member",
};

/**
 * True when the Clerk role string represents an admin-level identity.
 * Used in server-side guards before performing org mutations.
 */
export function isClerkAdmin(clerkRole: string | null | undefined): boolean {
  const r = (clerkRole ?? "").replace(/^org:/, "").toLowerCase();
  return r === "owner" || r === "admin";
}
