/**
 * validate-excel-manifest — light-weight static validation of the Excel
 * task-pane manifest before publishing.
 *
 * Replaces the official `office-addin-manifest validate` (which only runs
 * online and requires fetching a remote XSD) with a deterministic offline
 * check that catches the failure modes that have actually bitten us:
 *
 *   1. A bt:Url is referenced as a SourceLocation `resid` but is not
 *      defined under <bt:Urls>.
 *   2. A bt:String / bt:Image resid is referenced but never defined.
 *   3. A bt:Url is defined but uses a non-https scheme in production
 *      (`manifest.xml`). The dev manifest is allowed `http(s)://localhost`.
 *   4. The required top-level <Id>, <Version>, <DisplayName>, <Hosts>,
 *      and <DefaultSettings>/<SourceLocation> are missing.
 *   5. Two ribbon Controls share the same `TaskpaneId` (regression
 *      guard for the Builder button accidentally re-using the Copilot
 *      Url, which we hit during the rebuild).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run validate:excel-manifest
 *     [--file artifacts/platform/public/excel-addin/manifest.xml]
 *     [--allow-http]   (used by the dev manifest, which targets localhost)
 *
 * Exit code is 0 on success, 1 on any validation failure. Wired into the
 * root `build` workflow so a malformed manifest fails CI.
 */

import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OFFICE_CLI = path.join(__dirname, "..", "node_modules", ".bin", "office-addin-manifest");

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_TOP_LEVEL = [
  "<Id>",
  "<Version>",
  "<ProviderName",
  "<DisplayName ",
  "<Description ",
  "<DefaultLocale>",
  "<Hosts>",
  "<DefaultSettings>",
  "<SourceLocation ",
];

function findAll(re: RegExp, src: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

export function validateManifestXml(
  xml: string,
  opts: { allowHttp?: boolean } = {},
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const tok of REQUIRED_TOP_LEVEL) {
    if (!xml.includes(tok)) errors.push(`missing required element: ${tok}`);
  }

  // Collect defined resids.
  const definedUrls = new Set(findAll(/<bt:Url\s+id="([^"]+)"/g, xml));
  const definedShorts = new Set(findAll(/<bt:String\s+id="([^"]+)"\s+DefaultValue/g, xml).filter(Boolean));
  // Both ShortStrings and LongStrings live under bt:String — collect from both.
  const definedStrings = new Set(findAll(/<bt:String\s+id="([^"]+)"/g, xml));
  // Merge (definedShorts is informational; definedStrings is authoritative).
  for (const s of definedShorts) definedStrings.add(s);
  const definedImages = new Set(findAll(/<bt:Image\s+id="([^"]+)"/g, xml));

  // Collect referenced resids.
  const refUrls = findAll(/SourceLocation\s+resid="([^"]+)"/g, xml);
  const refLabels = findAll(/<Label\s+resid="([^"]+)"/g, xml);
  const refTitles = findAll(/<Title\s+resid="([^"]+)"/g, xml);
  const refDescs = findAll(/<Description\s+resid="([^"]+)"/g, xml);
  const refImages = findAll(/<bt:Image\s+size="\d+"\s+resid="([^"]+)"/g, xml);

  for (const r of refUrls) {
    if (!definedUrls.has(r)) errors.push(`SourceLocation references undefined Url resid: ${r}`);
  }
  for (const r of [...refLabels, ...refTitles, ...refDescs]) {
    if (!definedStrings.has(r)) errors.push(`Label/Title/Description references undefined String resid: ${r}`);
  }
  for (const r of refImages) {
    if (!definedImages.has(r)) errors.push(`Icon references undefined Image resid: ${r}`);
  }

  // URL scheme check.
  const urlValues = findAll(/<bt:Url\s+id="[^"]+"\s+DefaultValue="([^"]+)"/g, xml);
  for (const u of urlValues) {
    if (u.startsWith("https://")) continue;
    if (opts.allowHttp && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(u)) continue;
    errors.push(`Url DefaultValue must be https:// (got: ${u})`);
  }

  // TaskpaneId uniqueness across ribbon Controls.
  const taskpaneIds = findAll(/<TaskpaneId>([^<]+)<\/TaskpaneId>/g, xml);
  const seen = new Set<string>();
  for (const id of taskpaneIds) {
    if (seen.has(id)) errors.push(`duplicate TaskpaneId across ribbon Controls: ${id}`);
    seen.add(id);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function parseArgs(argv: string[]): { file?: string; allowHttp: boolean } {
  let file: string | undefined;
  let allowHttp = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" && argv[i + 1]) { file = argv[++i]; continue; }
    if (a === "--allow-http") { allowHttp = true; continue; }
  }
  return { file, allowHttp };
}

function runOfficialValidator(file: string): Promise<{ ok: boolean; tail: string }> {
  return new Promise((resolve) => {
    const child = spawn(OFFICE_CLI, ["validate", file], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.stderr.on("data", (b) => { out += b.toString(); });
    child.on("error", (err) => {
      resolve({ ok: false, tail: `office-addin-manifest spawn error: ${err.message}` });
    });
    child.on("close", (code) => {
      // The CLI prints "The manifest is valid." on success. Exit code is
      // 0 on success and non-zero on failure.
      const tail = out.trim().split("\n").slice(-12).join("\n");
      resolve({ ok: code === 0 && /The manifest is valid\./.test(out), tail });
    });
  });
}

async function runFile(file: string, allowHttp: boolean): Promise<boolean> {
  const xml = await fs.readFile(file, "utf8");
  const rel = path.relative(ROOT, file);

  // Static (offline, deterministic) checks.
  const result = validateManifestXml(xml, { allowHttp });
  if (!result.ok) {
    console.error(`✗ ${rel} — static validation failed:`);
    for (const e of result.errors) console.error(`  - ${e}`);
    return false;
  }
  console.log(`✓ ${rel} — static validation`);

  // Official Microsoft validator. Talks to the Office Add-ins acceptance
  // service and validates against the live XSD, so it requires network.
  // We treat a network failure as a soft warning rather than failing CI:
  // the static validator above already covered the deterministic checks
  // and we don't want a flaky external service to block builds.
  const off = await runOfficialValidator(file);
  if (off.ok) {
    console.log(`✓ ${rel} — office-addin-manifest validate`);
    return true;
  }
  // If the failure looks network-related or is a transient upstream HTTP error
  // (5xx from Microsoft's validation service), warn instead of failing CI.
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|getaddrinfo|fetch failed|5\d\d|Bad Gateway|Service Unavailable|Gateway Timeout|Internal Server Error/i.test(off.tail)) {
    console.warn(`! ${rel} — office-addin-manifest validate skipped (network unavailable)`);
    console.warn(off.tail.split("\n").map((l) => `    ${l}`).join("\n"));
    return true;
  }
  console.error(`✗ ${rel} — office-addin-manifest validate failed:`);
  console.error(off.tail.split("\n").map((l) => `  ${l}`).join("\n"));
  return false;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targets = args.file
    ? [{ file: path.resolve(args.file), allowHttp: args.allowHttp }]
    : [
        {
          file: path.join(ROOT, "artifacts/platform/public/excel-addin/manifest.xml"),
          allowHttp: false,
        },
        {
          file: path.join(ROOT, "artifacts/platform/public/excel-addin/dev-manifest.xml"),
          allowHttp: true,
        },
      ];

  let ok = true;
  for (const t of targets) {
    try {
      const passed = await runFile(t.file, t.allowHttp);
      if (!passed) ok = false;
    } catch (err) {
      const rel = path.relative(ROOT, t.file);
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        console.warn(`! ${rel} — not found, skipping`);
      } else {
        console.error(`✗ ${rel} — ${(err as Error).message}`);
        ok = false;
      }
    }
  }

  if (!ok) process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("✗ validate-excel-manifest failed:", err);
    process.exit(1);
  });
}
