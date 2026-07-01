import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CACHE_DIR,
  checkNextRoutesManifest,
  checkViteIndexHtml,
  expectedAssetPrefix,
  extractRootRelativeUrls,
  pruneStaleCacheEntries,
} from "./build-artifacts.js";

let tmpRoot: string;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "build-artifacts-test-"));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeFixture(name: string, contents: string): string {
  const p = path.join(tmpRoot, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents, "utf8");
  return p;
}

const VITE_HTML_ROOT = `<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc123.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

const VITE_HTML_MOCKUP = `<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/__mockup/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/__mockup/assets/index-abc123.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

const VITE_HTML_PLATFORM = `<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/platform/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/platform/assets/index-abc123.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("CACHE_DIR", () => {
  it("lives outside `node_modules` so it survives fresh dependency installs", () => {
    // The build cache must NOT live inside node_modules — every fresh CI
    // checkout reinstalls deps and wipes node_modules, which would force a
    // full rebuild of every artifact on every PR. Keep it under .cache/ at
    // the repo root (gitignored, but a stable location CI can persist).
    const segments = CACHE_DIR.split(path.sep);
    assert.ok(
      !segments.includes("node_modules"),
      `CACHE_DIR (${CACHE_DIR}) must not be inside node_modules`,
    );
    assert.ok(
      segments.includes(".cache"),
      `CACHE_DIR (${CACHE_DIR}) should live under .cache/ at the repo root`,
    );
  });
});

describe("expectedAssetPrefix", () => {
  it("returns `/assets/` for the root base path", () => {
    assert.equal(expectedAssetPrefix("/"), "/assets/");
  });

  it("appends `assets/` to a base path that already ends with `/`", () => {
    assert.equal(expectedAssetPrefix("/platform/"), "/platform/assets/");
  });

  it("normalizes a base path that has no trailing slash", () => {
    assert.equal(expectedAssetPrefix("/__mockup"), "/__mockup/assets/");
  });
});

describe("extractRootRelativeUrls", () => {
  it("extracts root-relative src and href values", () => {
    const html =
      '<script src="/assets/a.js"></script><link href="/assets/a.css">';
    assert.deepEqual(extractRootRelativeUrls(html), [
      "/assets/a.js",
      "/assets/a.css",
    ]);
  });

  it("ignores absolute http(s) URLs but keeps anything starting with `/`", () => {
    // Protocol-relative URLs (`//host/...`) start with `/`, so they pass
    // through here — the asset-prefix check filters by `/assets/` substring,
    // which is the actual safety net.
    const html =
      '<script src="https://cdn.example.com/x.js"></script>' +
      '<img src="/local/z.png">';
    assert.deepEqual(extractRootRelativeUrls(html), ["/local/z.png"]);
  });

  it("returns an empty array when there are no root-relative refs", () => {
    assert.deepEqual(extractRootRelativeUrls("<html><body></body></html>"), []);
  });

  it("extracts URLs from prefixed Vite output (covers /__mockup/ and /platform/)", () => {
    const html =
      '<script src="/platform/assets/p.js"></script>' +
      '<link href="/__mockup/assets/m.css">';
    assert.deepEqual(extractRootRelativeUrls(html), [
      "/platform/assets/p.js",
      "/__mockup/assets/m.css",
    ]);
  });
});

describe("checkViteIndexHtml", () => {
  it("passes when assets are under the expected `/` base path", () => {
    const file = writeFixture("vite-root/index.html", VITE_HTML_ROOT);
    const result = checkViteIndexHtml(file, "/");
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    if (result.ok && !result.skipped) {
      assert.match(result.details, /under `\/assets\/`/);
    }
  });

  it("passes when assets are under the expected `/__mockup` base path", () => {
    const file = writeFixture("vite-mockup/index.html", VITE_HTML_MOCKUP);
    const result = checkViteIndexHtml(file, "/__mockup");
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
  });

  it("passes when assets are under the expected `/platform/` base path", () => {
    const file = writeFixture("vite-platform/index.html", VITE_HTML_PLATFORM);
    const result = checkViteIndexHtml(file, "/platform/");
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
  });

  it("fails when the HTML still emits root `/assets/` but BASE_PATH is `/platform/`", () => {
    const file = writeFixture("vite-wrong-base/index.html", VITE_HTML_ROOT);
    const result = checkViteIndexHtml(file, "/platform/");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /expected base path/i);
      assert.match(result.message, /\/platform\/assets\//);
    }
  });

  it("fails when the HTML emits the wrong prefix for `/__mockup`", () => {
    const file = writeFixture(
      "vite-wrong-mockup/index.html",
      VITE_HTML_PLATFORM,
    );
    const result = checkViteIndexHtml(file, "/__mockup");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /\/__mockup\/assets\//);
    }
  });

  it("fails when the HTML contains no `/assets/` references at all", () => {
    const file = writeFixture(
      "vite-empty/index.html",
      "<!doctype html><html><body></body></html>",
    );
    const result = checkViteIndexHtml(file, "/");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /no `\/assets\/\.\.\.` references/);
    }
  });

  it("ignores non-asset root-relative refs (favicons, public files) when validating", () => {
    const html = `<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon.ico">
    <script src="/platform/assets/index.js"></script>
  </head>
</html>`;
    const file = writeFixture("vite-with-favicon/index.html", html);
    const result = checkViteIndexHtml(file, "/platform/");
    assert.equal(result.ok, true);
  });
});

describe("pruneStaleCacheEntries", () => {
  it("removes `<name>.json` entries for artifacts that no longer exist", () => {
    const cacheDir = path.join(tmpRoot, "prune-removes-stale");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "ghost.json"), "{}");
    fs.writeFileSync(path.join(cacheDir, "platform.json"), "{}");

    const pruned = pruneStaleCacheEntries(["platform"], cacheDir);

    assert.deepEqual(pruned, ["ghost"]);
    assert.equal(fs.existsSync(path.join(cacheDir, "ghost.json")), false);
    assert.equal(fs.existsSync(path.join(cacheDir, "platform.json")), true);
  });

  it("returns an empty list when every cache entry still has a matching artifact", () => {
    const cacheDir = path.join(tmpRoot, "prune-no-stale");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "platform.json"), "{}");
    fs.writeFileSync(path.join(cacheDir, "marketing.json"), "{}");

    const pruned = pruneStaleCacheEntries(
      ["platform", "marketing", "api-server"],
      cacheDir,
    );

    assert.deepEqual(pruned, []);
    assert.equal(fs.existsSync(path.join(cacheDir, "platform.json")), true);
    assert.equal(fs.existsSync(path.join(cacheDir, "marketing.json")), true);
  });

  it("ignores non-`.json` files and returns an empty list when the cache dir is missing", () => {
    const cacheDir = path.join(tmpRoot, "prune-ignores-non-json");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "README.md"), "notes");
    fs.writeFileSync(path.join(cacheDir, "ghost.json"), "{}");

    const pruned = pruneStaleCacheEntries([], cacheDir);

    assert.deepEqual(pruned, ["ghost"]);
    assert.equal(fs.existsSync(path.join(cacheDir, "README.md")), true);
    assert.equal(fs.existsSync(path.join(cacheDir, "ghost.json")), false);

    const missingDir = path.join(tmpRoot, "prune-missing-dir");
    assert.deepEqual(pruneStaleCacheEntries([], missingDir), []);
  });
});

describe("checkNextRoutesManifest", () => {
  it("passes when the manifest basePath matches `/platform/`", () => {
    const file = writeFixture(
      "next-platform/routes-manifest.json",
      JSON.stringify({ basePath: "/platform" }),
    );
    const result = checkNextRoutesManifest(file, "/platform/");
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
  });

  it("passes when the manifest basePath is empty and BASE_PATH is `/`", () => {
    const file = writeFixture(
      "next-root/routes-manifest.json",
      JSON.stringify({ basePath: "" }),
    );
    const result = checkNextRoutesManifest(file, "/");
    assert.equal(result.ok, true);
  });

  it("passes when the manifest basePath matches `/__mockup`", () => {
    const file = writeFixture(
      "next-mockup/routes-manifest.json",
      JSON.stringify({ basePath: "/__mockup" }),
    );
    const result = checkNextRoutesManifest(file, "/__mockup");
    assert.equal(result.ok, true);
  });

  it("treats a missing basePath field as the empty string (passes for `/`)", () => {
    const file = writeFixture(
      "next-no-basepath/routes-manifest.json",
      JSON.stringify({ pages404: true }),
    );
    const result = checkNextRoutesManifest(file, "/");
    assert.equal(result.ok, true);
  });

  it("fails when the manifest basePath is empty but BASE_PATH is `/platform/`", () => {
    const file = writeFixture(
      "next-empty-wrong/routes-manifest.json",
      JSON.stringify({ basePath: "" }),
    );
    const result = checkNextRoutesManifest(file, "/platform/");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /basePath/);
      assert.match(result.message, /\/platform\//);
    }
  });

  it("fails when the manifest basePath is set to a different prefix", () => {
    const file = writeFixture(
      "next-mismatched/routes-manifest.json",
      JSON.stringify({ basePath: "/something-else" }),
    );
    const result = checkNextRoutesManifest(file, "/platform/");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /\/something-else/);
    }
  });

  it("fails with a clear message when the manifest is not valid JSON", () => {
    const file = writeFixture(
      "next-broken/routes-manifest.json",
      "{not valid json",
    );
    const result = checkNextRoutesManifest(file, "/platform/");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /Could not parse/);
    }
  });
});
