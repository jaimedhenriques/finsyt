# Finsyt

AI-powered financial intelligence workspace. Monorepo with a Next.js platform, Express API server, marketing site, and shared libraries.

## Workspace Architecture

This is a **pnpm workspace** monorepo with four artifact apps and four shared libraries:

### Artifacts (Apps)

| Package | Description | Stack |
|---------|-------------|-------|
| `@workspace/platform` | Main financial intelligence dashboard | Next.js (App Router) |
| `@workspace/api-server` | REST API server | Express + Drizzle ORM |
| `@workspace/marketing` | Marketing / landing page | Vite + React (Wouter) |
| `@workspace/mockup-sandbox` | UI component playground | Vite + React |

### Libraries (Shared)

| Package | Description |
|---------|-------------|
| `@workspace/api-client-react` | React hooks + TanStack Query bindings for the API |
| `@workspace/api-spec` | Shared API contract / route definitions |
| `@workspace/api-zod` | Zod validation schemas for API payloads |
| `@workspace/db` | Drizzle ORM schema, migrations, and database utilities |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Platform | Next.js (App Router), React 19 |
| API Server | Express, Zod validation |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Clerk |
| Styling | Tailwind CSS 4 |
| Build | Vite 7, TypeScript 5.9 |
| Testing | Vitest |

## Quick Start

```bash
# Install dependencies (pnpm required)
pnpm install

# Start the platform (Next.js)
pnpm --filter @workspace/platform dev

# Start the API server
pnpm --filter @workspace/api-server dev

# Start the marketing site
pnpm --filter @workspace/marketing dev
```

## Scripts (Root)

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run build` | Typecheck → test → validate → build all artifacts |
| `pnpm run typecheck` | Typecheck libs then all artifacts |
| `pnpm run test` | Run tests across workspace |
| `pnpm run lint` | Lint all artifacts |

## Environment Variables

The API server validates its config via Zod (`artifacts/api-server/src/lib/config.ts`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | Yes | API server port |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated allowed origins |
| `CSRF_SECRET` | Production | CSRF protection secret (min 32 chars) |
| `DB_RUNTIME_ROLE` | No | PostgreSQL runtime role |
| `TRUSTED_PROXY_IPS` | No | Comma-separated trusted proxy IPs |
| `INTERNAL_AUTH_SECRET` | No | Secret for internal service auth |
| `CLERK_SECRET_KEY` | For auth | Clerk backend secret key |
| `LOG_LEVEL` | No | Logging level (default: info) |

## Project Structure

```
finsyt/
├── artifacts/
│   ├── api-server/          # Express REST API
│   ├── platform/            # Next.js financial dashboard
│   ├── marketing/           # Vite marketing site
│   └── mockup-sandbox/      # UI component playground
├── lib/
│   ├── api-client-react/    # React Query API hooks
│   ├── api-spec/            # Shared API contract
│   ├── api-zod/             # Zod schemas
│   └── db/                  # Drizzle ORM schema + migrations
├── scripts/                 # Build & validation scripts
├── tests/                   # Cross-workspace tests
├── pnpm-workspace.yaml      # Workspace configuration
└── tsconfig.base.json       # Shared TypeScript config
```

## Development

### Adding a new workspace package

1. Create directory under `artifacts/` (app) or `lib/` (shared)
2. Add a `package.json` with `"name": "@workspace/your-package"`
3. Run `pnpm install` to link it

### Database migrations

Managed via Drizzle ORM in `lib/db/`:

```bash
pnpm --filter @workspace/db drizzle-kit generate
pnpm --filter @workspace/db drizzle-kit migrate
```

## License

MIT
