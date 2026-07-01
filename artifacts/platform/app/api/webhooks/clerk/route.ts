/**
 * POST /platform/api/webhooks/clerk
 *
 * Receives Clerk webhook events and syncs SCIM-provisioned users and
 * organization memberships into the local `organizations` / `memberships`
 * tables so RLS tenant-isolation stays correct for enterprise SAML/SCIM
 * tenants.
 *
 * Covered events:
 *   organizationMembership.created  → upsert membership
 *   organizationMembership.updated  → update role
 *   organizationMembership.deleted  → delete membership
 *   user.updated                    → remove all memberships when banned/locked
 *   user.deleted                    → remove all memberships
 *
 * Payload shape: Clerk webhook payloads use snake_case (e.g.
 * `public_user_data`, `user_id`). This handler reads snake_case fields
 * first and falls back to camelCase for forward-compatibility.
 *
 * Security: every request is verified with the Svix HMAC signature carried
 * in the Clerk webhook headers. Requests without a valid signature are
 * rejected with 400. The signing secret lives in CLERK_WEBHOOK_SECRET.
 *
 * Setup: add this URL in the Clerk Dashboard → Webhooks.
 *   URL:    https://<your-domain>/platform/api/webhooks/clerk
 *   Events: organizationMembership.*, user.updated, user.deleted
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db, membershipsTable, organizationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { clerkRoleToInternal } from "@/lib/enterprise-sso";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

function missingSecret() {
  return NextResponse.json(
    {
      error: "webhook_unconfigured",
      message:
        "CLERK_WEBHOOK_SECRET is not set. Add it to Replit Secrets, then " +
        "register the webhook URL in the Clerk Dashboard → Webhooks.",
    },
    { status: 503 },
  );
}

async function verifySignature(
  req: NextRequest,
): Promise<{ payload: unknown; error?: never } | { payload?: never; error: NextResponse }> {
  if (!WEBHOOK_SECRET) {
    return { error: missingSecret() };
  }

  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return {
      error: NextResponse.json(
        { error: "Missing svix signature headers" },
        { status: 400 },
      ),
    };
  }

  const body = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);
  try {
    const payload = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
    return { payload };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 },
      ),
    };
  }
}

/**
 * Clerk webhook payloads use snake_case. These types mirror the real
 * wire format; camelCase aliases are accepted defensively for forward
 * compatibility in case the SDK evolves.
 */
type ClerkPublicUserData = {
  // Snake_case (actual Clerk webhook format)
  user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  identifier?: string | null;
  // camelCase fallback
  userId?: string | null;
};

type ClerkOrganizationRef = {
  id: string;
  name?: string | null;
  slug?: string | null;
};

type ClerkMembershipData = {
  id: string;
  role: string;
  organization?: ClerkOrganizationRef | null;
  // Snake_case (actual Clerk webhook format)
  public_user_data?: ClerkPublicUserData | null;
  // camelCase fallback
  publicUserData?: ClerkPublicUserData | null;
};

type ClerkUserData = {
  id: string;
  /** true when the Clerk user has been banned via dashboard or SCIM */
  banned?: boolean;
  /** true when the Clerk user is locked due to repeated failed attempts */
  locked?: boolean;
  /** deleted_at is set on soft-deleted users in some event shapes */
  deleted?: boolean;
};

type WebhookPayload =
  | { type: "organizationMembership.created"; data: ClerkMembershipData }
  | { type: "organizationMembership.updated"; data: ClerkMembershipData }
  | { type: "organizationMembership.deleted"; data: ClerkMembershipData }
  | { type: "user.updated"; data: ClerkUserData }
  | { type: "user.deleted"; data: ClerkUserData }
  | { type: string; data: unknown };

/** Extract user id from the membership's public_user_data (snake or camel). */
function memberUserId(data: ClerkMembershipData): string | null {
  // Prefer snake_case (canonical Clerk webhook format)
  return (
    data.public_user_data?.user_id ??
    data.publicUserData?.user_id ??
    data.publicUserData?.userId ??
    null
  );
}

async function handleMembershipUpsert(data: ClerkMembershipData): Promise<void> {
  const clerkOrgId = data.organization?.id;
  const orgName = data.organization?.name ?? data.organization?.slug ?? undefined;
  const userId = memberUserId(data);

  if (!clerkOrgId || !userId) return;

  const localOrgId = await resolveLocalOrgId(clerkOrgId, orgName);
  const role = clerkRoleToInternal(data.role);

  await db
    .insert(membershipsTable)
    .values({ orgId: localOrgId, userId, role })
    .onConflictDoUpdate({
      target: [membershipsTable.orgId, membershipsTable.userId],
      set: { role },
    });
}

async function handleMembershipDelete(data: ClerkMembershipData): Promise<void> {
  const clerkOrgId = data.organization?.id;
  const userId = memberUserId(data);

  if (!clerkOrgId || !userId) return;

  const found = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, clerkOrgId))
    .limit(1);

  const localOrgId = found[0]?.id;
  if (!localOrgId) return;

  await db
    .delete(membershipsTable)
    .where(
      and(
        eq(membershipsTable.orgId, localOrgId),
        eq(membershipsTable.userId, userId),
      ),
    );
}

/**
 * When a user is banned, locked, or deleted, revoke all their local
 * memberships so they cannot pass RLS checks on any tenant's data.
 *
 * For user.updated: only act when `banned` or `locked` is true — a
 * routine profile update (name, email) should not touch memberships.
 */
async function handleUserRevocation(data: ClerkUserData): Promise<void> {
  if (!data.id) return;
  await db
    .delete(membershipsTable)
    .where(eq(membershipsTable.userId, data.id));
}

export async function POST(req: NextRequest) {
  const verified = await verifySignature(req);
  if (verified.error) return verified.error;

  const event = verified.payload as WebhookPayload;

  try {
    switch (event.type) {
      case "organizationMembership.created":
      case "organizationMembership.updated":
        await handleMembershipUpsert(event.data as ClerkMembershipData);
        break;
      case "organizationMembership.deleted":
        await handleMembershipDelete(event.data as ClerkMembershipData);
        break;
      case "user.deleted":
        await handleUserRevocation(event.data as ClerkUserData);
        break;
      case "user.updated": {
        // Only revoke when the user has been banned or locked — routine
        // profile updates (name change, email update) should not remove
        // memberships.
        const ud = event.data as ClerkUserData;
        if (ud.banned || ud.locked || ud.deleted) {
          await handleUserRevocation(ud);
        }
        break;
      }
      default:
        // Unknown event type — acknowledge receipt so Clerk does not retry.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "sync_failed", message: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export function GET() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}
