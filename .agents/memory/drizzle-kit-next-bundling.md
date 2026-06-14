---
name: drizzle-kit in a Next.js server bundle
description: How to use drizzle-kit/api from a Next.js route without breaking the production webpack build.
---

# Using drizzle-kit/api from a Next.js route

A Next route that (transitively) imports `drizzle-kit/api` will break `next build`
(production webpack), even though `next dev` and a plain `tsx` CLI run it fine.
Webpack follows the import and tries to bundle drizzle-kit's internals — esbuild's
`main.d.ts` ("Module parse failed") and optional pg drivers that aren't installed
(`@electric-sql/pglite`, `postgres`, `@vercel/postgres`, `@neondatabase/serverless`)
→ "Module not found" → build fails.

## What does NOT work
- `serverExternalPackages: ['drizzle-kit']` alone. The diff code lives in a
  workspace lib (`@workspace/db`) that Next bundles by default, and the
  serverExternalPackages externalization does not win over a bundled workspace
  package's transitive dynamic import.
- A `/* webpackIgnore: true */` magic comment on the `import('drizzle-kit/api')`.
  **Why:** the comment lives in a transpiled workspace `.ts` file; Next's
  `next-swc-loader` strips it before webpack sees it, so it has no effect.

## What works
Add a `webpack` externals rule in `artifacts/platform/next.config.ts` that forces
`drizzle-kit` (and subpaths) to stay a runtime require on the server:

```ts
webpack: (config, { isServer }) => {
  if (isServer) {
    const prev = config.externals
    const list = Array.isArray(prev) ? prev : prev ? [prev] : []
    config.externals = [...list, (ctx, cb) =>
      (ctx.request === 'drizzle-kit' || ctx.request?.startsWith('drizzle-kit/'))
        ? cb(null, `commonjs ${ctx.request}`) : cb()]
  }
  return config
}
```

`commonjs` external type is safe because `drizzle-kit/api.mjs` has no top-level
await and is a `createRequire`-based bundle, so Node 24's require(ESM) resolves it
at call time. Keep the actual import lazy (`await import('drizzle-kit/api')` inside
the function) so it is only loaded when the diff actually runs.

**How to apply:** any time a Next.js route needs a heavy dev-only tool
(drizzle-kit, esbuild-backed libs) at runtime, externalize it via the webpack
config — do not rely on serverExternalPackages or webpackIgnore comments through
a transpiled workspace package.
