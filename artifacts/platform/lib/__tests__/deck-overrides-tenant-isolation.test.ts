/**
 * RLS isolation tests for `deck_overrides`.
 *
 * The new per-workspace pinned overrides table (peerSetId, WACC, terminal
 * growth, …) is governed by the same Clerk-context RLS pattern used by
 * `peer_sets` / `screener_presets` — see the policies appended at the end
 * of `lib/db/src/rls-sql.ts` that read `app.current_clerk_org_id` and
 * `app.current_clerk_user_id`. Without an automated check, a regression in
 * the RLS bootstrap (someone forgets to FORCE RLS, drops a policy by
 * accident, or renames a column) would silently expose one bank's pinned
 * WACC / peer set to another tenant.
 *
 * This suite mirrors `workspaces-tenant-isolation.test.ts` (same harness,
 * same `node:test` style) but exercises the database directly through
 * `withClerkContext` so it pins the SQL-level guarantees the GET / PUT /
 * DELETE route in `app/api/workspaces/deck-overrides/route.ts` relies on:
 *
 *   - GET (SELECT) under org A only ever returns org A's row, even when
 *     org A explicitly queries for org B's id.
 *   - PUT (UPDATE) under org A targeting org B's row id matches zero rows
 *     and leaves org B's WACC untouched.
 *   - PUT (INSERT) under org A with a forged `org_id` is rejected by the
 *     `WITH CHECK` clause (defence-in-depth: the route's `eq(orgId)`
 *     filter would already block it).
 *   - DELETE under org A targeting org B's row id is a no-op.
 *
 * The test seeds the table with two distinct rows (one per Clerk org +
 * user) inside their own contexts, then runs the cross-tenant attempts.
 *
 * IMPORTANT: `DB_RUNTIME_ROLE` MUST be set in the environment BEFORE node
 * starts — `@workspace/db` captures the value into a top-level
 * `RUNTIME_ROLE` constant at import time, and `withClerkContext` only
 * issues `SET LOCAL ROLE app_runtime` when that constant is set. The
 * default DATABASE_URL connects as a privileged role (`postgres`) that
 * bypasses RLS, so without the role downgrade every cross-tenant query
 * would silently succeed and the suite would assert nothing. ES module
 * import hoisting means we cannot fix this from inside the test file —
 * the platform's `package.json > scripts.test` handles it (mirrors the
 * `dev` script).
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import {
  bootstrapRls,
  deckOverridesTable,
  ensureDeckOverridesSchema,
  withClerkContext,
} from "@workspace/db";

// Use date-suffixed Clerk-style ids so repeated runs don't collide and a
// developer running the suite locally never trips over a leftover row from
// a previously failed run. The format must match `CLERK_ORG_RE` /
// `CLERK_USER_RE` in `lib/db/src/index.ts`.
const SUFFIX = Date.now().toString(36);
const ORG_A = `org_deckRlsA_${SUFFIX}`;
const USER_A = `user_deckRlsA_${SUFFIX}`;
const ORG_B = `org_deckRlsB_${SUFFIX}`;
const USER_B = `user_deckRlsB_${SUFFIX}`;
const FORGED_ORG = `org_deckRlsForged_${SUFFIX}`;

function errorChain(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  while (cur) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      cur = null;
    }
  }
  return parts.join(" :: ");
}

before(async () => {
  // Self-heal the table + RLS policies before the suite runs so it works
  // against a freshly provisioned database. The platform's
  // `instrumentation.ts` does the same at server boot, but the test
  // runner bypasses Next.js startup.
  await ensureDeckOverridesSchema();
  const ok = await bootstrapRls();
  assert.ok(ok, "bootstrapRls() must succeed for the deck_overrides RLS test");
});

after(async () => {
  // Best-effort cleanup. Each tenant must enter its own context to delete
  // its own row — RLS would otherwise filter the DELETE down to zero rows
  // and the row would leak across runs.
  for (const [orgId, userId] of [
    [ORG_A, USER_A],
    [ORG_B, USER_B],
    // Cleanup for FORGED_ORG is "best effort" — if the forged INSERT was
    // (incorrectly) allowed by a regression, we still try to clean it up
    // here so the next run starts from a clean state.
    [FORGED_ORG, USER_A],
  ] as const) {
    try {
      await withClerkContext(orgId, userId, (tx) =>
        tx
          .delete(deckOverridesTable)
          .where(eq(deckOverridesTable.orgId, orgId)),
      );
    } catch {
      /* swallow — cleanup is advisory */
    }
  }
});

/**
 * Idempotent seed: each org writes (or refreshes) its own row inside its
 * own Clerk-context session. Mirrors the upsert in the PUT route handler.
 */
async function seedBothOrgs(): Promise<void> {
  await withClerkContext(ORG_A, USER_A, (tx) =>
    tx
      .insert(deckOverridesTable)
      .values({
        orgId: ORG_A,
        peerSetId: null,
        wacc: 0.09,
        terminalGrowth: 0.025,
        growthStage1: 0.10,
        growthStage2: 0.05,
        updatedByUserId: USER_A,
      })
      .onConflictDoUpdate({
        target: deckOverridesTable.orgId,
        set: {
          wacc: 0.09,
          terminalGrowth: 0.025,
          growthStage1: 0.10,
          growthStage2: 0.05,
          updatedByUserId: USER_A,
          updatedAt: sql`now()`,
        },
      }),
  );
  await withClerkContext(ORG_B, USER_B, (tx) =>
    tx
      .insert(deckOverridesTable)
      .values({
        orgId: ORG_B,
        peerSetId: null,
        wacc: 0.12,
        terminalGrowth: 0.03,
        growthStage1: 0.08,
        growthStage2: 0.04,
        updatedByUserId: USER_B,
      })
      .onConflictDoUpdate({
        target: deckOverridesTable.orgId,
        set: {
          wacc: 0.12,
          terminalGrowth: 0.03,
          growthStage1: 0.08,
          growthStage2: 0.04,
          updatedByUserId: USER_B,
          updatedAt: sql`now()`,
        },
      }),
  );
}

test("deck_overrides GET (SELECT) only returns the calling org's row", async () => {
  await seedBothOrgs();

  // Org A: SELECT * (no WHERE) — RLS must filter to A's row only.
  const visibleToA = await withClerkContext(ORG_A, USER_A, (tx) =>
    tx.select().from(deckOverridesTable),
  );
  const aRowsForA = visibleToA.filter((r) => r.orgId === ORG_A || r.orgId === ORG_B);
  assert.equal(
    aRowsForA.length,
    1,
    `org A must see exactly its own row out of {ORG_A, ORG_B}, saw ${aRowsForA.length}: ${JSON.stringify(visibleToA.map((r) => r.orgId))}`,
  );
  assert.equal(aRowsForA[0].orgId, ORG_A);
  assert.equal(aRowsForA[0].wacc, 0.09);
  assert.equal(aRowsForA[0].updatedByUserId, USER_A);
  assert.ok(
    visibleToA.every((r) => r.orgId !== ORG_B),
    `org B's row leaked into org A's SELECT: ${JSON.stringify(visibleToA.map((r) => r.orgId))}`,
  );

  // Org B: same — A's row must not leak.
  const visibleToB = await withClerkContext(ORG_B, USER_B, (tx) =>
    tx.select().from(deckOverridesTable),
  );
  const bRowsForB = visibleToB.filter((r) => r.orgId === ORG_A || r.orgId === ORG_B);
  assert.equal(bRowsForB.length, 1);
  assert.equal(bRowsForB[0].orgId, ORG_B);
  assert.equal(bRowsForB[0].wacc, 0.12);
  assert.ok(
    visibleToB.every((r) => r.orgId !== ORG_A),
    `org A's row leaked into org B's SELECT: ${JSON.stringify(visibleToB.map((r) => r.orgId))}`,
  );

  // Even an explicit WHERE org_id = ORG_B from inside org A returns
  // nothing — the policy is applied before the predicate is evaluated.
  const aSpyingOnB = await withClerkContext(ORG_A, USER_A, (tx) =>
    tx
      .select()
      .from(deckOverridesTable)
      .where(eq(deckOverridesTable.orgId, ORG_B)),
  );
  assert.deepEqual(
    aSpyingOnB,
    [],
    "org A must not be able to read org B's row by guessing the org id",
  );
});

test("deck_overrides PUT (UPDATE) under a foreign org cannot mutate another org's row", async () => {
  await seedBothOrgs();

  // Org A tries to UPDATE org B's row directly. RLS USING clause filters
  // it out before the SET runs, so the UPDATE matches zero rows.
  const updated = await withClerkContext(ORG_A, USER_A, (tx) =>
    tx
      .update(deckOverridesTable)
      .set({ wacc: 0.99, updatedByUserId: USER_A })
      .where(eq(deckOverridesTable.orgId, ORG_B))
      .returning(),
  );
  assert.equal(
    updated.length,
    0,
    `cross-org UPDATE leaked ${updated.length} row(s); RLS USING is broken`,
  );

  // Org B's row is intact — same WACC the seed wrote, still owned by USER_B.
  const bAfter = await withClerkContext(ORG_B, USER_B, (tx) =>
    tx
      .select()
      .from(deckOverridesTable)
      .where(eq(deckOverridesTable.orgId, ORG_B)),
  );
  assert.equal(bAfter.length, 1);
  assert.equal(
    bAfter[0].wacc,
    0.12,
    "org B's WACC must not have been overwritten by the cross-org UPDATE",
  );
  assert.equal(
    bAfter[0].updatedByUserId,
    USER_B,
    "org B's updatedByUserId must not have been overwritten by USER_A",
  );

  // Defence in depth: a PUT (INSERT) under org A with a forged org_id is
  // rejected by the WITH CHECK clause on the insert policy. We use a
  // FORGED_ORG (not ORG_B) to avoid the row collision masking the test.
  let insertErr: unknown = null;
  try {
    await withClerkContext(ORG_A, USER_A, (tx) =>
      tx
        .insert(deckOverridesTable)
        .values({
          orgId: FORGED_ORG,
          peerSetId: null,
          wacc: 0.99,
          terminalGrowth: 0.05,
          growthStage1: 0.20,
          growthStage2: 0.10,
          updatedByUserId: USER_A,
        })
        .returning(),
    );
  } catch (err) {
    insertErr = err;
  }
  assert.ok(
    insertErr && /row-level security/i.test(errorChain(insertErr)),
    `forged INSERT under org A should be blocked by RLS WITH CHECK; got: ${errorChain(insertErr) || "no error (insert succeeded!)"}`,
  );

  // And nothing leaked into the table under the forged id.
  const forgedAfter = await withClerkContext(FORGED_ORG, USER_A, (tx) =>
    tx
      .select()
      .from(deckOverridesTable)
      .where(eq(deckOverridesTable.orgId, FORGED_ORG)),
  );
  assert.deepEqual(
    forgedAfter,
    [],
    "forged INSERT should not have left any row behind under the forged org id",
  );
});

test("deck_overrides DELETE under a foreign org is a no-op", async () => {
  await seedBothOrgs();

  // Org A attempts to DELETE org B's row by id. RLS filters the DELETE
  // down to zero rows; the row stays put.
  const deleted = await withClerkContext(ORG_A, USER_A, (tx) =>
    tx
      .delete(deckOverridesTable)
      .where(eq(deckOverridesTable.orgId, ORG_B))
      .returning(),
  );
  assert.equal(
    deleted.length,
    0,
    `cross-org DELETE removed ${deleted.length} row(s); RLS USING on DELETE is broken`,
  );

  // Org B can still see its own row.
  const bAfter = await withClerkContext(ORG_B, USER_B, (tx) =>
    tx
      .select()
      .from(deckOverridesTable)
      .where(eq(deckOverridesTable.orgId, ORG_B)),
  );
  assert.equal(
    bAfter.length,
    1,
    "org B's deck_overrides row must survive a cross-org DELETE",
  );
  assert.equal(bAfter[0].orgId, ORG_B);
  assert.equal(bAfter[0].wacc, 0.12);
});
