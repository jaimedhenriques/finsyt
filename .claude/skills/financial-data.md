---
name: financial-data
description: Work with financial data providers, market data, SEC filings, and economic indicators. Use when fetching, transforming, or displaying financial information. FMP is the primary data source.
---

# Financial Data Skill

Handle financial data from multiple providers with FMP as the primary source.

## Provider Priority

Always use providers in this order:
1. **FMP (Financial Modeling Prep)** - Primary source for all data
2. **Databento** - Real-time and historical market data
3. **Alpha Vantage** - Quotes, profiles, technical indicators
4. **Yahoo Finance** - Fallback for basic quotes
5. **SEC EDGAR** - Official SEC filings
6. **FRED** - Economic indicators

## Data Types & Sources

### Stock Quotes
```typescript
// FMP endpoint (primary)
GET /api/v3/quote/{symbol}

// Response includes:
{
  symbol: "AAPL",
  price: 178.45,
  change: 2.35,
  changesPercentage: 1.33,
  marketCap: 2890000000000,
  volume: 54123456,
  avgVolume: 62000000,
  eps: 6.43,
  pe: 27.75,
  // ... more fields
}
```

### Company Profile
```typescript
// FMP endpoint
GET /api/v3/profile/{symbol}

// Key fields: description, sector, industry, employees, ceo, website
```

### Financial Statements
```typescript
// Income statement
GET /api/v3/income-statement/{symbol}?period=annual&limit=5

// Balance sheet
GET /api/v3/balance-sheet-statement/{symbol}?period=annual&limit=5

// Cash flow
GET /api/v3/cash-flow-statement/{symbol}?period=annual&limit=5
```

### SEC Filings
```typescript
// From SEC EDGAR
GET /api/filings?symbol={symbol}&type=10-K,10-Q,8-K

// Key filing types:
// 10-K: Annual report
// 10-Q: Quarterly report
// 8-K: Material events
// 4: Insider transactions
// 13F: Institutional holdings
```

### Economic Indicators (FRED)
```typescript
// Common series:
// GDP: Gross Domestic Product
// UNRATE: Unemployment Rate
// CPIAUCSL: Consumer Price Index
// FEDFUNDS: Federal Funds Rate
// T10Y2Y: Treasury Yield Spread
```

## Data Transformation

### Formatting Numbers
```typescript
// Currency
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Large numbers (market cap, volume)
export function formatCompact(value: number): string {
  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
}
// 2890000000000 -> "2.89T"
// 54123456 -> "54.12M"

// Percentage
export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
```

### Date Formatting
```typescript
import { format, parseISO } from 'date-fns';

// Filing dates
format(parseISO(date), 'MMM d, yyyy'); // "Jan 15, 2024"

// Chart dates
format(parseISO(date), 'MM/dd'); // "01/15"

// Timestamps
format(parseISO(date), 'MMM d, h:mm a'); // "Jan 15, 2:30 PM"
```

## Caching Strategy

### Cache Durations
```typescript
const CACHE_TTL = {
  quote: 60,           // 1 minute - real-time data
  profile: 86400,      // 24 hours - rarely changes
  financials: 86400,   // 24 hours - quarterly updates
  filings: 3600,       // 1 hour - new filings throughout day
  economic: 3600,      // 1 hour - updates vary by indicator
  search: 86400,       // 24 hours - company list stable
};
```

### Cache Keys
```typescript
const cacheKey = `fmp:quote:${symbol}`;
const cacheKey = `sec:filings:${cik}:${formType}`;
const cacheKey = `fred:series:${seriesId}`;
```

## Error Handling

### Provider Fallback
```typescript
async function getQuote(symbol: string) {
  // Try FMP first
  try {
    return await fmpProvider.getQuote(symbol);
  } catch (error) {
    console.error('FMP failed, trying fallback:', error);
  }
  
  // Fallback to Yahoo Finance
  try {
    return await yahooProvider.getQuote(symbol);
  } catch (error) {
    console.error('Yahoo failed:', error);
    throw new Error(`Unable to fetch quote for ${symbol}`);
  }
}
```

### Rate Limiting
```typescript
// FMP rate limits vary by plan
// Implement exponential backoff
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
```

## API Endpoints

### Internal API Routes
```
GET  /api/market?action=quote&symbol=AAPL
GET  /api/market?action=search&query=apple
GET  /api/market?action=gainers
GET  /api/market?action=losers
GET  /api/filings?symbol=AAPL&type=10-K
GET  /api/economic?series=GDP,UNRATE
POST /api/chat (AI research with citations)
```

### Response Format
```typescript
// Success
{
  success: true,
  data: { ... },
  cached: true,
  provider: "fmp"
}

// Error
{
  success: false,
  error: "Rate limit exceeded",
  code: "RATE_LIMITED"
}
```

## Common Patterns

### Stock Quote Component
```tsx
function StockQuote({ symbol }: { symbol: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => fetchQuote(symbol),
    staleTime: 60 * 1000, // 1 minute
  });

  if (isLoading) return <QuoteSkeleton />;
  if (error) return <QuoteError symbol={symbol} />;

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold font-mono tabular-nums">
        {formatCurrency(data.price)}
      </span>
      <span className={cn(
        "font-mono text-sm font-medium",
        data.change >= 0 ? "text-green-600" : "text-red-600"
      )}>
        {formatPercent(data.changesPercentage)}
      </span>
    </div>
  );
}
```

### Financial Table
```tsx
function FinancialsTable({ data }: { data: IncomeStatement[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left py-2 text-xs uppercase text-gray-500">Metric</th>
          {data.map(year => (
            <th key={year.date} className="text-right py-2 text-xs uppercase text-gray-500">
              {format(parseISO(year.date), 'yyyy')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr className="border-b">
          <td className="py-2">Revenue</td>
          {data.map(year => (
            <td key={year.date} className="text-right py-2 font-mono tabular-nums">
              {formatCompact(year.revenue)}
            </td>
          ))}
        </tr>
        {/* More rows... */}
      </tbody>
    </table>
  );
}
```

## API Keys Required

Set these in Vercel environment variables:
- `FMP_API_KEY` - Financial Modeling Prep (required)
- `DATABENTO_API_KEY` - Databento
- `ALPHA_VANTAGE_API_KEY` - Alpha Vantage
- `FRED_API_KEY` - FRED (free, optional)
