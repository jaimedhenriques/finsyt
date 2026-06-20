/**
 * One-shot demo seed.
 *
 * Provisions a Clerk user (`demo@finsyt.com` by default) plus a Clerk
 * organisation, then populates the org with a small but realistic set of
 * agents, agent-run "inbox" briefs, and saved research notes — so the
 * demo account never sees an empty Overview, Agents, or Inbox screen on
 * first login.
 *
 * Run once after deploying:
 *
 *     pnpm --filter @workspace/scripts run seed:demo
 *
 * Required env:
 *   CLERK_SECRET_KEY     — backend Clerk secret key
 *   DATABASE_URL         — same Postgres the platform uses
 *   DEMO_USER_PASSWORD   — password to provision (kept in secrets, not source)
 *
 * Optional env:
 *   DEMO_USER_EMAIL      — defaults to demo@finsyt.com
 *   DEMO_ORG_NAME        — defaults to "Finsyt Demo"
 *   DEMO_ORG_SLUG        — defaults to "finsyt-demo"
 *
 * The script is idempotent: re-running it will not create duplicate
 * users, orgs, agents, runs, or notes — it matches by email/slug/name.
 */
import { createClerkClient } from "@clerk/backend";

// Duck-typed check for a Clerk API error response. The `isClerkAPIResponseError`
// helper used to live in `@clerk/backend/errors` but was removed in v2.x — we
// only need to recognise the `{ status, clerkError, errors }` shape returned
// by failed Clerk API calls so the seed can recover from "already exists" 422s.
function isClerkAPIResponseError(
  err: unknown,
): err is { status: number; clerkError: true; errors: Array<{ code?: string; message?: string }> } {
  return (
    typeof err === "object" &&
    err !== null &&
    "clerkError" in err &&
    (err as { clerkError?: unknown }).clerkError === true &&
    typeof (err as { status?: unknown }).status === "number"
  );
}
import {
  pool,
  withClerkContext,
  withOrgContext,
  agentsTable,
  agentRunsTable,
  researchNotesTable,
  organizationsTable,
  membershipsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

const EMAIL = process.env.DEMO_USER_EMAIL || "demo@finsyt.com";
const ORG_NAME = process.env.DEMO_ORG_NAME || "Finsyt Demo";
const ORG_SLUG = process.env.DEMO_ORG_SLUG || "finsyt-demo";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

const clerkSecret = requireEnv("CLERK_SECRET_KEY");
const password = requireEnv("DEMO_USER_PASSWORD");
requireEnv("DATABASE_URL");

const clerk = createClerkClient({ secretKey: clerkSecret });

async function ensureUser(): Promise<{ id: string; firstName: string; lastName: string; createdNow: boolean }> {
  const existing = await clerk.users.getUserList({ emailAddress: [EMAIL], limit: 1 });
  if (existing.data.length > 0) {
    const u = existing.data[0]!;
    console.log(`✓ Clerk user already exists  user=${u.id}  email=${EMAIL}`);
    // Re-apply the password from env so the demo account stays in sync with
    // whatever DEMO_USER_PASSWORD is currently set to. This keeps the
    // sign-in smoke test (`tests/platform/sign-in.spec.ts`) reproducible
    // across environments — without it, the seed becomes a no-op for the
    // password and any rotation in the secret silently breaks the test.
    try {
      await clerk.users.updateUser(u.id, {
        password,
        skipPasswordChecks: true,
      });
      console.log(`  ↻ Reset password from DEMO_USER_PASSWORD`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ! Could not reset demo user password: ${msg}`);
    }
    // The demo account is a test fixture used by the sign-in smoke test —
    // we keep MFA off so the test can complete a single-factor sign-in.
    // Clerk dev/staging instances often enforce email_code as a second
    // factor at the instance level, which would otherwise leave every
    // sign-in attempt stuck in `needs_second_factor`. Real customer
    // accounts are unaffected.
    try {
      await clerk.users.disableUserMFA(u.id);
      console.log(`  ↻ Disabled MFA on demo user`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Common when MFA was already disabled — tolerate quietly.
      if (!/no.*verifications|not.*found|already/i.test(msg)) {
        console.warn(`  ! Could not disable MFA on demo user: ${msg}`);
      }
    }
    return {
      id: u.id,
      firstName: u.firstName ?? "Finsyt",
      lastName: u.lastName ?? "Demo",
      createdNow: false,
    };
  }
  const created = await clerk.users.createUser({
    emailAddress: [EMAIL],
    password,
    firstName: "Finsyt",
    lastName: "Demo",
    skipPasswordChecks: true,
    skipPasswordRequirement: false,
  });
  console.log(`+ Created Clerk user  user=${created.id}  email=${EMAIL}`);
  return { id: created.id, firstName: "Finsyt", lastName: "Demo", createdNow: true };
}

/**
 * Make Clerk's stored password match the current `DEMO_USER_PASSWORD` secret.
 *
 * Without this, `ensureUser` only sets the password on initial create — so
 * rotating the secret and re-running the seed silently leaves Clerk on the
 * old password, and reviewers get a confusing "wrong password" error. Verify
 * first to avoid pointless writes (and the resulting "you've been signed out
 * of all sessions" side-effects); only update on a mismatch.
 */
async function syncPassword(userId: string, createdNow: boolean): Promise<void> {
  if (createdNow) {
    // Just-created user already has the current password; nothing to do.
    console.log(`✓ Clerk password set from DEMO_USER_PASSWORD on create`);
    return;
  }
  try {
    await clerk.users.verifyPassword({ userId, password });
    console.log(`✓ Clerk password already matches DEMO_USER_PASSWORD`);
    return;
  } catch (err) {
    // Use Clerk's structured error: a 422 response with code
    // `form_password_incorrect` (or related verification codes) is the
    // expected drift signal — anything else (network, 5xx, missing user,
    // auth failure) should bubble up so we don't silently overwrite a
    // real account on an unrelated error.
    if (!isClerkAPIResponseError(err) || err.status !== 422) {
      throw err;
    }
    const driftCodes = new Set([
      "form_password_incorrect",
      "form_password_validation_failed",
      "verification_failed",
    ]);
    const isDrift = err.errors?.some((e) => e.code !== undefined && driftCodes.has(e.code));
    if (!isDrift) {
      throw err;
    }
  }
  await clerk.users.updateUser(userId, {
    password,
    skipPasswordChecks: true,
    signOutOfOtherSessions: true,
  });
  console.log(`+ Updated Clerk password to current DEMO_USER_PASSWORD (drift detected)`);
}

async function ensureOrg(creatorUserId: string): Promise<{ id: string; name: string }> {
  // Clerk's `getOrganizationList` doesn't filter by slug, so list & match.
  let cursor: string | undefined;
  let found: { id: string; name: string } | null = null;
  for (let page = 0; page < 20 && !found; page++) {
    const list = await clerk.organizations.getOrganizationList({
      limit: 100,
      offset: page * 100,
    });
    for (const o of list.data) {
      if (o.slug === ORG_SLUG) {
        found = { id: o.id, name: o.name };
        break;
      }
    }
    if (list.data.length < 100) break;
  }
  let createdNow = false;
  if (found) {
    console.log(`✓ Clerk org already exists  org=${found.id}  slug=${ORG_SLUG}`);
  } else {
    const created = await clerk.organizations.createOrganization({
      name: ORG_NAME,
      slug: ORG_SLUG,
      createdBy: creatorUserId,
    });
    console.log(`+ Created Clerk org  org=${created.id}  slug=${ORG_SLUG}`);
    found = { id: created.id, name: created.name };
    createdNow = true;
  }
  // When we just created the org with `createdBy`, Clerk automatically adds
  // the creator as a member with the configured creator role — adding them
  // again would error with "user already a member of organization". Only
  // attempt the explicit membership insert for orgs that pre-existed (e.g.
  // a re-run after the user was deleted out of the org).
  if (!createdNow) {
    const memberships = await clerk.organizations.getOrganizationMembershipList({
      organizationId: found.id,
      limit: 100,
    });
    const already = memberships.data.some((m) => m.publicUserData?.userId === creatorUserId);
    if (already) {
      console.log(`✓ User already a member of org`);
    } else {
      // Try the configured creator role first, then fall back to the legacy
      // unprefixed role name for older Clerk instances.
      const roles = ["org:admin", "admin"];
      let added = false;
      for (const role of roles) {
        try {
          await clerk.organizations.createOrganizationMembership({
            organizationId: found.id,
            userId: creatorUserId,
            role,
          });
          console.log(`+ Added user to org as ${role}`);
          added = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/already.*member|exists/i.test(msg)) {
            console.log(`✓ User already a member of org`);
            added = true;
            break;
          }
        }
      }
      if (!added) throw new Error(`Could not add user to org with any known role`);
    }
  }
  return found;
}

async function ensureLocalOrg(clerkOrgId: string, name: string): Promise<string> {
  // org-resolver lives in the platform package; replicate its logic here so
  // the script doesn't need to import a Next.js-only module.
  const found = await pool.query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [clerkOrgId],
  );
  if (found.rows[0]?.id) return found.rows[0].id;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
    [name, clerkOrgId],
  );
  if (inserted.rows[0]?.id) return inserted.rows[0].id;
  const again = await pool.query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [clerkOrgId],
  );
  if (!again.rows[0]?.id) throw new Error(`Could not provision local org for ${clerkOrgId}`);
  return again.rows[0].id;
}

async function ensureMembership(localOrgId: string, userId: string): Promise<void> {
  const exists = await pool.query(
    `SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [localOrgId, userId],
  );
  if (exists.rowCount && exists.rowCount > 0) {
    console.log(`✓ Local membership already exists`);
    return;
  }
  await pool.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (org_id, user_id) DO NOTHING`,
    [localOrgId, userId],
  );
  console.log(`+ Inserted local membership (role=owner)`);
}

const DEMO_AGENTS: Array<{
  name: string;
  category: "Monitoring" | "Research" | "Competitive" | "Earnings" | "Macro" | "Diligence";
  icon: string;
  status: "Running" | "Scheduled" | "Paused";
  schedule: { frequency: "Daily" | "Weekly" | "Real-time"; day?: string; time?: string; timezone?: string };
  instructions: string;
}> = [
  {
    name: "NVDA Earnings Watch",
    category: "Earnings",
    icon: "◉",
    status: "Running",
    schedule: { frequency: "Real-time", timezone: "ET" },
    instructions:
      "Watch NVDA for any earnings-related disclosure (8-K, transcript, guidance update). Surface a one-paragraph summary plus the three most material analyst questions and management's verbatim answers.",
  },
  {
    name: "AAPL & MSFT Coverage Brief",
    category: "Monitoring",
    icon: "◎",
    status: "Scheduled",
    schedule: { frequency: "Daily", time: "07:30", timezone: "ET" },
    instructions:
      "Each morning, summarise overnight news, sell-side rating changes, and notable insider transactions for AAPL and MSFT. Include a 3-line 'so-what' takeaway for the desk.",
  },
  {
    name: "Mega-Cap AI Competitive Map",
    category: "Competitive",
    icon: "▣",
    status: "Scheduled",
    schedule: { frequency: "Weekly", day: "Mon", time: "06:00", timezone: "ET" },
    instructions:
      "Compare GOOGL, META, MSFT, and NVDA on AI capex, infra spend disclosures, and product launches over the trailing week. Flag inflections vs the prior week.",
  },
  {
    name: "Macro Print Reader",
    category: "Macro",
    icon: "◧",
    status: "Scheduled",
    schedule: { frequency: "Daily", time: "08:35", timezone: "ET" },
    instructions:
      "Within 5 minutes of each US macro print (CPI, PCE, NFP, ISM), produce a 4-bullet read on the surprise vs consensus, the Fed-pricing reaction, and the top three S&P 500 sector reactions.",
  },
];

const DEMO_RUNS: Array<{
  agentName: string;
  headline: string;
  summary: string;
  ranAtMinutesAgo: number;
  read?: boolean;
  findings?: Array<{ title: string; detail: string }>;
  sources?: Array<{ label: string; url?: string }>;
}> = [
  {
    agentName: "NVDA Earnings Watch",
    headline: "NVDA prints record DC revenue, guides next quarter +9% above Street",
    summary:
      "Data Center revenue $30.2B (+154% YoY) cleared the buyside whisper. Management called out Blackwell ramp pacing as the primary swing factor for Q4 — a constructive read for the H2 setup.",
    ranAtMinutesAgo: 12,
    findings: [
      { title: "Data Center beat", detail: "$30.2B vs $28.7B Street, +154% YoY" },
      { title: "Q4 guide", detail: "Revenue $37.5B ± 2% vs Street $34.5B" },
      { title: "GM commentary", detail: "Non-GAAP gross margin guided to ~73-74%, Blackwell mix the swing factor" },
    ],
    sources: [
      { label: "NVDA Q3 FY26 transcript" },
      { label: "NVDA 8-K filed 2026-02-25" },
    ],
  },
  {
    agentName: "AAPL & MSFT Coverage Brief",
    headline: "MSFT — UBS lifts PT to $510, Azure capex commentary the read-through",
    summary:
      "UBS raised MSFT to $510 (from $480) citing Azure AI revenue growth ahead of model and capex disclosure consistent with FY27 EPS power. AAPL flat overnight, no notable headlines.",
    ranAtMinutesAgo: 95,
    findings: [
      { title: "UBS PT change", detail: "MSFT to $510 from $480 — Buy" },
      { title: "Capex read-through", detail: "FY26 capex pacing implies $90B+ vs $85B Street" },
    ],
    sources: [{ label: "UBS Equities — Karl Keirstead" }],
  },
  {
    agentName: "Mega-Cap AI Competitive Map",
    headline: "Weekly AI map — META widens its training-cluster lead",
    summary:
      "META disclosed a 600k H100-equivalent target for end-2026, ahead of GOOGL (450k) and MSFT (500k). NVDA continues to lead on supply allocation. No material changes from AAPL.",
    ranAtMinutesAgo: 60 * 22,
    read: true,
    findings: [
      { title: "Cluster size deltas", detail: "META +50k H100-eq WoW; GOOGL flat; MSFT +25k" },
    ],
    sources: [{ label: "META 10-K" }, { label: "Alphabet earnings call" }],
  },
];

const DEMO_NOTES: Array<{ title: string; body: string }> = [
  {
    title: "NVDA — Q3 FY26 read",
    body:
      "Bull case intact: data-center beat + raised guide + Blackwell pacing constructive.\n\n" +
      "Watch items:\n" +
      "• Hopper -> Blackwell mix risk on gross margin in the next two quarters.\n" +
      "• Sovereign demand mentioned 4x on the call (vs 1x last quarter) — political-risk tail.\n" +
      "• China revenue contribution falling — assume zero contribution by FY27.\n",
  },
  {
    title: "AAPL Services — TAM revisit",
    body:
      "Services run-rate ~$110B. Re-running the bull case at 11% CAGR through 2028 implies $165B by FY28; that supports a ~30x P/S on Services alone given the gross margin profile.\n\n" +
      "Risks: App Store regulatory in EU (DMA) and DOJ antitrust outcomes.",
  },
];

async function seedAgents(clerkOrgId: string, clerkUserId: string) {
  await withClerkContext(clerkOrgId, clerkUserId, async (tx) => {
    for (const a of DEMO_AGENTS) {
      const existing = await tx
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, clerkOrgId), eq(agentsTable.name, a.name)))
        .limit(1);
      if (existing.length > 0) {
        console.log(`✓ Agent already exists  name=${a.name}`);
        continue;
      }
      await tx.insert(agentsTable).values({
        orgId: clerkOrgId,
        authorUserId: clerkUserId,
        name: a.name,
        status: a.status,
        templateSlug: null,
        category: a.category,
        icon: a.icon,
        schedule: a.schedule,
        instructions: a.instructions,
        lastRunAt: a.status === "Running" ? new Date(Date.now() - 1000 * 60 * 30) : null,
      });
      console.log(`+ Inserted agent  name=${a.name}`);
    }
  });
}

async function seedRuns(clerkOrgId: string, clerkUserId: string) {
  await withClerkContext(clerkOrgId, clerkUserId, async (tx) => {
    const agents = await tx
      .select({ id: agentsTable.id, name: agentsTable.name, category: agentsTable.category, icon: agentsTable.icon })
      .from(agentsTable)
      .where(eq(agentsTable.orgId, clerkOrgId));
    const byName = new Map(agents.map((a) => [a.name, a]));
    for (const r of DEMO_RUNS) {
      const agent = byName.get(r.agentName);
      if (!agent) {
        console.log(`! Skipping run — parent agent not found  name=${r.agentName}`);
        continue;
      }
      const existing = await tx
        .select({ id: agentRunsTable.id })
        .from(agentRunsTable)
        .where(and(eq(agentRunsTable.orgId, clerkOrgId), eq(agentRunsTable.headline, r.headline)))
        .limit(1);
      if (existing.length > 0) {
        console.log(`✓ Agent run already exists  headline="${r.headline.slice(0, 40)}…"`);
        continue;
      }
      await tx.insert(agentRunsTable).values({
        orgId: clerkOrgId,
        agentId: agent.id,
        agentName: agent.name,
        category: agent.category,
        icon: agent.icon,
        triggeredBy: "scheduled",
        triggeredByUserId: null,
        ranAt: new Date(Date.now() - r.ranAtMinutesAgo * 60_000),
        read: r.read ?? false,
        headline: r.headline,
        summary: r.summary,
        findings: r.findings ?? [],
        sources: r.sources ?? [],
        runStatus: "ok",
      });
      console.log(`+ Inserted agent run  headline="${r.headline.slice(0, 40)}…"`);
    }
  });
}

async function seedResearchNotes(localOrgId: string, clerkUserId: string) {
  await withOrgContext(localOrgId, async (tx) => {
    for (const n of DEMO_NOTES) {
      const existing = await tx
        .select({ id: researchNotesTable.id })
        .from(researchNotesTable)
        .where(and(eq(researchNotesTable.orgId, localOrgId), eq(researchNotesTable.title, n.title)))
        .limit(1);
      if (existing.length > 0) {
        console.log(`✓ Research note already exists  title="${n.title}"`);
        continue;
      }
      await tx.insert(researchNotesTable).values({
        orgId: localOrgId,
        authorUserId: clerkUserId,
        title: n.title,
        body: n.body,
      });
      console.log(`+ Inserted research note  title="${n.title}"`);
    }
  });
}

async function main() {
  console.log(`\n── Demo seed ──`);
  console.log(`email     ${EMAIL}`);
  console.log(`org slug  ${ORG_SLUG}`);
  console.log();

  const user = await ensureUser();
  await syncPassword(user.id, user.createdNow);
  const org = await ensureOrg(user.id);
  const localOrgId = await ensureLocalOrg(org.id, org.name);
  await ensureMembership(localOrgId, user.id);

  await seedAgents(org.id, user.id);
  await seedRuns(org.id, user.id);
  await seedResearchNotes(localOrgId, user.id);

  console.log(`\n── Done ──`);
  console.log(`Sign in at /platform/sign-in with:`);
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: (value of DEMO_USER_PASSWORD secret)`);
}

main()
  .then(() => pool.end().then(() => process.exit(0)))
  .catch((err) => {
    console.error(err);
    pool.end().finally(() => process.exit(1));
  });
