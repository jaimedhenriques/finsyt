import { computeSchemaDiff } from "./schema-diff";

/**
 * CLI wrapper for `computeSchemaDiff` used by `pnpm --filter @workspace/db run diff`.
 *
 * Read-only: it prints whether the live database matches the Drizzle schema and
 * exits non-zero when drift is detected (statements would be required to
 * reconcile), so it can gate CI without ever mutating the database.
 */
async function main() {
  const result = await computeSchemaDiff();

  if (result.inSync) {
    // eslint-disable-next-line no-console
    console.log("✓ Schema in sync — live database matches the Drizzle schema.");
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  console.error(
    `✗ Schema drift detected — ${result.statementCount} statement(s) would be ` +
      "required to reconcile the live database with the Drizzle schema:",
  );
  for (const stmt of result.statements) {
    // eslint-disable-next-line no-console
    console.error(`  ${stmt.replace(/\s+/g, " ").trim()}`);
  }
  if (result.hasDataLoss) {
    // eslint-disable-next-line no-console
    console.error(
      "\n⚠ Some statements may cause data loss. Review before running `push`.",
    );
  }
  for (const warning of result.warnings) {
    // eslint-disable-next-line no-console
    console.error(`  warning: ${warning}`);
  }
  process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
