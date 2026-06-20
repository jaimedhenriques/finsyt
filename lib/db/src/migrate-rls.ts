import pg from "pg";
import { bootstrapRls, pool } from "./index";

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_MIGRATION_URL && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set");
  }

  const useDirect =
    !!process.env.DATABASE_MIGRATION_URL &&
    process.env.DATABASE_MIGRATION_URL !== process.env.DATABASE_URL;

  const directPool = useDirect
    ? new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL })
    : null;

  let directEnded = false;
  let ok = false;

  try {
    try {
      ok = await bootstrapRls(directPool ?? undefined);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (directPool && nodeErr.code === "ENOTFOUND") {
        // Direct host not reachable from this network (e.g. Supabase direct
        // connection from Replit dev environment). Fall back to default pool.
        // eslint-disable-next-line no-console
        console.warn(
          "[migrate-rls] Direct connection unreachable — falling back to DATABASE_URL pool.",
        );
        await directPool.end();
        directEnded = true;
        ok = await bootstrapRls();
      } else {
        throw err;
      }
    }
  } finally {
    if (directPool && !directEnded) {
      try {
        await directPool.end();
      } catch {
        /* ignore double-end */
      }
    }
    // Always close the shared pool — this process exits after main() resolves.
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  }

  if (!ok) {
    // eslint-disable-next-line no-console
    console.error("RLS bootstrap failed — see [bootstrapRls] warning above.");
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log("RLS policies applied.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
