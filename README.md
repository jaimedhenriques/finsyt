# Finsyt - AI-Powered Financial Research Platform

Finsyt is a professional-grade financial research and intelligence platform that combines real-time market data, SEC filings, and AI-powered analysis to help finance professionals make better investment decisions.

## Features

### Core Features

- **AI Research Chat** - Natural language interface for financial research with source-cited answers
- **Market Monitor** - Real-time stock quotes, market movers, and sector performance
- **SEC Filings** - Search and analyze 10-K, 10-Q, 8-K, and other SEC documents
- **Company Research** - Detailed company profiles, financials, and key metrics
- **Watchlists** - Track and monitor your portfolio of companies
- **AI Agents** - Automated research tasks, earnings monitors, and filing alerts

### Integrations

- **MCP Server** - Connect to Claude Desktop via Model Context Protocol
- **REST API** - Programmatic access to all financial data
- **Excel Plugin** - Access data directly in spreadsheets (coming soon)

### Data Sources

- SEC EDGAR (10-K, 10-Q, 8-K, Form 4, and more)
- Yahoo Finance (real-time quotes, historical prices)
- Financial Modeling Prep (financials, company profiles, news)
- FRED (Federal Reserve Economic Data)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js v5
- **AI**: Anthropic Claude API
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand + TanStack Query

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- API keys for:
  - Anthropic Claude API
  - Financial Modeling Prep (optional)
  - FRED (optional)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/jaimedhenriques/finsyt.git
cd finsyt
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/finsyt"
AUTH_SECRET="your-auth-secret"
ANTHROPIC_API_KEY="your-anthropic-key"
FMP_API_KEY="your-fmp-key"
```

4. Initialize the database:
```bash
npm run db:push
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
finsyt/
├── prisma/
│   └── schema.prisma        # Database schema
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (app)/           # Protected app routes
│   │   │   ├── dashboard/   # User dashboard
│   │   │   ├── research/    # AI chat interface
│   │   │   ├── market/      # Market monitor
│   │   │   ├── filings/     # SEC filings search
│   │   │   ├── companies/   # Company browser
│   │   │   ├── agents/      # AI agents management
│   │   │   └── settings/    # User settings
│   │   ├── api/             # API routes
│   │   │   ├── chat/        # AI chat endpoint
│   │   │   ├── market/      # Market data
│   │   │   ├── filings/     # SEC filings
│   │   │   ├── economic/    # FRED economic data
│   │   │   ├── watchlist/   # Watchlist CRUD
│   │   │   ├── agents/      # Agent management
│   │   │   └── mcp/         # MCP server endpoint
│   │   └── auth/            # Authentication pages
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   └── providers.tsx    # App providers
│   ├── lib/
│   │   ├── ai/              # AI chat and tools
│   │   ├── providers/       # Data provider adapters
│   │   │   ├── sec-edgar.ts # SEC EDGAR
│   │   │   ├── yahoo-finance.ts # Yahoo Finance
│   │   │   ├── fmp.ts       # Financial Modeling Prep
│   │   │   └── fred.ts      # FRED economic data
│   │   ├── auth.ts          # NextAuth config
│   │   ├── db.ts            # Prisma client
│   │   └── utils.ts         # Utilities
│   └── hooks/               # Custom React hooks
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## API Reference

### Market Data

```
GET /api/market?action=quote&symbol=AAPL
GET /api/market?action=quotes&symbols=AAPL,MSFT,GOOGL
GET /api/market?action=gainers
GET /api/market?action=losers
GET /api/market?action=search&q=apple
```

### SEC Filings

```
GET /api/filings?action=company&ticker=AAPL
GET /api/filings?action=10k&ticker=AAPL
GET /api/filings?action=search&q=artificial+intelligence
```

### Economic Data

```
GET /api/economic?action=dashboard
GET /api/economic?action=series&series=GDP
GET /api/economic?action=unemployment
GET /api/economic?action=inflation
```

### AI Chat

```
POST /api/chat
{
  "messages": [
    { "role": "user", "content": "Compare Apple and Microsoft financials" }
  ],
  "chatId": "optional-existing-chat-id"
}
```

### MCP Server

```
POST /api/mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

## MCP Integration

To use Finsyt with Claude Desktop:

1. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "finsyt": {
      "url": "https://finsyt.com/api/mcp"
    }
  }
}
```

2. Restart Claude Desktop

3. Use financial tools directly in your conversations:
   - Get stock quotes
   - Search SEC filings
   - Access economic data
   - Research companies

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AUTH_SECRET` | NextAuth.js secret | Yes |
| `AUTH_GOOGLE_ID` | Google OAuth client ID | No |
| `AUTH_GOOGLE_SECRET` | Google OAuth secret | No |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI | Yes |
| `FMP_API_KEY` | Financial Modeling Prep key | Recommended |
| `FRED_API_KEY` | FRED API key | Recommended |
| `REDIS_URL` | Redis connection for caching | No |

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Docker

```bash
docker build -t finsyt .
docker run -p 3000:3000 --env-file .env finsyt
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details.

## Support

- Documentation: [finsyt.com/docs](https://finsyt.com/docs)
- Issues: [GitHub Issues](https://github.com/jaimedhenriques/finsyt/issues)
- Email: support@finsyt.com

---

Built with Next.js, Anthropic Claude, and financial data from SEC EDGAR, Yahoo Finance, FMP, and FRED.
