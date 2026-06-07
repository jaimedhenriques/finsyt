import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { Role } from "@workspace/db/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      orgContext?: {
        orgId: string | null;
        orgSlug: string | null;
        orgRole: Role | null;
      };
    }
  }
}

/**
 * Map Clerk's organization role strings (e.g. `org:admin`, `org:member`,
 * historically `admin`/`basic_member`) onto the app's `Role` enum so the
 * rest of the stack only deals with one vocabulary.
 */
function mapClerkOrgRole(raw: unknown): Role | null {
  if (typeof raw !== "string") return null;
  const r = raw.replace(/^org:/, "").toLowerCase();
  switch (r) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "member":
    case "basic_member":
      return "member";
    case "viewer":
    case "guest_member":
      return "viewer";
    default:
      return null;
  }
}

/**
 * Require an authenticated Clerk session on the request.
 *
 * In the browser, the Clerk `__session` cookie is sent automatically with
 * same-origin API calls — which makes these endpoints CSRF-eligible. Always
 * pair `requireAuth` with `csrfProtection()` on routers that mutate state.
 *
 * When the user has an active organization in their session, the org id,
 * slug and role are also stamped onto `req.orgContext` so downstream
 * handlers can scope queries (e.g. via `withOrgContext`) and gate
 * sensitive actions (billing, revoking other users' sessions) by role.
 */
export const requireAuth: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  req.orgContext = {
    orgId: auth.orgId ?? null,
    orgSlug: auth.orgSlug ?? null,
    orgRole: mapClerkOrgRole(auth.orgRole),
  };
  next();
};

/**
 * Gate a route on a minimum organization role. Returns 403 when the
 * caller is missing org context (no active org selected) or has a role
 * below the threshold. Mirrors the `<RoleGate>` UI guard so the API
 * never accepts an action the UI hides.
 */
export function requireOrgRole(min: Role): RequestHandler {
  const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
  return (req, res, next): void => {
    const ctx = req.orgContext;
    if (!ctx?.orgId || !ctx.orgRole) {
      res.status(403).json({ error: "No active organization" });
      return;
    }
    if (RANK[ctx.orgRole] < RANK[min]) {
      res.status(403).json({ error: `Requires ${min} role` });
      return;
    }
    next();
  };
}
