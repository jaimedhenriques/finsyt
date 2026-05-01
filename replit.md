# Finsyt

## Overview

Finsyt is an institutional investor intelligence platform, offering a suite of tools for financial analysis and research. It's built as a pnpm workspace monorepo using TypeScript, designed for scalability and maintainability. The platform aims to provide comprehensive financial data, AI-powered insights, and workflow management for investors. Key capabilities include company analysis, AI-driven research agents, persistent workspaces, and AI-extracted document analysis.

The project's vision is to become a leading platform in the financial technology sector, leveraging advanced AI and data aggregation to deliver unparalleled insights to institutional investors. It integrates various financial data APIs and internal services to provide a rich user experience, focusing on enhancing research efficiency and decision-making for its users.

## User Preferences

- I prefer a structured and organized approach to development.
- I appreciate detailed explanations for complex features or architectural decisions.
- I expect clear communication regarding changes and their impact.
- Do not make changes to the `DEMO_USER_PASSWORD` Replit secret without prior discussion.

## System Architecture

The Finsyt platform is built as a pnpm workspace monorepo, facilitating modular development and shared dependencies.

**Technical Stack:**
- **Monorepo:** pnpm workspaces
- **Language:** TypeScript 5.9
- **Runtime:** Node.js 24
- **Package Manager:** pnpm
- **API Framework:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)

**UI/UX Decisions:**
- **`artifacts/platform` (Finsyt Data Platform):** A Next.js 15 + React 19 application served at `/platform/`. It features company pages, AI workflow agents, persistent workspaces, and a document matrix for AI-extracted analysis. The UI incorporates financial data APIs (FMP, Finnhub, Groq, Perplexity) when configured. A temporary `PLATFORM_OPEN_MODE` allows auth bypass for demos, displaying a persistent "Demo mode" banner.
- **`artifacts/marketing` (Finsyt Marketing Site):** A React + Vite + Tailwind + Framer Motion site for marketing purposes, handling lead generation via a `POST /api/leads` endpoint.

**Feature Specifications:**
- **Finsyt Research Agent (Phase 2):** An AI research agent (`POST /platform/api/agent/ask`) utilizing Server-Sent Events (SSE) for streaming responses. It supports configurable models (default `gpt-5-mini`) and OpenAI function calling with parallel tool calls. Tools include `get_quote`, `get_news`, `get_filings`, `get_financials`, `get_estimates`, `get_transcripts`, and `get_macro`, each with public data fallbacks.
- **Data Provider Wiring:** Implements a robust data provider hierarchy for various financial domains (Quotes, Bars, Financials, News, Insider). It uses Replit Postgres as the primary database. An admin interface (`/app/admin/providers`) offers observability into provider health and enables re-probing.
- **U.S. Census Bureau Provider:** Integrates first-class support for U.S. demographics, geographies, and business dynamics data. It includes internal (`/api/census/*`), public (`/api/v1/census/*`), and MCP tool endpoints.
- **FinceptTerminal-inspired Functionality:** Integrates World Bank Open Data, investor persona AI agents, portfolio risk analytics (Sharpe, Sortino, Calmar, VaR, CVaR, beta, alpha, R², correlation), and a multi-stage DCF model.
- **Census Surfacing in Platform UI:** Census data is integrated into the Macro workspace, Company workspace (HQ Context), and Screener workspace for enhanced demographic and geographical filtering.
- **Demo Login:** Provides a pre-seeded demo workspace with a one-click sign-in option for preview environments. The demo user (`demo@finsyt.com`) is provisioned with an organization, agents, inbox runs, and research notes.

**System Design Choices:**
- **Monorepo Structure:** Uses pnpm workspaces for managing multiple packages (`platform`, `marketing`, `api-server`, `tests`, `scripts`, `api-spec`, `db`).
- **Validation Gates:** Employs `typecheck`, `build`, `lint`, and `e2e-signin` validations to ensure code quality and prevent regressions.
- **Environment Configuration:** Leverages environment variables for API keys and operational settings (e.g., `AGENT_MODEL`, `OPS_ALERT_WEBHOOK_URL`).
- **Credential Health:** `lib/credential-health.ts` monitors upstream API key rejections and triggers alerts via webhooks for operational awareness.
- **Playwright End-to-End Tests:** `tests/` workspace contains Playwright smoke tests for critical user flows, such as sign-in.

## External Dependencies

- **Database:** PostgreSQL (via Replit's managed service)
- **ORM:** Drizzle ORM
- **Authentication:** Clerk (for user authentication and organization management)
- **Financial Data APIs:**
    - FMP (Financial Modeling Prep)
    - Finnhub
    - Groq
    - Perplexity
    - EODHD
    - Twelve Data
    - Marketstack
    - Alpha Vantage
    - Yahoo Finance
    - Financial Datasets
    - FinanceFlow
    - FRED (Federal Reserve Economic Data)
- **AI Integration:** OpenAI (via Replit OpenAI integration proxy)
- **Alerting/Monitoring:** Slack/Discord (via configurable webhooks for `OPS_ALERT_WEBHOOK_URL`)
- **Other APIs:**
    - U.S. Census Bureau API
    - World Bank Open Data API
- **Testing:** Playwright