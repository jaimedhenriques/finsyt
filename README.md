# Finsyt - AI-Powered Financial Research Platform

An intelligent financial research and analytics platform that competes with Rogo, providing instant AI-powered insights on stocks, markets, and financial data.

## Features

- **AI-Powered Research**: Ask complex financial questions in natural language and get comprehensive, sourced answers
- **Real-Time Market Data**: Access live stock quotes, historical prices, and financial metrics
- **Deep Financial Analysis**: Analyze SEC filings, earnings calls, and analyst reports
- **Interactive Dashboard**: Clean, modern interface for seamless financial research
- **Watchlist Management**: Track your favorite stocks with price alerts
- **Saved Reports**: Save and organize your research for future reference

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: Zustand, TanStack Query
- **Database**: PostgreSQL (Neon Serverless)
- **ORM**: Drizzle ORM
- **Authentication**: NextAuth.js v5
- **AI Providers**: Anthropic Claude, OpenAI GPT-4
- **Charts**: Recharts
- **Financial Data APIs**: Alpha Vantage, Polygon.io, Finnhub

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL database (Neon recommended)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/jaimedhenriques/finsyt.git
cd finsyt
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your environment variables in `.env.local`:
```env
DATABASE_URL="your-neon-postgres-url"
AUTH_SECRET="generate-a-secret"
ANTHROPIC_API_KEY="your-anthropic-key"
OPENAI_API_KEY="your-openai-key"
ALPHA_VANTAGE_API_KEY="your-alpha-vantage-key"
```

5. Set up the database:
```bash
pnpm db:push
```

6. Run the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
finsyt/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── research/      # AI research endpoint
│   │   │   ├── quote/         # Stock quote endpoint
│   │   │   └── news/          # Market news endpoint
│   │   ├── dashboard/         # Main dashboard
│   │   └── auth/              # Authentication pages
│   ├── components/            # React components
│   │   └── ui/               # shadcn/ui components
│   ├── db/                    # Database schema & client
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utility functions
│   ├── services/              # Business logic
│   │   ├── ai.ts             # AI research service
│   │   └── market-data.ts    # Financial data APIs
│   └── types/                 # TypeScript types
├── drizzle/                   # Database migrations
└── public/                    # Static assets
```

## API Endpoints

### POST /api/research
Perform AI-powered financial research.

**Request:**
```json
{
  "query": "What's Apple's revenue growth?",
  "symbols": ["AAPL"],
  "includeNews": true,
  "includeSECFilings": true
}
```

### GET /api/quote
Fetch stock quotes and company information.

**Query Parameters:**
- `symbol` (required): Stock ticker symbol
- `company`: Include company info (true/false)
- `metrics`: Include financial metrics (true/false)

### GET /api/news
Fetch market news.

**Query Parameters:**
- `symbol`: Filter by stock ticker
- `limit`: Number of articles (default: 10)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection string | Yes |
| `AUTH_SECRET` | NextAuth.js secret | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage API key | Optional |
| `POLYGON_API_KEY` | Polygon.io API key | Optional |
| `FINNHUB_API_KEY` | Finnhub API key | Optional |

## Development

```bash
# Run development server
pnpm dev

# Run type checking
pnpm lint

# Run tests
pnpm test

# Generate database migrations
pnpm db:generate

# Push schema to database
pnpm db:push

# Open Drizzle Studio
pnpm db:studio
```

## Deployment

The app is optimized for deployment on [Vercel](https://vercel.com):

1. Connect your GitHub repository to Vercel
2. Configure environment variables
3. Deploy!

## Competitors

Finsyt competes with:
- **Rogo**: AI financial research for investment professionals
- **AlphaSense**: Enterprise market intelligence
- **Sentieo**: Financial research platform
- **Koyfin**: Financial data and analytics

## Roadmap

- [ ] SEC filing analysis with AI summarization
- [ ] Earnings call transcription and analysis
- [ ] Portfolio tracking and analysis
- [ ] Custom screeners with AI filters
- [ ] Mobile app (React Native)
- [ ] Browser extension
- [ ] API access for developers

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details.

---

Built with AI assistance to help investors make better decisions.
