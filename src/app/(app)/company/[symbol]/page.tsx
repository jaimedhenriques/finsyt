'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  Building,
  Globe,
  Users,
  Calendar,
  FileText,
  ExternalLink,
  Plus,
  MessageSquare,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { cn, formatMarketCap, formatPercent, formatCurrency, formatDate } from '@/lib/utils';
import { PriceChart } from '@/components/charts/price-chart';
import { ErrorMessage } from '@/components/ui/error-boundary';

interface CompanyData {
  symbol: string;
  name: string;
  description?: string;
  sector?: string;
  industry?: string;
  website?: string;
  employees?: number;
  ceo?: string;
  headquarters?: string;
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  dividend?: number;
  dividendYield?: number;
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

interface Filing {
  accessionNumber: string;
  formType: string;
  filedAt: Date;
  documentUrl: string;
  description?: string;
}

// Fetch functions
async function fetchProfile(symbol: string) {
  const res = await fetch(`/api/market?action=profile&symbol=${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

async function fetchQuote(symbol: string) {
  const res = await fetch(`/api/market?action=quote&symbol=${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch quote');
  return res.json();
}

async function fetchHistorical(symbol: string, timeframe: string) {
  const res = await fetch(`/api/market?action=historical&symbol=${symbol}&timeframe=${timeframe}`);
  if (!res.ok) throw new Error('Failed to fetch historical data');
  return res.json();
}

async function fetchFilings(symbol: string) {
  const res = await fetch(`/api/filings?ticker=${symbol}&limit=5`);
  if (!res.ok) throw new Error('Failed to fetch filings');
  return res.json();
}

export default function CompanyPage() {
  const params = useParams();
  const symbol = (params.symbol as string).toUpperCase();
  const [chartTimeframe, setChartTimeframe] = useState<'1W' | '1M' | '3M' | '1Y'>('1M');

  // Fetch company profile
  const { data: company, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['company', 'profile', symbol],
    queryFn: () => fetchProfile(symbol),
    staleTime: 300000, // 5 minutes
  });

  // Fetch quote
  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ['company', 'quote', symbol],
    queryFn: () => fetchQuote(symbol),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch historical prices for chart
  const { data: historicalData, isLoading: chartLoading } = useQuery({
    queryKey: ['company', 'historical', symbol, chartTimeframe],
    queryFn: () => fetchHistorical(symbol, chartTimeframe),
    staleTime: 60000,
  });

  // Fetch SEC filings
  const { data: filings } = useQuery({
    queryKey: ['company', 'filings', symbol],
    queryFn: () => fetchFilings(symbol),
    staleTime: 300000,
  });

  const isLoading = profileLoading || quoteLoading;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="container-responsive py-8">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <div className="grid lg:grid-cols-3 gap-6">
              <Skeleton className="h-48 lg:col-span-2" />
              <Skeleton className="h-48" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <ErrorMessage
          title="Company Not Found"
          message={`We couldn't find data for ${symbol}. Please check the symbol and try again.`}
        />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Building className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Company Not Found</h2>
          <p className="text-muted-foreground">
            We couldn't find data for {symbol}
          </p>
        </div>
      </div>
    );
  }

  // Use quote data or fallback values
  const currentPrice = quote?.price ?? 0;
  const priceChange = quote?.change ?? 0;
  const priceChangePercent = quote?.changePercent ?? 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="container-responsive py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <Building className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{company.name}</h1>
                <span className="text-xl font-mono text-muted-foreground">
                  {company.symbol}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{company.sector}</Badge>
                <Badge variant="secondary">{company.industry}</Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <p className="text-4xl font-bold">${currentPrice.toFixed(2)}</p>
              <div
                className={cn(
                  'flex items-center justify-end gap-2 text-lg font-medium',
                  priceChange >= 0 ? 'text-bull' : 'text-bear'
                )}
              >
                {priceChange >= 0 ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
                ${Math.abs(priceChange).toFixed(2)} ({formatPercent(priceChangePercent)})
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add to Watchlist
              </Button>
              <Button size="sm" asChild>
                <Link href={`/research?q=${symbol}`}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Research
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
            <TabsTrigger value="filings">SEC Filings</TabsTrigger>
            <TabsTrigger value="news">News</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            {/* Price Chart */}
            <Card className="mb-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Price History</CardTitle>
                <div className="flex gap-1">
                  {(['1W', '1M', '3M', '1Y'] as const).map((tf) => (
                    <Button
                      key={tf}
                      variant={chartTimeframe === tf ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setChartTimeframe(tf)}
                    >
                      {tf}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {chartLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : historicalData?.length > 0 ? (
                  <PriceChart
                    data={historicalData.map((d: { date: string; close: number }) => ({
                      date: d.date,
                      price: d.close,
                    }))}
                    height={300}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No chart data available
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* About */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {company.description}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4 mt-6">
                    {company.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {company.website.replace('https://', '')}
                        </a>
                      </div>
                    )}
                    {company.employees && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span>{company.employees.toLocaleString()} employees</span>
                      </div>
                    )}
                    {company.ceo && (
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-muted-foreground" />
                        <span>CEO: {company.ceo}</span>
                      </div>
                    )}
                    {company.headquarters && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <span>{company.headquarters}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Key Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle>Key Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StatRow
                    label="Market Cap"
                    value={formatMarketCap(company.marketCap || 0)}
                  />
                  <StatRow
                    label="P/E Ratio"
                    value={company.peRatio?.toFixed(2) || 'N/A'}
                  />
                  <StatRow
                    label="EPS"
                    value={company.eps ? `$${company.eps.toFixed(2)}` : 'N/A'}
                  />
                  <StatRow
                    label="Dividend Yield"
                    value={company.dividendYield ? `${company.dividendYield.toFixed(2)}%` : 'N/A'}
                  />
                  <StatRow
                    label="Beta"
                    value={company.beta?.toFixed(2) || 'N/A'}
                  />
                  <StatRow
                    label="52-Week High"
                    value={company.fiftyTwoWeekHigh ? `$${company.fiftyTwoWeekHigh.toFixed(2)}` : 'N/A'}
                  />
                  <StatRow
                    label="52-Week Low"
                    value={company.fiftyTwoWeekLow ? `$${company.fiftyTwoWeekLow.toFixed(2)}` : 'N/A'}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Trading Data */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Open</p>
                  <p className="text-xl font-bold">${quote.open.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Previous Close</p>
                  <p className="text-xl font-bold">${quote.previousClose.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Day Range</p>
                  <p className="text-xl font-bold">
                    ${quote.low.toFixed(2)} - ${quote.high.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Volume</p>
                  <p className="text-xl font-bold">
                    {(quote.volume / 1000000).toFixed(2)}M
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="filings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>SEC Filings</CardTitle>
                <CardDescription>
                  Recent regulatory filings for {company.symbol}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(filings || []).map((filing: Filing) => (
                    <div
                      key={filing.accessionNumber}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition"
                    >
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge>{filing.formType}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {formatDate(filing.filedAt)}
                            </span>
                          </div>
                          <p className="text-sm">{filing.description}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={filing.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View <ExternalLink className="ml-2 w-3 h-3" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financials" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Financial Statements</CardTitle>
                <CardDescription>
                  Income statement, balance sheet, and cash flow data
                </CardDescription>
              </CardHeader>
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">
                  Detailed financial data coming soon
                </p>
                <Button variant="outline" asChild>
                  <Link href={`/research?q=${symbol} financials`}>
                    Research with AI
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="news" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Latest News</CardTitle>
                <CardDescription>
                  Recent news and analysis for {company.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">
                  News feed coming soon
                </p>
                <Button variant="outline" asChild>
                  <Link href={`/research?q=${symbol} news`}>
                    Get News with AI
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
