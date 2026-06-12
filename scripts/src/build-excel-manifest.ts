/**
 * build-excel-manifest — generates a `dev-manifest.xml` next to the canonical
 * Excel add-in `manifest.xml` so developers can sideload the add-in pointing
 * at their Replit dev URL ($REPLIT_DEV_DOMAIN) instead of finsyt.com.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run build:excel-manifest
 *     [--host https://my-dev.replit.dev]
 *     [--out  artifacts/platform/public/excel-addin/dev-manifest.xml]
 *
 * If --host is omitted we honour the REPLIT_DEV_DOMAIN env var, falling back
 * to https://localhost:8443 (the typical Office.js sideload URL for purely
 * local testing).
 *
 * The script does NOT modify the canonical `manifest.xml` — that one stays
 * pinned to https://finsyt.com so production sideloads are deterministic.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "../..");
const ADDIN_DIR = path.join(ROOT, "artifacts/platform/public/excel-addin");
const SRC = path.join(ADDIN_DIR, "manifest.xml");
const DEFAULT_OUT = path.join(ADDIN_DIR, "dev-manifest.xml");

const PROD_HOST = "https://finsyt.com";

// Add-in IDs MUST be stable per host. Two manifests installed side-by-side
// (prod + dev) would collide on the same GUID, so the dev manifest gets a
// distinct one. This GUID is fixed, not random — so re-running the script
// idempotently produces the same dev id and Excel only registers one copy.
const DEV_ID = "e8d2f5c0-9a63-4d2e-bd8d-1f2a3b4c5dde";

function parseArgs(argv: string[]): { host?: string; out?: string } {
  const out: { host?: string; out?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host" && argv[i + 1]) { out.host = argv[++i]; continue; }
    if (a === "--out" && argv[i + 1]) { out.out = argv[++i]; continue; }
  }
  return out;
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let host = args.host || process.env.REPLIT_DEV_DOMAIN || "";
  if (host && !/^https?:\/\//i.test(host)) host = "https://" + host;
  if (!host) host = "https://localhost:8443";
  host = trimSlash(host);

  const outPath = args.out ? path.resolve(args.out) : DEFAULT_OUT;

  const xml = await fs.readFile(SRC, "utf8");

  // Replace every occurrence of the prod host with the dev host. The XML
  // never references finsyt.com for any external resource, only for our own
  // routes — so a global swap is safe and intentional. Doing it as a literal
  // string replace keeps the diff trivial and means new resources added to
  // `manifest.xml` are picked up automatically.
  let dev = xml.split(PROD_HOST).join(host);

  // Distinct add-in id so prod + dev can coexist in the same Excel install.
  dev = dev.replace(
    /<Id>[0-9a-fA-F-]{36}<\/Id>/,
    `<Id>${DEV_ID}</Id>`,
  );

  // Tag the display name so the user can tell which manifest they sideloaded.
  dev = dev.replace(
    /<DisplayName DefaultValue="([^"]+)" \/>/,
    `<DisplayName DefaultValue="$1 (Dev)" />`,
  );

  await fs.writeFile(outPath, dev, "utf8");
  console.log(`✓ Wrote ${path.relative(ROOT, outPath)}`);
  console.log(`  host = ${host}`);
}

main().catch((err) => {
  console.error("✗ build-excel-manifest failed:", err);
  process.exit(1);
});
