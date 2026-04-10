'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
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

// Mock data for demo
const MOCK_COMPANY: CompanyData = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  description: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. The company offers iPhone, a line of smartphones; Mac, a line of personal computers; iPad, a line of multi-purpose tablets; and wearables, home, and accessories comprising AirPods, Apple TV, Apple Watch, Beats products, and HomePod.',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  website: 'https://apple.com',
  employees: 164000,
  ceo: 'Tim Cook',
  headquarters: 'Cupertino, California',
  marketCap: 3020000000000,
  peRatio: 29.5,
  eps: 6.42,
  dividendYield: 0.52,
  beta: 1.28,
  fiftyTwoWeekHigh: 199.62,
  fiftyTwoWeekLow: 164.08,
};

const MOCK_QUOTE: QuoteData = {
  price: 189.45,
  change: 2.34,
  changePercent: 1.25,
  volume: 52000000,
  high: 190.23,
  low: 187.12,
  open: 187.50,
  previousClose: 187.11,
};

const MOCK_FILINGS: Filing[] = [
  {
    accessionNumber: '0000320193-24-000081',
    formType: '10-K',
    filedAt: new Date('2024-11-01'),
    documentUrl: 'https://sec.gov',
    description: 'Annual Report',
  },
  {
    accessionNumber: '0000320193-24-000072',
    formType: '10-Q',
    filedAt: new Date('2024-08-02'),
    documentUrl: 'https://sec.gov',
    description: 'Quarterly Report Q3 2024',
  },
  {
    accessionNumber: '0000320193-24-000065',
    formType: '8-K',
    filedAt: new Date('2024-07-25'),
    documentUrl: 'https://sec.gov',
    description: 'Results of Operations and Financial Condition',
  },
];

export default function CompanyPage() {
  const params = useParams();
  const symbol = params.symbol as string;

  const [company, setCompany] = useState<CompanyData | null>(null);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In production, fetch from API
    const fetchData = async () => {
      setIsLoading(true);
      await new Promise((r) => setTimeout(r, 500));

      // Mock data - replace with actual API calls
      setCompany({ ...MOCK_COMPANY, symbol: symbol.toUpperCase() });
      setQuote(MOCK_QUOTE);
      setFilings(MOCK_FILINGS);
      setIsLoading(false);
    };

    fetchData();
  }, [symbol]);

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

  if (!company || !quote) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Building className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Company Not Found</h2>
          <p className="text-muted-foreground">
            We couldn't find data for {symbol.toUpperCase()}
          </p>
        </div>
      </div>
    );
  }

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
              <p className="text-4xl font-bold">${quote.price.toFixed(2)}</p>
              <div
                className={cn(
                  'flex items-center justify-end gap-2 text-lg font-medium',
                  quote.change >= 0 ? 'text-bull' : 'text-bear'
                )}
              >
                {quote.change >= 0 ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
                ${Math.abs(quote.change).toFixed(2)} ({formatPercent(quote.changePercent)})
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
                  {filings.map((filing) => (
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
