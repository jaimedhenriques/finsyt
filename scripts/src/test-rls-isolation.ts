/**
 * Integration test: prove that Postgres row-level security stops one tenant
 * from reading or modifying another tenant's data — even via a hand-crafted
 * query that "forgets" the org_id WHERE clause.
 *
 * Run with: pnpm --filter @workspace/scripts run test:rls
 */
import {
  pool,
  withOrgContext,
  withComplianceContext,
  organizationsTable,
  researchNotesTable,
  auditLog,
  ensureAuditSchema,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

const db = drizzle(pool);

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

function errorChain(err: unknown): string {
  const parts: string[] = [];
  let cur: any = err;
  while (cur) {
    if (cur instanceof Error) parts.push(cur.message);
    else parts.push(String(cur));
    cur = cur?.cause;
  }
  return parts.join(" :: ");
}

async function main() {
  console.log("RLS isolation tests");

  // Seed two organizations directly via a privileged context (we use orgA's
  // id to enter the org table — orgs are tenant-scoped to themselves).
  const suffix = Date.now().toString(36);
  const [orgA] = await db
    .insert(organizationsTable)
    .values({ name: `Acme ${suffix}`, slug: `acme-${suffix}` })
    .returning();
  const [orgB] = await db
    .insert(organizationsTable)
    .values({ name: `Globex ${suffix}`, slug: `globex-${suffix}` })
    .returning();

  try {
    // Each tenant writes a private note inside its own context.
    const noteA = await withOrgContext(orgA.id, (tx) =>
      tx
        .insert(researchNotesTable)
        .values({ orgId: orgA.id, authorUserId: "user-a", title: "secret-A", body: "" })
        .returning(),
    );
    const noteB = await withOrgContext(orgB.id, (tx) =>
      tx
        .insert(researchNotesTable)
        .values({ orgId: orgB.id, authorUserId: "user-b", title: "secret-B", body: "" })
        .returning(),
    );

    check("orgA can read its own note", noteA.length === 1);
    check("orgB can read its own note", noteB.length === 1);

    // 1. Naive cross-tenant read with a missing WHERE clause.
    const visibleToA = await withOrgContext(orgA.id, (tx) =>
      tx.select().from(researchNotesTable),
    );
    check(
      "orgA cannot see orgB's notes via SELECT *",
      visibleToA.every((n) => n.orgId === orgA.id),
      visibleToA,
    );

    // 2. Direct UPDATE attempt against another tenant's row id.
    const updated = await withOrgContext(orgA.id, (tx) =>
      tx
        .update(researchNotesTable)
        .set({ title: "pwned" })
        .where(sql`id = ${noteB[0].id}`)
        .returning(),
    );
    check("orgA cannot UPDATE orgB's row by id", updated.length === 0, updated);

    // 3. Direct DELETE attempt against another tenant's row id.
    const deleted = await withOrgContext(orgA.id, (tx) =>
      tx
        .delete(researchNotesTable)
        .where(sql`id = ${noteB[0].id}`)
        .returning(),
    );
    check("orgA cannot DELETE orgB's row by id", deleted.length === 0, deleted);

    // 4. INSERT with a forged org_id is rejected by WITH CHECK.
    let insertErr: unknown = null;
    try {
      await withOrgContext(orgA.id, (tx) =>
        tx
          .insert(researchNotesTable)
          .values({ orgId: orgB.id, authorUserId: "user-a", title: "forged", body: "" })
          .returning(),
      );
    } catch (err) {
      insertErr = err;
    }
    const insertBlocked =
      !!insertErr && /row-level security/i.test(errorChain(insertErr));
    check("orgA cannot INSERT a row tagged with orgB's id", insertBlocked, insertErr);

    // 5. With NO context set (but as the low-privilege runtime role), a query
    // against a tenant table returns nothing — the policy clause evaluates to
    // NULL because current_setting('app.current_org_id', true) is empty.
    const noCtx = await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL ROLE app_runtime"));
      const r = await tx.execute(sql`SELECT count(*)::int AS n FROM research_notes`);
      return (r.rows[0] as { n: number }).n;
    });
    check("queries with no app.current_org_id return zero rows", noCtx === 0, noCtx);

    // 6. orgB still sees its own row untouched.
    const finalB = await withOrgContext(orgB.id, (tx) =>
      tx.select().from(researchNotesTable),
    );
    check(
      "orgB's row is intact and titled 'secret-B'",
      finalB.length === 1 && finalB[0].title === "secret-B",
      finalB,
    );

    // ── audit_events isolation (compliance tables, Clerk-id channel) ─────
    // The compliance tables key on text Clerk-style org ids and have RLS
    // policies that read from `app.current_clerk_org_id` — set by
    // `withComplianceContext` and (for the standard write path) by
    // `auditLog` itself.
    await ensureAuditSchema();
    const clerkOrgA = `org_rlsTestA${Date.now().toString(36)}`;
    const clerkOrgB = `org_rlsTestB${Date.now().toString(36)}`;

    await auditLog({
      orgId: clerkOrgA,
      actorId: "user_a",
      action: "auth.login.success",
      metadata: { marker: "secret-audit-A" },
    });
    await auditLog({
      orgId: clerkOrgB,
      actorId: "user_b",
      action: "auth.login.success",
      metadata: { marker: "secret-audit-B" },
    });

    // 7. SELECT * from audit_events under orgA's compliance context only
    // returns orgA's rows — the policy filter blocks orgB's rows even
    // when the WHERE clause is missing.
    const auditVisibleToA = await withComplianceContext(clerkOrgA, (tx) =>
      tx.execute(sql`SELECT org_id, action FROM audit_events`),
    );
    check(
      "orgA cannot see orgB's audit events via SELECT *",
      auditVisibleToA.rows.length > 0 &&
        (auditVisibleToA.rows as Array<{ org_id: string }>).every(
          (r) => r.org_id === clerkOrgA,
        ),
      auditVisibleToA.rows,
    );

    // 8. INSERT with a forged org_id is rejected by WITH CHECK.
    let auditInsertErr: unknown = null;
    try {
      await withComplianceContext(clerkOrgA, (tx) =>
        tx.execute(sql`
          INSERT INTO audit_events (org_id, actor_type, action)
          VALUES (${clerkOrgB}, 'system', 'forged.event')
        `),
      );
    } catch (err) {
      auditInsertErr = err;
    }
    check(
      "orgA cannot INSERT an audit event tagged with orgB's id",
      !!auditInsertErr && /row-level security/i.test(errorChain(auditInsertErr)),
      auditInsertErr,
    );

    // 9. With NO compliance context bound, audit_events returns zero rows.
    const auditNoCtx = await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL ROLE app_runtime"));
      const r = await tx.execute(sql`SELECT count(*)::int AS n FROM audit_events`);
      return (r.rows[0] as { n: number }).n;
    });
    check(
      "queries with no app.current_clerk_org_id return zero audit rows",
      auditNoCtx === 0,
      auditNoCtx,
    );

    // 10. Cleanup the audit rows we just wrote — must enter the tenant's
    // compliance context to delete them.
    await withComplianceContext(clerkOrgA, (tx) =>
      tx.execute(sql`DELETE FROM audit_events WHERE org_id = ${clerkOrgA}`),
    );
    await withComplianceContext(clerkOrgB, (tx) =>
      tx.execute(sql`DELETE FROM audit_events WHERE org_id = ${clerkOrgB}`),
    );

    // ── Other compliance tables: same RLS policy, same Clerk-id channel.
    // `audit.ts > ensureAuditSchema` enables (and FORCEs) RLS on these
    // tables and installs a `<table>_tenant_isolation` policy keyed off
    // `app.current_clerk_org_id`. Mirror the audit_events checks for each
    // so a future regression (e.g. someone disabling RLS or dropping the
    // policy) is caught here.
    type ComplianceTable = {
      name: string;
      seedColumns: string;
      seedValues: (orgId: string) => ReturnType<typeof sql>;
      forgedInsert: (orgId: string) => ReturnType<typeof sql>;
    };
    const complianceTables: ComplianceTable[] = [
      {
        name: "org_retention_settings",
        seedColumns: "(org_id)",
        seedValues: (orgId) => sql`(${orgId})`,
        forgedInsert: (orgId) => sql`
          INSERT INTO org_retention_settings (org_id)
          VALUES (${orgId})
        `,
      },
      {
        name: "account_deletion_requests",
        seedColumns: "(org_id, actor_id, scheduled_for)",
        seedValues: (orgId) =>
          sql`(${orgId}, 'user_seed', now() + interval '30 days')`,
        forgedInsert: (orgId) => sql`
          INSERT INTO account_deletion_requests (org_id, actor_id, scheduled_for)
          VALUES (${orgId}, 'user_forged', now() + interval '30 days')
        `,
      },
      {
        name: "data_export_requests",
        seedColumns: "(org_id, actor_id)",
        seedValues: (orgId) => sql`(${orgId}, 'user_seed')`,
        forgedInsert: (orgId) => sql`
          INSERT INTO data_export_requests (org_id, actor_id)
          VALUES (${orgId}, 'user_forged')
        `,
      },
    ];

    for (const t of complianceTables) {
      // Seed one row in each tenant's compliance context.
      await withComplianceContext(clerkOrgA, (tx) =>
        tx.execute(sql`
          INSERT INTO ${sql.raw(t.name)} ${sql.raw(t.seedColumns)}
          VALUES ${t.seedValues(clerkOrgA)}
        `),
      );
      await withComplianceContext(clerkOrgB, (tx) =>
        tx.execute(sql`
          INSERT INTO ${sql.raw(t.name)} ${sql.raw(t.seedColumns)}
          VALUES ${t.seedValues(clerkOrgB)}
        `),
      );

      // Cross-tenant SELECT: orgA only sees its own rows.
      const visible = await withComplianceContext(clerkOrgA, (tx) =>
        tx.execute(sql`SELECT org_id FROM ${sql.raw(t.name)}`),
      );
      check(
        `orgA cannot see orgB's ${t.name} rows via SELECT *`,
        visible.rows.length > 0 &&
          (visible.rows as Array<{ org_id: string }>).every(
            (r) => r.org_id === clerkOrgA,
          ),
        visible.rows,
      );

      // Forged INSERT: WITH CHECK rejects rows tagged with the other tenant.
      let forgedErr: unknown = null;
      try {
        await withComplianceContext(clerkOrgA, (tx) =>
          tx.execute(t.forgedInsert(clerkOrgB)),
        );
      } catch (err) {
        forgedErr = err;
      }
      check(
        `orgA cannot INSERT a ${t.name} row tagged with orgB's id`,
        !!forgedErr && /row-level security/i.test(errorChain(forgedErr)),
        forgedErr,
      );

      // No compliance context bound: returns zero rows.
      const noCtxRows = await db.transaction(async (tx) => {
        await tx.execute(sql.raw("SET LOCAL ROLE app_runtime"));
        const r = await tx.execute(
          sql`SELECT count(*)::int AS n FROM ${sql.raw(t.name)}`,
        );
        return (r.rows[0] as { n: number }).n;
      });
      check(
        `queries with no app.current_clerk_org_id return zero ${t.name} rows`,
        noCtxRows === 0,
        noCtxRows,
      );

      // Cleanup the rows we just seeded — must enter each tenant's context.
      await withComplianceContext(clerkOrgA, (tx) =>
        tx.execute(
          sql`DELETE FROM ${sql.raw(t.name)} WHERE org_id = ${clerkOrgA}`,
        ),
      );
      await withComplianceContext(clerkOrgB, (tx) =>
        tx.execute(
          sql`DELETE FROM ${sql.raw(t.name)} WHERE org_id = ${clerkOrgB}`,
        ),
      );
    }
  } finally {
    // Cleanup — must enter each org's context to delete their own rows.
    await withOrgContext(orgA.id, (tx) =>
      tx.delete(researchNotesTable).where(sql`org_id = ${orgA.id}`),
    );
    await withOrgContext(orgB.id, (tx) =>
      tx.delete(researchNotesTable).where(sql`org_id = ${orgB.id}`),
    );
    await db.delete(organizationsTable).where(sql`id IN (${orgA.id}, ${orgB.id})`);
    await pool.end();
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll RLS isolation tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
