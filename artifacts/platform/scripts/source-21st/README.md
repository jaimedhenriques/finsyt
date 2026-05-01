# source-21st

Build-time tool that pulls curated UI components from the user's 21st.dev
account into `components/ui/sourced/<slug>/`. Never invoked at runtime.

## Prerequisites
- `TWENTY_FIRST_API_KEY` (or `TWENTYFIRST_API_KEY`) environment variable.
- The `@21st-sdk/node` package, already declared in `artifacts/platform/package.json`.

## Run
```sh
# Pull a specific component
pnpm --filter @workspace/platform exec tsx scripts/source-21st/source.ts --slug command-palette

# Pull the curated default set (see DEFAULT_SLUGS in source.ts)
pnpm --filter @workspace/platform exec tsx scripts/source-21st/source.ts --all

# Inspect what would be pulled without writing files
pnpm --filter @workspace/platform exec tsx scripts/source-21st/source.ts --slug page-header --dry-run
```

## What it writes
- Raw component files into `components/ui/sourced/<slug>/`.
- A row per pull into `components/ui/sourced/MANIFEST.md` recording the
  date, slug, version, origin URL, and file list.

## What it does *not* do
- It does **not** generate the Finsyt-branded adapter under
  `components/ui/<name>.tsx`. Adapters are hand-written so design tokens,
  accessibility, density, and dark-mode variants stay under our control.
- It is **not** part of the runtime bundle. Nothing under `app/` or
  `components/` (outside of `sourced/`) imports from `@21st-sdk/*`.
