import { Router } from "express";
import { z } from "zod";
import { clerkClient } from "@clerk/express";
import { requireAuth, requireOrgRole } from "../middlewares/requireAuth";
import { csrfProtection } from "../middlewares/csrf";
import { writeLimiter } from "../middlewares/rateLimit";
import { logger } from "../lib/logger";

const router = Router();

router.use(requireAuth, csrfProtection());

const APP_TO_CLERK_ROLE: Record<string, string> = {
  owner: "org:admin",
  admin: "org:admin",
  member: "org:member",
  viewer: "org:viewer",
};

const inviteSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(["admin", "member", "viewer"]),
});

const roleSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

const createOrgSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/i, "Slug may only contain letters, numbers and dashes")
    .optional(),
});

interface MemberLike {
  id: string;
  role: string;
  publicUserData?: {
    userId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    identifier?: string | null;
    imageUrl?: string | null;
  } | null;
  createdAt: number | string;
}
function shapeMember(raw: unknown) {
  const m = raw as MemberLike;
  const u = m.publicUserData;
  const fullName = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
  return {
    membershipId: m.id,
    userId: u?.userId ?? null,
    name: fullName || u?.identifier || "Teammate",
    email: u?.identifier ?? null,
    imageUrl: u?.imageUrl ?? null,
    role: m.role.replace(/^org:/, ""),
    status: "active" as const,
    joinedAt: m.createdAt,
  };
}

interface InvitationLike {
  id: string;
  emailAddress: string;
  role: string;
  status: string;
  createdAt: number | string;
}
function shapeInvitation(raw: unknown) {
  const i = raw as InvitationLike;
  return {
    invitationId: i.id,
    email: i.emailAddress,
    role: i.role.replace(/^org:/, ""),
    status: "invited" as const,
    invitedAt: i.createdAt,
    rawStatus: i.status,
  };
}

/**
 * Snapshot of the active workspace: org details, members, and pending
 * invitations. Returns 200 with `organization: null` when the user has not
 * created or joined an org yet so the UI can prompt them to create one.
 */
router.get("/team", async (req, res, next) => {
  try {
    const orgId = req.orgContext?.orgId;
    if (!orgId) {
      res.json({ organization: null, members: [], invitations: [] });
      return;
    }
    const [org, members, invitationsPage] = await Promise.all([
      clerkClient.organizations.getOrganization({ organizationId: orgId }),
      clerkClient.organizations.getOrganizationMembershipList({
        organizationId: orgId,
        limit: 100,
      }),
      clerkClient.organizations.getOrganizationInvitationList({
        organizationId: orgId,
        status: ["pending"],
      }),
    ]);
    res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        membersCount: org.membersCount ?? members.data.length,
        role: req.orgContext?.orgRole,
      },
      members: members.data.map(shapeMember),
      invitations: invitationsPage.data.map(shapeInvitation),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new organization with the current user as the admin/creator.
 * Any signed-in user can do this — it is how Enterprise prospects bootstrap
 * their team workspace from a personal account.
 */
router.post("/team", writeLimiter, async (req, res, next) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const org = await clerkClient.organizations.createOrganization({
      name: parsed.data.name,
      slug: parsed.data.slug,
      createdBy: req.userId!,
    });
    logger.info({ orgId: org.id, userId: req.userId }, "Organization created");
    res.status(201).json({
      organization: { id: org.id, name: org.name, slug: org.slug },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Invite a teammate by email. Admin-only — the role gate mirrors the
 * <RoleGate required="admin"> guard on the Settings → Team UI so the API
 * never accepts an action the UI hides.
 */
router.post(
  "/team/invitations",
  writeLimiter,
  requireOrgRole("admin"),
  async (req, res, next) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    try {
      const inv = await clerkClient.organizations.createOrganizationInvitation({
        organizationId: req.orgContext!.orgId!,
        emailAddress: parsed.data.email,
        role: APP_TO_CLERK_ROLE[parsed.data.role],
        inviterUserId: req.userId!,
      });
      logger.info(
        { invitationId: inv.id, orgId: req.orgContext!.orgId, role: parsed.data.role },
        "Org invitation sent",
      );
      res.status(201).json({ invitation: shapeInvitation(inv) });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/team/invitations/:id",
  requireOrgRole("admin"),
  async (req, res, next) => {
    try {
      await clerkClient.organizations.revokeOrganizationInvitation({
        organizationId: req.orgContext!.orgId!,
        invitationId: String(req.params.id),
        requestingUserId: req.userId!,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/team/members/:userId",
  requireOrgRole("admin"),
  async (req, res, next) => {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    try {
      const m = await clerkClient.organizations.updateOrganizationMembership({
        organizationId: req.orgContext!.orgId!,
        userId: String(req.params.userId),
        role: APP_TO_CLERK_ROLE[parsed.data.role],
      });
      res.json({ member: shapeMember(m) });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/team/members/:userId",
  requireOrgRole("admin"),
  async (req, res, next) => {
    if (req.params.userId === req.userId) {
      res.status(400).json({ error: "You cannot remove yourself; transfer ownership first" });
      return;
    }
    try {
      await clerkClient.organizations.deleteOrganizationMembership({
        organizationId: req.orgContext!.orgId!,
        userId: String(req.params.userId),
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
