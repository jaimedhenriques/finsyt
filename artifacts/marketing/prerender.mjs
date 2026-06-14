/**
 * Build-time prerender for the marketing SPA.
 *
 * Vite emits a single `dist/public/index.html` shell. Crawlers that do not
 * execute JavaScript (most social/AI crawlers, and search engines for the
 * initial fetch) never see route-specific body content, metadata, or JSON-LD
 * if it is only rendered client-side. This script, run after the client and
 * SSR builds, writes one static HTML file per public route that already
 * contains:
 *   1. the server-rendered route body (via the SSR bundle's `render`), and
 *   2. route-specific <title>, description, Open Graph / Twitter tags,
 *      canonical, and JSON-LD structured data in the initial <head>.
 *
 * Build order:
 *   vite build && vite build --ssr --config vite.ssr.config.ts && node prerender.mjs
 *
 * Metadata is the single source of truth in `src/lib/routeMeta.ts`, re-exported
 * from the SSR bundle as ROUTE_META so the prerendered HTML and the client-side
 * `usePageMeta` hook can never drift.
 *
 * Output layout (flat files so the static host resolves clean URLs via the
 * default `.html` extension, e.g. a request for `/product` serves
 * `product.html`):
 *   /              -> dist/public/index.html
 *   /product       -> dist/public/product.html
 *   /pricing       -> dist/public/pricing.html
 *   ...etc
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "dist/public");
const SHELL_PATH = join(DIST_DIR, "index.html");

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  if (!re.test(html)) {
    throw new Error(`prerender: could not find <meta ${attr}="${key}"> in shell`);
  }
  return html.replace(re, `$1${escapeAttr(value)}$2`);
}

function setCanonical(html, url) {
  const re = /(<link rel="canonical" href=")[^"]*(")/;
  if (!re.test(html)) {
    throw new Error('prerender: could not find <link rel="canonical"> in shell');
  }
  return html.replace(re, `$1${escapeAttr(url)}$2`);
}

function setTitle(html, title) {
  return html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeAttr(title)}</title>`,
  );
}

function injectJsonLd(html, schema) {
  if (!schema) return html;
  // Escape "<" inside JSON to avoid prematurely closing the <script> tag.
  const json = JSON.stringify(schema).replace(/</g, "\\u003c");
  const tag = `    <script type="application/ld+json">${json}</script>\n  </head>`;
  return html.replace("</head>", tag);
}

function injectBody(html, appHtml) {
  if (!html.includes("<!--app-html-->")) {
    throw new Error("prerender: could not find <!--app-html--> placeholder in shell");
  }
  return html.replace("<!--app-html-->", appHtml);
}

function renderHead(shell, route, meta) {
  const canonical = meta.canonical;
  const ogTitle = meta.ogTitle ?? meta.title;
  const ogDescription = meta.ogDescription ?? meta.description;

  let html = shell;
  html = setTitle(html, meta.title);
  html = setMeta(html, "name", "description", meta.description);
  html = setMeta(html, "property", "og:title", ogTitle);
  html = setMeta(html, "property", "og:description", ogDescription);
  html = setMeta(html, "property", "og:url", canonical);
  html = setMeta(html, "name", "twitter:title", ogTitle);
  html = setMeta(html, "name", "twitter:description", ogDescription);
  html = setCanonical(html, canonical);
  html = injectJsonLd(html, meta.schema);
  return html;
}

async function main() {
  const serverBundle = join(__dirname, "dist/server/entry-server.js");
  const { render, ROUTE_META } = await import(serverBundle);

  const shell = readFileSync(SHELL_PATH, "utf-8");

  for (const [route, meta] of Object.entries(ROUTE_META)) {
    let appHtml;
    try {
      appHtml = render(route);
    } catch (err) {
      console.error(`  ✖ render failed for ${route}: ${err.message}`);
      console.error(err.stack ?? err);
      process.exit(1);
    }

    let html = renderHead(shell, route, meta);
    html = injectBody(html, appHtml);

    const outPath =
      route === "/"
        ? SHELL_PATH
        : join(DIST_DIR, `${route.replace(/^\//, "")}.html`);

    writeFileSync(outPath, html, "utf-8");
    console.log(`  ✓ prerendered ${route} -> ${outPath.replace(DIST_DIR + "/", "")}`);
  }

  console.log("Prerender complete.");
}

main().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});
