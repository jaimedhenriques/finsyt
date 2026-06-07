import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth";
import { csrfProtection } from "../middlewares/csrf";
import { trackDevice } from "../middlewares/deviceFingerprint";
import { listEvents } from "../lib/securityEvents";

const router = Router();

/**
 * Authenticated profile endpoints. CSRF protection is applied for any
 * state-changing request because the Clerk session cookie is sent
 * automatically by the browser on same-origin requests.
 *
 * `trackDevice()` fingerprints the caller (IP + UA) and emits a
 * `new_device` security event the first time we see a fingerprint for the
 * signed-in user — surfaced under Account & Security in the platform UI.
 */
router.use(requireAuth, csrfProtection(), trackDevice());

router.get("/me", async (req, res) => {
  try {
    const user = await clerkClient.users.getUser(req.userId!);
    res.json({
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  } catch {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.get("/me/sessions", async (req, res) => {
  try {
    const sessions = await clerkClient.sessions.getSessionList({
      userId: req.userId,
    });
    res.json({
      sessions: sessions.data.map((s) => ({
        id: s.id,
        status: s.status,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        expireAt: s.expireAt,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

/**
 * Revoke a session. Users may always revoke their own sessions. Revoking
 * another user's session is a privileged team action — it is gated on
 * `admin` role within the active organization, mirroring the
 * <RoleGate required="admin"> guard in the UI.
 */
router.post("/me/sessions/:id/revoke", async (req, res) => {
  try {
    const target = await clerkClient.sessions.getSession(req.params.id);
    if (target.userId !== req.userId) {
      const ctx = req.orgContext;
      const isOrgAdmin =
        !!ctx?.orgId && (ctx.orgRole === "admin" || ctx.orgRole === "owner");
      if (!isOrgAdmin) {
        res.status(403).json({ error: "Requires admin role to revoke another user's session" });
        return;
      }
      // Both actor and target must belong to the same active organization.
      const memberships = await clerkClient.users.getOrganizationMembershipList({
        userId: target.userId,
      });
      const sharesOrg = memberships.data.some((m) => m.organization.id === ctx.orgId);
      if (!sharesOrg) {
        res.status(403).json({ error: "Target user is not in your organization" });
        return;
      }
    }
    await clerkClient.sessions.revokeSession(req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

// Auth state — getAuth bypasses requireAuth wiring above only when mounted
// elsewhere; keep this as a sanity check for the integration.
router.get("/me/auth-state", (req, res) => {
  const auth = getAuth(req);
  res.json({ userId: auth.userId ?? null });
});

/**
 * Recent security events for the signed-in user (new-device sign-ins,
 * IP lockouts from failed-attempt bursts). Powers the "Recent sign-in
 * activity" card under Account & Security.
 */
router.get("/me/security-events", (req, res) => {
  res.json({ events: listEvents(req.userId!) });
});

export default router;
