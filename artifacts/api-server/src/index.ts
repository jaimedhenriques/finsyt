import app from "./app";
import { logger } from "./lib/logger";
import { config } from "./lib/config";
import { assertRlsSafe, bootstrapRls, ensureAuditSchema } from "@workspace/db";

async function start() {
  // Self-heal a fresh database on first boot: create the low-privilege
  // `app_runtime` role, grant privileges, and (re-)apply tenant-isolation
  // policies. The SQL is idempotent, so this should always succeed against
  // a healthy database — a failure means a real misconfiguration (missing
  // privileges, network partition, etc.) and is fatal.
  const ok = await bootstrapRls();
  if (!ok) {
    throw new Error(
      "RLS bootstrap failed — see [bootstrapRls] warning above. Refusing to start " +
        "because tenant-isolation policies may be stale or the runtime role missing.",
    );
  }
  logger.info("RLS bootstrap applied");

  // Fail-closed: refuse to serve requests if the DB connection role is
  // privileged (superuser / BYPASSRLS) and DB_RUNTIME_ROLE is not configured,
  // or if DB_RUNTIME_ROLE is configured but that role does not exist.
  await assertRlsSafe();
  logger.info("RLS safety check passed");

  try {
    await ensureAuditSchema();
    logger.info("Audit schema ready");
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap audit schema");
  }

  app.listen(config.PORT, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info(
      { port: config.PORT, env: config.NODE_ENV, allowedOrigins: config.allowedOrigins.length },
      "Server listening",
    );
  });
}

start().catch((err) => {
  // Unhandled startup failures (e.g. assertRlsSafe() detecting a privileged
  // DB connection without DB_RUNTIME_ROLE) are fatal — log and exit so the
  // process doesn't silently enter a broken state.
  console.error("Fatal startup error:", err);
  process.exit(1);
});
