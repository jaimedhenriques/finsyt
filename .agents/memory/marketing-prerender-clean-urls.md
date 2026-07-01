---
name: Marketing SPA prerender + clean-URL serving
description: How per-route SEO metadata/JSON-LD is shipped in initial HTML for the Vite SPA marketing site, and the flat-file gotcha for static clean URLs.
---

# Marketing SPA prerender + clean-URL serving

The `artifacts/marketing` site is a client-rendered Vite SPA. SEO metadata that
only renders client-side (e.g. a React `<JsonLd>` component, or per-route
canonical set via JS) is invisible to non-JS crawlers and to the initial fetch.
Per the react-vite SEO reference, JSON-LD and canonical/OG must be in the
**initial HTML**, and pre-rendering is the preferred fix.

The build runs `vite build && node prerender.mjs`. `prerender.mjs` reads the
built `dist/public/index.html` shell and writes one static file per public
route with route-specific `<title>`, description, canonical, OG/Twitter tags,
and JSON-LD already in `<head>`.

## The flat-file gotcha (the part that took testing)

Output prerendered routes as **flat files** at the public root —
`dist/public/product.html` — NOT `dist/public/product/index.html`.

**Why:** production serves `serve = "static"` with a catch-all rewrite
`/* -> /index.html` (SPA fallback). The static host (and `vite preview`/sirv,
which mirrors it) resolves an extensionless clean URL like `/product` via the
default `.html` extension → `product.html`. It does **not** resolve `/product`
(no trailing slash) to a directory index `product/index.html`; that only works
for `/product/` *with* a trailing slash, and otherwise falls through to the
`/index.html` SPA fallback (serving the wrong, home-shell metadata).

**How to apply:** keep canonical URLs in the no-trailing-slash form
(`https://finsyt.com/product`) to match wouter's internal links, and emit
flat `<route>.html` files so that exact URL serves the right prerendered page.
Verify with `vite preview` + `curl /product` (no slash) before trusting it.
Don't reintroduce client-side JSON-LD injection — it duplicates the prerendered
block and the SEO guide says not to inject structured data dynamically.
