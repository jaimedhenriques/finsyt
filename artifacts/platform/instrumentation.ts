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
    const { assertRlsSafe, bootstrapRls } = await import("@workspace/db");
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
  }
}
