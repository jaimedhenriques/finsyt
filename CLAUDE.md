# Finsyt Development Guide

## Project Overview
Finsyt is an AI-powered financial research platform competing with Rogo. It provides instant insights on stocks, markets, and financial data through natural language queries.

## Team Structure

### Squad 1: Architecture & Foundation
- **Mission**: Tech stack, infrastructure, project scaffolding
- **Skills**: next-best-practices, react-best-practices, terraform-style-guide

### Squad 2: Backend & Data
- **Mission**: API development, database design, data pipelines
- **Skills**: postgres-best-practices, neon-postgres, duckdb-docs

### Squad 3: AI & Financial Analytics
- **Mission**: AI models, NLP for finance, ML integration
- **Skills**: openai-docs, claude-api, gemini-api-dev

### Squad 4: Frontend & UX
- **Mission**: UI components, user experience, design
- **Skills**: shadcn-ui, figma-implement-design, next-best-practices

### Squad 5: Security & Quality
- **Mission**: Code review, security audits, testing
- **Skills**: differential-review, static-analysis, qa, playwright-interactive

### Squad 6: Research & Integration
- **Mission**: Financial data APIs, market research
- **Skills**: firecrawl-scrape, firecrawl-search, research-documentation

## Recommended Skills to Install

From https://officialskills.sh/:
- next-best-practices
- shadcn-ui
- postgres-best-practices
- react-best-practices
- openai-docs

From GitHub Stars (https://github.com/stars/jaimedhenriques/lists/claude-code):
- addyosmani/agent-skills - Production-grade engineering skills
- Jeffallan/claude-skills - 66 specialized full-stack skills
- garrytan/gstack - 23 opinionated tools
- sickn33/antigravity-awesome-skills - 1,370+ agentic skills

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL via Neon
- **ORM**: Drizzle ORM
- **Auth**: NextAuth.js v5
- **AI**: Anthropic Claude, OpenAI GPT-4
- **State**: Zustand + TanStack Query
- **Charts**: Recharts

## Development Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm lint         # Run linter
pnpm test         # Run tests
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
```

## Key Files

- `src/services/ai.ts` - AI research service
- `src/services/market-data.ts` - Financial data APIs
- `src/db/schema.ts` - Database schema
- `src/app/api/research/route.ts` - Research API endpoint
- `src/app/dashboard/page.tsx` - Main dashboard

## Quality Standards

1. **Code Quality**: Follow TypeScript strict mode, use proper types
2. **Performance**: Optimize for fast initial load, use streaming where possible
3. **Security**: Validate all inputs, sanitize outputs, use parameterized queries
4. **UX**: Responsive design, dark mode support, accessible components
5. **Testing**: Unit tests for services, integration tests for APIs

## Competitors Analysis

- **Rogo**: AI financial research for investment professionals
- **AlphaSense**: Enterprise market intelligence
- **Sentieo**: Financial research platform
- **Koyfin**: Financial data and analytics

## Key Differentiators

1. Modern, clean UI with dark mode
2. Natural language financial queries
3. Real-time market data integration
4. AI-powered insights with source citations
5. Affordable pricing for retail investors
