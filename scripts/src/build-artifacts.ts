import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
// scripts/src/build-artifacts.ts → repo root is two levels up.
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const ARTIFACTS_DIR = path.join(REPO_ROOT, "artifacts");
// Keep the cache outside `node_modules` so it survives fresh dependency
// installs and CI checkouts. `.cache/` at the repo root is already gitignored
// (see .gitignore) and is the conventional "stable, untracked" location for
// build/test artifacts in this workspace. CI providers can persist this dir
// directly (keyed on pnpm-lock.yaml + a content hash of artifacts/** + lib/**)
// to make typical PR validation finish in seconds instead of minutes.
export const CACHE_DIR = path.join(REPO_ROOT, ".cache", "build-artifacts");
const CACHE_VERSION = "v1";

// Directories inside any package that are considered build/cache output and
// should NOT contribute to the input hash. Keep this list conservative — when
// in doubt, include the file in the hash so we err on the side of rebuilding.
const HASH_EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".vite",
  ".turbo",
  ".cache",
  ".swc",
  ".output",
  "out",
  "coverage",
  "test-results",
  "playwright-report",
]);

// File suffixes that are noisy build artifacts and should be excluded from the
// input hash even when they sit alongside source files.
const HASH_EXCLUDE_FILE_SUFFIXES = [".tsbuildinfo"];

// Output directory names (relative to the artifact dir) that we look for after
// a successful build to detect what to verify on cache hit.
const OUTPUT_DIR_CANDIDATES = ["dist", "build", ".next", ".output", "out"];

type Artifact = {
  name: string;
  dir: string;
  tomlPath: string;
  raw: string;
};

function readArtifacts(): Artifact[] {
  if (!fs.existsSync(ARTIFACTS_DIR)) return [];
  const out: Artifact[] = [];
  for (const name of fs.readdirSync(ARTIFACTS_DIR).sort()) {
    const dir = path.join(ARTIFACTS_DIR, name);
    const tomlPath = path.join(dir, ".replit-artifact", "artifact.toml");
    if (fs.existsSync(tomlPath)) {
      out.push({ name, dir, tomlPath, raw: fs.readFileSync(tomlPath, "utf8") });
    }
  }
  return out;
}

function stripComment(line: string): string {
  let inStr = false;
  let escape = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inStr = false;
      }
    } else {
      if (c === '"') inStr = true;
      else if (c === "#") return line.slice(0, i);
    }
  }
  return line;
}

function getSectionBody(raw: string, sectionName: string): string | null {
  const header = `[${sectionName}]`;
  const lines = raw.split(/\r?\n/);
  let inSection = false;
  let found = false;
  const collected: string[] = [];
  for (const line of lines) {
    const trimmed = stripComment(line).trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]") && !trimmed.startsWith("[[")) {
      if (trimmed === header) {
        inSection = true;
        found = true;
        continue;
      } else if (inSection) {
        break;
      }
      continue;
    }
    if (trimmed.startsWith("[[")) {
      if (inSection) break;
      continue;
    }
    if (inSection) collected.push(line);
  }
  return found ? collected.join("\n") : null;
}

function parseStringKeys(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of body.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return out;
}

function parseStringArray(body: string, key: string): string[] | null {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*\\[(.*)\\]\\s*$`, "m");
  const m = stripComment(body).match(re);
  if (!m) return null;
  const inner = m[1];
  const items: string[] = [];
  let cur = "";
  let inStr = false;
  let escape = false;
  for (const c of inner) {
    if (inStr) {
      if (escape) {
        cur += c;
        escape = false;
      } else if (c === "\\") {
        cur += c;
        escape = true;
      } else if (c === '"') {
        cur += c;
        inStr = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        cur += c;
        inStr = true;
      } else if (c === ",") {
        if (cur.trim()) items.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  if (cur.trim()) items.push(cur);
  return items.map((s) => {
    const t = s.trim();
    const sm = t.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (!sm) {
      throw new Error(`Could not parse TOML array item as string: ${t}`);
    }
    return sm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  });
}

type BuildPlan = {
  args: string[] | null;
  env: Record<string, string>;
  envSources: string[];
  argsSource: string;
};

function readPackageName(dir: string): string | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string };
    return typeof pkg.name === "string" ? pkg.name : null;
  } catch {
    return null;
  }
}

function deriveBuildPlan(art: Artifact): BuildPlan {
  const env: Record<string, string> = {};
  const envSources: string[] = [];

  const baseEnv = getSectionBody(art.raw, "services.env");
  if (baseEnv !== null) {
    Object.assign(env, parseStringKeys(baseEnv));
    envSources.push("[services.env]");
  }

  const prodBuildEnv = getSectionBody(art.raw, "services.production.build.env");
  if (prodBuildEnv !== null) {
    Object.assign(env, parseStringKeys(prodBuildEnv));
    envSources.push("[services.production.build.env]");
  }

  let args: string[] | null = null;
  let argsSource = "";

  const prodBuildSection = getSectionBody(art.raw, "services.production.build");
  if (prodBuildSection !== null) {
    const parsed = parseStringArray(prodBuildSection, "args");
    if (parsed) {
      args = parsed;
      argsSource = "[services.production.build].args";
    }
  }

  if (!args) {
    const prodSection = getSectionBody(art.raw, "services.production");
    if (prodSection !== null) {
      const parsed = parseStringArray(prodSection, "build");
      if (parsed) {
        args = parsed;
        argsSource = "[services.production].build";
      }
    }
  }

  if (!args) {
    const pkgName = readPackageName(art.dir);
    if (pkgName) {
      const pkgPath = path.join(art.dir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      if (pkg.scripts?.build) {
        args = ["pnpm", "--filter", pkgName, "run", "build"];
        argsSource = `fallback (pnpm --filter ${pkgName} run build)`;
      }
    }
  }

  return { args, env, envSources, argsSource };
}

function formatEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Base-path assertions: after a build succeeds, verify the built output
// references its assets under the artifact's expected BASE_PATH. Catches
// silent regressions (e.g. vite.config no longer reads BASE_PATH, or a
// hardcoded asset link) that would otherwise only surface at Republish time.
// ---------------------------------------------------------------------------

export type AssertionResult =
  | { ok: true; skipped: false; checked: string; details: string }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; skipped: false; checked: string; message: string };

export function expectedAssetPrefix(basePath: string): string {
  const normalized = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalized}assets/`;
}

export function extractRootRelativeUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /\b(?:src|href)\s*=\s*"(\/[^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

export function checkViteIndexHtml(
  indexHtmlPath: string,
  basePath: string,
): AssertionResult {
  const html = fs.readFileSync(indexHtmlPath, "utf8");
  const expectedPrefix = expectedAssetPrefix(basePath);
  const urls = extractRootRelativeUrls(html);

  // Vite emits asset URLs at `${base}assets/...`. Filter to only the URLs that
  // look like Vite-built assets so we don't false-positive on user-authored
  // root-relative links (favicons, public/ files referenced by absolute path,
  // etc.).
  const assetReferences = urls.filter((u) => /\/assets\//.test(u));
  if (assetReferences.length === 0) {
    return {
      ok: false,
      skipped: false,
      checked: indexHtmlPath,
      message: `Built entry HTML contains no \`/assets/...\` references — cannot verify base path. Did the bundler emit an empty page?`,
    };
  }

  const wrong = assetReferences.filter((u) => !u.startsWith(expectedPrefix));
  if (wrong.length > 0) {
    const sample = wrong.slice(0, 3).join(", ");
    return {
      ok: false,
      skipped: false,
      checked: indexHtmlPath,
      message: `Built entry HTML references assets outside the expected base path. Expected prefix \`${expectedPrefix}\` (from BASE_PATH=\`${basePath}\`), but found ${wrong.length} reference(s) like: ${sample}. A vite.config or HTML template may have stopped honoring BASE_PATH.`,
    };
  }

  return {
    ok: true,
    skipped: false,
    checked: indexHtmlPath,
    details: `${assetReferences.length} asset reference(s) all under \`${expectedPrefix}\``,
  };
}

export function checkNextRoutesManifest(
  manifestPath: string,
  basePath: string,
): AssertionResult {
  // Next.js basePath has no trailing slash, and root is the empty string.
  const expected = basePath === "/" ? "" : basePath.replace(/\/+$/, "");

  let parsed: { basePath?: unknown };
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      basePath?: unknown;
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      checked: manifestPath,
      message: `Could not parse Next.js routes-manifest.json: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const actual = typeof parsed.basePath === "string" ? parsed.basePath : "";
  if (actual !== expected) {
    return {
      ok: false,
      skipped: false,
      checked: manifestPath,
      message: `Next.js production build emitted basePath \`${actual}\`, but the artifact's BASE_PATH is \`${basePath}\` (expected manifest basePath \`${expected}\`). next.config.ts may have stopped honoring the artifact's base path.`,
    };
  }

  return {
    ok: true,
    skipped: false,
    checked: manifestPath,
    details: `routes-manifest.json basePath=\`${actual}\` matches BASE_PATH=\`${basePath}\``,
  };
}

export function assertBuiltBasePath(
  art: Artifact,
  env: Record<string, string>,
): AssertionResult {
  const basePath = env.BASE_PATH;
  if (!basePath) {
    return {
      ok: true,
      skipped: true,
      reason: "no BASE_PATH in build env",
    };
  }

  // Detect Next.js by its production routes manifest.
  const nextRoutesManifest = path.join(art.dir, ".next", "routes-manifest.json");
  if (fs.existsSync(nextRoutesManifest)) {
    return checkNextRoutesManifest(nextRoutesManifest, basePath);
  }

  // Detect Vite/static builds by looking for an index.html in the conventional
  // output locations.
  const candidates = [
    path.join(art.dir, "dist", "public", "index.html"),
    path.join(art.dir, "dist", "index.html"),
  ];
  const indexHtml = candidates.find((p) => fs.existsSync(p));
  if (indexHtml) {
    return checkViteIndexHtml(indexHtml, basePath);
  }

  return {
    ok: true,
    skipped: true,
    reason:
      "no recognized build output (looked for .next/routes-manifest.json, dist/public/index.html, dist/index.html)",
  };
}

// ---------------------------------------------------------------------------
// Workspace package discovery + content hashing for the build cache.
// ---------------------------------------------------------------------------

type WsPackage = {
  name: string;
  dir: string;
  wsDeps: string[];
};

function loadWorkspacePackages(): Map<string, WsPackage> {
  const packageDirs: string[] = [];

  const tryAdd = (dir: string): void => {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      packageDirs.push(dir);
    }
  };

  // Mirror the patterns in pnpm-workspace.yaml. We hard-code these so we don't
  // need a YAML parser as a dependency.
  const artifactsRoot = path.join(REPO_ROOT, "artifacts");
  if (fs.existsSync(artifactsRoot)) {
    for (const n of fs.readdirSync(artifactsRoot)) tryAdd(path.join(artifactsRoot, n));
  }
  const libRoot = path.join(REPO_ROOT, "lib");
  if (fs.existsSync(libRoot)) {
    for (const n of fs.readdirSync(libRoot)) tryAdd(path.join(libRoot, n));
  }
  const integrationsRoot = path.join(REPO_ROOT, "lib", "integrations");
  if (fs.existsSync(integrationsRoot)) {
    for (const n of fs.readdirSync(integrationsRoot)) {
      tryAdd(path.join(integrationsRoot, n));
    }
  }
  for (const n of ["scripts", "tests"]) tryAdd(path.join(REPO_ROOT, n));

  const map = new Map<string, WsPackage>();
  for (const dir of packageDirs) {
    let pkg: {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (!pkg.name) continue;
    const allDeps: Record<string, string> = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {}),
      ...(pkg.optionalDependencies || {}),
    };
    const wsDeps: string[] = [];
    for (const [name, version] of Object.entries(allDeps)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        wsDeps.push(name);
      }
    }
    map.set(pkg.name, { name: pkg.name, dir, wsDeps });
  }
  return map;
}

function transitiveWsDeps(rootName: string, packages: Map<string, WsPackage>): string[] {
  const visited = new Set<string>();
  const stack: string[] = [rootName];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const p = packages.get(cur);
    if (!p) continue;
    for (const d of p.wsDeps) {
      if (!visited.has(d)) stack.push(d);
    }
  }
  visited.delete(rootName);
  return [...visited].sort();
}

function shouldExcludeFile(name: string): boolean {
  for (const suffix of HASH_EXCLUDE_FILE_SUFFIXES) {
    if (name.endsWith(suffix)) return true;
  }
  return false;
}

function hashDir(rootDir: string, hash: crypto.Hash): void {
  if (!fs.existsSync(rootDir)) return;
  const collected: { rel: string; abs: string }[] = [];
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (HASH_EXCLUDE_DIRS.has(entry.name)) continue;
        stack.push(abs);
      } else if (entry.isFile()) {
        if (shouldExcludeFile(entry.name)) continue;
        const rel = path.relative(rootDir, abs);
        collected.push({ rel, abs });
      } else if (entry.isSymbolicLink()) {
        // Hash the link target text only; do not follow.
        const rel = path.relative(rootDir, abs);
        try {
          const target = fs.readlinkSync(abs);
          hash.update("L:");
          hash.update(rel);
          hash.update("\0");
          hash.update(target);
          hash.update("\0");
        } catch {
          // ignore broken symlinks
        }
      }
    }
  }
  collected.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const { rel, abs } of collected) {
    hash.update("F:");
    hash.update(rel);
    hash.update("\0");
    try {
      hash.update(fs.readFileSync(abs));
    } catch {
      hash.update("<unreadable>");
    }
    hash.update("\0");
  }
}

function hashFileIfExists(absPath: string, hash: crypto.Hash, label: string): void {
  hash.update(`${label}:`);
  if (fs.existsSync(absPath)) {
    try {
      hash.update(fs.readFileSync(absPath));
    } catch {
      hash.update("<unreadable>");
    }
  } else {
    hash.update("<missing>");
  }
  hash.update("\0");
}

function computeInputHash(
  art: Artifact,
  plan: BuildPlan & { args: string[] },
  packages: Map<string, WsPackage>,
): string {
  const hash = crypto.createHash("sha256");
  hash.update(`${CACHE_VERSION}\0`);

  hash.update("args:");
  hash.update(JSON.stringify(plan.args));
  hash.update("\0");

  const envEntries = Object.entries(plan.env).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  hash.update("env:");
  hash.update(JSON.stringify(envEntries));
  hash.update("\0");

  hash.update(`artifact:${art.name}\0`);
  hashDir(art.dir, hash);

  const pkgName = readPackageName(art.dir);
  if (pkgName) {
    const deps = transitiveWsDeps(pkgName, packages);
    for (const dep of deps) {
      const p = packages.get(dep);
      if (!p) continue;
      hash.update(`dep:${dep}\0`);
      hashDir(p.dir, hash);
    }
  }

  hashFileIfExists(path.join(REPO_ROOT, "pnpm-lock.yaml"), hash, "pnpm-lock");
  hashFileIfExists(path.join(REPO_ROOT, "pnpm-workspace.yaml"), hash, "pnpm-workspace");
  hashFileIfExists(path.join(REPO_ROOT, "package.json"), hash, "root-pkg");

  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// Concurrent build runner.
// ---------------------------------------------------------------------------

type BuildOutcome = {
  name: string;
  status: "ok" | "failed" | "skipped" | "cached";
  exitStatus: number | null;
  durationMs: number;
  error?: string;
  // When a build's process exits 0 but a post-build assertion fails, mark the
  // outcome failed and tag the reason so the summary can surface it clearly.
  failureReason?: "spawn" | "build" | "base-path";
  // Why a cache hit was reported (e.g. which output dirs were verified). Set
  // only for outcomes with status === "cached".
  cacheReason?: string;
  // Estimated wall-clock time saved by serving this artifact from cache,
  // computed as (prior build duration) - (cache check duration). Set only for
  // outcomes with status === "cached" and only when the prior build duration
  // was recorded in the cache entry.
  savedMs?: number;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function makeLineStreamer(prefix: string, sink: NodeJS.WriteStream) {
  let buf = "";
  return {
    write(chunk: Buffer): void {
      buf += chunk.toString("utf8");
      let nl = buf.indexOf("\n");
      while (nl !== -1) {
        const line = buf.slice(0, nl);
        sink.write(`${prefix}${line}\n`);
        buf = buf.slice(nl + 1);
        nl = buf.indexOf("\n");
      }
    },
    flush(): void {
      if (buf.length > 0) {
        sink.write(`${prefix}${buf}\n`);
        buf = "";
      }
    },
  };
}

type CacheEntry = {
  version: string;
  inputHash: string;
  outputs: string[];
  builtAt: string;
  // Wall-clock duration (ms) of the last successful build that produced this
  // cache entry. Used to estimate how much time a future cache hit saves.
  // Optional for backward compatibility with cache entries written before
  // this field existed.
  lastBuildDurationMs?: number;
};

function cachePathFor(name: string): string {
  return path.join(CACHE_DIR, `${name}.json`);
}

function readCacheEntry(name: string): CacheEntry | null {
  const p = cachePathFor(name);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<CacheEntry>;
    if (
      typeof data.version !== "string" ||
      typeof data.inputHash !== "string" ||
      !Array.isArray(data.outputs) ||
      typeof data.builtAt !== "string"
    ) {
      return null;
    }
    if (data.version !== CACHE_VERSION) return null;
    const lastBuildDurationMs =
      typeof data.lastBuildDurationMs === "number" &&
      Number.isFinite(data.lastBuildDurationMs) &&
      data.lastBuildDurationMs >= 0
        ? data.lastBuildDurationMs
        : undefined;
    return {
      version: data.version,
      inputHash: data.inputHash,
      outputs: data.outputs.filter((o): o is string => typeof o === "string"),
      builtAt: data.builtAt,
      ...(lastBuildDurationMs !== undefined ? { lastBuildDurationMs } : {}),
    };
  } catch {
    return null;
  }
}

function writeCacheEntry(name: string, entry: CacheEntry): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePathFor(name), JSON.stringify(entry, null, 2));
}

function deleteCacheEntry(name: string): void {
  const p = cachePathFor(name);
  try {
    fs.unlinkSync(p);
  } catch {
    // already gone
  }
}

// Garbage-collect cache entries whose corresponding artifact no longer exists
// (renamed, removed, etc.). The cache directory persists across runs, so
// without this pass orphaned `<name>.json` files would accumulate forever.
// Returns the sorted list of pruned artifact names.
export function pruneStaleCacheEntries(
  existingNames: Iterable<string>,
  cacheDir: string = CACHE_DIR,
): string[] {
  if (!fs.existsSync(cacheDir)) return [];
  const keep = new Set(existingNames);
  const pruned: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheDir);
  } catch {
    return [];
  }
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const name = file.slice(0, -".json".length);
    if (keep.has(name)) continue;
    const abs = path.join(cacheDir, file);
    try {
      fs.unlinkSync(abs);
      pruned.push(name);
    } catch {
      // best-effort; if we can't unlink we'll just try again next run
    }
  }
  pruned.sort();
  return pruned;
}

function detectOutputDirs(artDir: string): string[] {
  const found: string[] = [];
  for (const candidate of OUTPUT_DIR_CANDIDATES) {
    const abs = path.join(artDir, candidate);
    if (!fs.existsSync(abs)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(abs);
    } catch {
      continue;
    }
    if (entries.length === 0) continue;
    found.push(candidate);
  }
  return found;
}

function outputsStillValid(artDir: string, outputs: string[]): boolean {
  if (outputs.length === 0) return false;
  for (const rel of outputs) {
    const abs = path.join(artDir, rel);
    if (!fs.existsSync(abs)) return false;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      return false;
    }
    if (!stat.isDirectory()) return false;
    let entries: string[];
    try {
      entries = fs.readdirSync(abs);
    } catch {
      return false;
    }
    if (entries.length === 0) return false;
  }
  return true;
}

function runBuild(
  art: Artifact,
  plan: BuildPlan & { args: string[] },
): Promise<BuildOutcome> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = plan.args;
    const start = Date.now();
    const prefix = `[${art.name}] `;
    const out = makeLineStreamer(prefix, process.stdout);
    const err = makeLineStreamer(prefix, process.stderr);

    process.stdout.write(`${prefix}=== started ===\n`);

    const child = spawn(cmd, rest, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...plan.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (d: Buffer) => out.write(d));
    child.stderr?.on("data", (d: Buffer) => err.write(d));

    child.on("error", (e) => {
      out.flush();
      err.flush();
      const durationMs = Date.now() - start;
      process.stderr.write(`${prefix}spawn error: ${e.message}\n`);
      process.stderr.write(
        `${prefix}=== FAILED (spawn error) in ${formatDuration(durationMs)} ===\n`,
      );
      resolve({
        name: art.name,
        status: "failed",
        exitStatus: null,
        durationMs,
        error: e.message,
        failureReason: "spawn",
      });
    });

    child.on("close", (code) => {
      out.flush();
      err.flush();
      const durationMs = Date.now() - start;
      const buildOk = code === 0;

      if (!buildOk) {
        process.stderr.write(
          `${prefix}=== FAILED (exit ${code}) in ${formatDuration(durationMs)} ===\n`,
        );
        resolve({
          name: art.name,
          status: "failed",
          exitStatus: code,
          durationMs,
          failureReason: "build",
        });
        return;
      }

      // Build succeeded — assert the built output references the artifact's
      // expected BASE_PATH. Catches regressions where vite.config silently
      // stops reading BASE_PATH, or where assets get hardcoded under the
      // wrong prefix, before they slip through to Republish.
      const assertion = assertBuiltBasePath(art, plan.env);
      if (assertion.skipped) {
        process.stdout.write(
          `${prefix}base-path check skipped: ${assertion.reason}\n`,
        );
      } else if (assertion.ok) {
        process.stdout.write(
          `${prefix}base-path check ok: ${assertion.details} (${path.relative(
            REPO_ROOT,
            assertion.checked,
          )})\n`,
        );
      } else {
        process.stderr.write(
          `${prefix}base-path check FAILED (${path.relative(
            REPO_ROOT,
            assertion.checked,
          )}): ${assertion.message}\n`,
        );
        process.stderr.write(
          `${prefix}=== FAILED (base-path assertion) in ${formatDuration(
            durationMs,
          )} ===\n`,
        );
        resolve({
          name: art.name,
          status: "failed",
          exitStatus: code,
          durationMs,
          error: assertion.message,
          failureReason: "base-path",
        });
        return;
      }

      process.stdout.write(`${prefix}=== ok in ${formatDuration(durationMs)} ===\n`);
      resolve({
        name: art.name,
        status: "ok",
        exitStatus: code,
        durationMs,
      });
    });
  });
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  onComplete?: (item: T, result: R) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  for (let w = 0; w < effectiveLimit; w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = next++;
          if (idx >= items.length) return;
          const item = items[idx];
          const result = await worker(item);
          results[idx] = result;
          if (onComplete) onComplete(item, result);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

async function main() {
  const artifacts = readArtifacts();
  if (artifacts.length === 0) {
    console.log("[build-artifacts] No artifacts found.");
    return;
  }

  const dryRun = process.argv.includes("--dry-run");
  const noCache =
    process.argv.includes("--no-cache") ||
    process.env.BUILD_ARTIFACTS_NO_CACHE === "1" ||
    process.env.BUILD_ARTIFACTS_NO_CACHE === "true";

  type Prepared = {
    art: Artifact;
    plan: BuildPlan;
  };

  const prepared: Prepared[] = artifacts.map((art) => ({
    art,
    plan: deriveBuildPlan(art),
  }));

  const skipped: string[] = [];
  const buildable: { art: Artifact; plan: BuildPlan & { args: string[] } }[] = [];

  for (const { art, plan } of prepared) {
    if (!plan.args) {
      skipped.push(art.name);
      console.log(
        `[build-artifacts] Skipping ${art.name}: no production build defined and no fallback build script.`,
      );
      continue;
    }
    buildable.push({ art, plan: plan as BuildPlan & { args: string[] } });
  }

  for (const { art, plan } of buildable) {
    console.log(`[build-artifacts] Plan ${art.name}:`);
    console.log(`  build cmd : ${plan.args.join(" ")} (from ${plan.argsSource})`);
    console.log(
      `  build env : ${formatEnv(plan.env) || "(none)"}` +
        (plan.envSources.length ? `  [from ${plan.envSources.join(" + ")}]` : ""),
    );
  }

  if (dryRun) {
    return;
  }

  // Garbage-collect cache entries for artifacts that no longer exist (renamed
  // or removed). Cheap to run on every build; keeps the persistent cache dir
  // from accumulating orphans over time.
  const prunedStale = pruneStaleCacheEntries(artifacts.map((a) => a.name));
  if (prunedStale.length > 0) {
    console.log(
      `[build-artifacts] Pruned ${prunedStale.length} stale cache entr${
        prunedStale.length === 1 ? "y" : "ies"
      } for removed artifact(s): ${prunedStale.join(", ")}`,
    );
  }

  // Compute input hashes and decide which artifacts can be served from cache.
  const packages = loadWorkspacePackages();
  type Job = {
    art: Artifact;
    plan: BuildPlan & { args: string[] };
    inputHash: string;
  };
  const jobs: Job[] = [];
  const cachedOutcomes: BuildOutcome[] = [];

  if (noCache) {
    console.log("[build-artifacts] Cache disabled (--no-cache); rebuilding all artifacts.");
  }

  for (const { art, plan } of buildable) {
    const start = Date.now();
    const inputHash = computeInputHash(art, plan, packages);
    const cache = noCache ? null : readCacheEntry(art.name);
    if (
      cache &&
      cache.inputHash === inputHash &&
      outputsStillValid(art.dir, cache.outputs)
    ) {
      const durationMs = Date.now() - start;
      const savedMs =
        typeof cache.lastBuildDurationMs === "number"
          ? Math.max(0, cache.lastBuildDurationMs - durationMs)
          : undefined;
      const savedSuffix =
        savedMs !== undefined
          ? `, saved ~${formatDuration(savedMs)} vs last build of ${formatDuration(
              cache.lastBuildDurationMs!,
            )}`
          : ", prior build duration unknown";
      console.log(
        `[${art.name}] === cached (inputs unchanged since ${cache.builtAt}) in ${formatDuration(
          durationMs,
        )}${savedSuffix} ===`,
      );
      cachedOutcomes.push({
        name: art.name,
        status: "cached",
        exitStatus: 0,
        durationMs,
        cacheReason: `outputs=${cache.outputs.join(",") || "(none)"}`,
        ...(savedMs !== undefined ? { savedMs } : {}),
      });
      continue;
    }
    if (cache && !noCache) {
      if (cache.inputHash !== inputHash) {
        console.log(
          `[${art.name}] cache miss: input hash changed (was ${cache.inputHash.slice(
            0,
            12,
          )}…, now ${inputHash.slice(0, 12)}…)`,
        );
      } else if (!outputsStillValid(art.dir, cache.outputs)) {
        console.log(
          `[${art.name}] cache miss: previous outputs missing or empty (${
            cache.outputs.join(", ") || "<none recorded>"
          })`,
        );
      }
    }
    jobs.push({ art, plan, inputHash });
  }

  const concurrency = Math.max(1, os.cpus().length);
  const wallStart = Date.now();

  if (jobs.length === 0) {
    console.log(
      `\n[build-artifacts] All ${cachedOutcomes.length} artifact(s) served from cache; no builds needed.`,
    );
  } else {
    console.log(
      `\n[build-artifacts] Building ${jobs.length} artifact(s) with concurrency=${Math.min(
        concurrency,
        jobs.length,
      )} (${cachedOutcomes.length} cached)...`,
    );
  }

  const builtOutcomes =
    jobs.length === 0
      ? []
      : await runWithConcurrency(jobs, concurrency, async ({ art, plan, inputHash }) => {
          const outcome = await runBuild(art, plan);
          if (outcome.status === "ok") {
            const outputs = detectOutputDirs(art.dir);
            try {
              writeCacheEntry(art.name, {
                version: CACHE_VERSION,
                inputHash,
                outputs,
                builtAt: new Date().toISOString(),
                lastBuildDurationMs: outcome.durationMs,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.warn(
                `[${art.name}] warning: failed to write build cache entry: ${msg}`,
              );
            }
          } else if (outcome.status === "failed") {
            // A failed build invalidates any prior cache entry — the next run
            // must not see a stale "cached" result.
            deleteCacheEntry(art.name);
          }
          return outcome;
        });

  const outcomes: BuildOutcome[] = [...cachedOutcomes, ...builtOutcomes];
  const totalWall = Date.now() - wallStart;

  console.log("\n[build-artifacts] Summary:");
  let totalSavedMs = 0;
  let savedSampleCount = 0;
  let cachedWithoutPriorDuration = 0;
  for (const art of artifacts) {
    if (skipped.includes(art.name)) {
      console.log(`  - ${art.name}: skipped`);
      continue;
    }
    const outcome = outcomes.find((o) => o.name === art.name);
    if (!outcome) {
      console.log(`  - ${art.name}: (no result)`);
      continue;
    }
    let status: string;
    if (outcome.status === "ok") status = "ok";
    else if (outcome.status === "cached") status = "cached";
    else if (outcome.status === "skipped") status = "skipped";
    else status = "FAILED";
    let detail = "";
    if (outcome.status === "failed") {
      if (outcome.failureReason === "base-path") {
        detail = " (base-path assertion failed)";
      } else if (outcome.failureReason === "spawn") {
        detail = " (spawn error)";
      } else if (outcome.exitStatus !== null) {
        detail = ` (exit ${outcome.exitStatus})`;
      }
    } else if (outcome.status === "cached") {
      if (typeof outcome.savedMs === "number") {
        totalSavedMs += outcome.savedMs;
        savedSampleCount += 1;
        detail = ` (saved ~${formatDuration(outcome.savedMs)} by skipping ${art.name})`;
      } else {
        cachedWithoutPriorDuration += 1;
        detail = " (no prior build duration recorded; savings unknown)";
      }
    }
    console.log(
      `  - ${art.name}: ${status}${detail} in ${formatDuration(outcome.durationMs)}`,
    );
  }
  if (savedSampleCount > 0) {
    const noteParts: string[] = [
      `across ${savedSampleCount} cached artifact(s)`,
    ];
    if (cachedWithoutPriorDuration > 0) {
      noteParts.push(
        `${cachedWithoutPriorDuration} cached artifact(s) had no prior duration recorded and are not counted`,
      );
    }
    console.log(
      `[build-artifacts] Total time saved by build cache: ~${formatDuration(
        totalSavedMs,
      )} (${noteParts.join("; ")})`,
    );
  } else if (cachedWithoutPriorDuration > 0) {
    console.log(
      `[build-artifacts] Total time saved by build cache: unknown (${cachedWithoutPriorDuration} cached artifact(s) had no prior duration recorded; rebuild once to populate)`,
    );
  }
  console.log(`[build-artifacts] Total wall time: ${formatDuration(totalWall)}`);

  // Machine-readable summary line so CI / dashboards can track cache savings
  // over time without parsing the human-friendly output above. Prefixed with a
  // stable tag so it's trivial to grep for.
  const machineSummary = {
    schema: "build-artifacts.summary.v1",
    totalWallMs: totalWall,
    totalSavedMs,
    savedSampleCount,
    cachedWithoutPriorDurationCount: cachedWithoutPriorDuration,
    artifacts: artifacts.map((art) => {
      if (skipped.includes(art.name)) {
        return { name: art.name, status: "skipped" as const };
      }
      const outcome = outcomes.find((o) => o.name === art.name);
      if (!outcome) {
        return { name: art.name, status: "no-result" as const };
      }
      const base: {
        name: string;
        status: BuildOutcome["status"];
        durationMs: number;
        savedMs?: number;
      } = {
        name: art.name,
        status: outcome.status,
        durationMs: outcome.durationMs,
      };
      if (outcome.status === "cached" && typeof outcome.savedMs === "number") {
        base.savedMs = outcome.savedMs;
      }
      return base;
    }),
  };
  console.log(
    `[build-artifacts] machine-summary ${JSON.stringify(machineSummary)}`,
  );

  const failures = outcomes.filter((o) => o.status === "failed");
  if (failures.length > 0) {
    console.error(
      `\n[build-artifacts] ${failures.length} artifact build(s) failed: ${failures
        .map((f) => f.name)
        .join(", ")}`,
    );
    const assertionFails = failures.filter((f) => f.failureReason === "base-path");
    if (assertionFails.length > 0) {
      console.error(
        `[build-artifacts] base-path assertion failed for: ${assertionFails
          .map((f) => f.name)
          .join(", ")}`,
      );
    }
    process.exit(1);
  }

  console.log("\n[build-artifacts] All artifact builds passed.");
}

// Guard direct invocation so the assertion helpers above remain importable
// from unit tests without triggering main().
const invokedDirectly =
  process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename);

if (invokedDirectly) {
  main().catch((err) => {
    console.error("[build-artifacts] Unexpected error:", err);
    process.exit(1);
  });
}
