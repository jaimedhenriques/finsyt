# Finsyt Collaboration Brief (Cursor x Claude)

This repository is now the canonical implementation baseline for Finsyt.

## Product North Star
Build an AI-native financial intelligence platform that competes with Rogo, AlphaSense, and Bloomberg workflows by combining:
- source-cited research chat
- live structured market + filings + macro data
- workflow automation via API, MCP, and Excel

## Backend Priorities (Execution Order)
1. Data layer: Postgres schema (users, orgs, conversations, messages, citations, watchlists, jobs)
2. Auth layer: session/JWT + RBAC + org tenancy
3. Provider orchestration: adapters, retries, timeouts, caching, observability
4. Research engine: retrieval fan-out + ranking + synthesis + strict citation mapping
5. Agents + jobs: monitoring alerts, scheduled briefs, async enrichment pipelines
6. Billing + limits: usage metering and subscription enforcement

## Current Foundation Delivered
- Next.js + TypeScript app baseline
- API routes:
  - `GET /api/v1/status`
  - `POST /api/v1/research`
- Typed provider registry and health checks
- Zod validation + env schema scaffold

## Collaboration Protocol
- Keep PRs small and vertical (one subsystem per PR)
- Every endpoint must include:
  - request/response schema
  - error model
  - logging hooks
- Every AI answer must carry provider-attributed citations
- No mock-only paths in production code without explicit TODO markers

## Immediate Next Build Items
1. Add Prisma + Postgres models and migrations
2. Implement real provider clients for FMP/Finnhub/FRED
3. Add Redis cache for quote and fundamentals fan-out
4. Replace placeholder research service with orchestrated pipeline
5. Add integration tests for status and research routes
