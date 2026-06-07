import { bootstrapRls, pool } from "./index";

async function main() {
  const ok = await bootstrapRls();
  await pool.end();
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
