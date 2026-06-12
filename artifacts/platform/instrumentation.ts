/**
 * Next.js instrumentation hook — runs once before the server starts accepting
 * requests in both development and production (Node.js runtime only).
 *
 * We use this to perform the fail-closed RLS safety check: if the Postgres
 * connection role is a superuser or has BYPASSRLS and DB_RUNTIME_ROLE is not
 * set, the process throws so that a misconfigured deployment is caught
 * immediately rather than silently serving cross-tenant data.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertRlsSafe, bootstrapRls, ensureDeckOverridesSchema, ensureLiveHighlightsSchema, ensureWorkspaceViewsSchema } = await import("@workspace/db");

    // Live Highlights tables must exist BEFORE bootstrapRls so the
    // tenant-isolation policies attach on first boot (the policy DO blocks
    // are no-ops when the target table doesn't exist yet). The DDL is
    // idempotent and pure CREATE TABLE IF NOT EXISTS, so it is safe to run
    // before any RLS context is bound.
    try {
      await ensureLiveHighlightsSchema();
    } catch (e) {
      console.error("[instrumentation] failed to bootstrap live-highlights schema", e);
      throw e;
    }

    // Self-heal the `deck_overrides` table before applying RLS. The RLS
    // policy block guards on `IF EXISTS`, so the table must exist by the
    // time `bootstrapRls()` runs or its policies silently won't attach.
    try {
      await ensureDeckOverridesSchema();
    } catch (e) {
      console.error("[instrumentation] failed to bootstrap deck_overrides schema", e);
      throw e;
    }

    // Self-heal the `workspace_views` table on the same fail-fast contract:
    // missing it would silently disable the deal-room "recent viewers" rail
    // and skip its RLS policy attachment in `bootstrapRls()` below.
    try {
      await ensureWorkspaceViewsSchema();
    } catch (e) {
      console.error("[instrumentation] failed to bootstrap workspace_views schema", e);
      throw e;
    }
    // Self-heal a fresh database on first boot: create the low-privilege
    // `app_runtime` role, grant privileges, and (re-)apply RLS policies.
    // The SQL is idempotent, so a failure here is a real misconfiguration
    // (missing privileges, network partition) and is fatal — refuse to start
    // rather than serve traffic with stale policies or a missing runtime role.
    const ok = await bootstrapRls();
    if (!ok) {
      throw new Error(
        "RLS bootstrap failed — see [bootstrapRls] warning above. Refusing to start " +
          "because tenant-isolation policies may be stale or the runtime role missing.",
      );
    }
    await assertRlsSafe();

    // Boot the in-process agent scheduler (node-cron). Only runs in the
    // Node.js server runtime — never in edge or browser bundles.
    if (process.env.AGENT_SCHEDULER_DISABLED !== "1") {
      try {
        const { startAgentScheduler } = await import("@/lib/agent-scheduler");
        startAgentScheduler();
      } catch (e) {
        console.error("[instrumentation] failed to start agent scheduler", e);
      }
    }

    // Bootstrap the Blueprint physical schema (idempotent CREATE TABLE IF NOT
    // EXISTS) and then seed Finsyt-curated Blueprints into the published
    // library. Failure to create tables IS fatal — without them the
    // /api/blueprints surface 500s. Seeding failures stay fail-soft: the
    // workspace can still author their own.
    try {
      const { ensureBlueprintSchema } = await import("@workspace/db");
      await ensureBlueprintSchema();
    } catch (e) {
      console.error("[instrumentation] failed to bootstrap blueprint schema", e);
      throw e;
    }
    try {
      const { ensureSeedBlueprints } = await import("@/lib/blueprint-seeds");
      await ensureSeedBlueprints();
    } catch (e) {
      console.error("[instrumentation] failed to seed blueprints", e);
    }
  }
}
