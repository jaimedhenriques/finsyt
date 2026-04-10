'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Filter,
  Search,
  Download,
  Save,
  Play,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Building2,
  DollarSign,
  Percent,
  Activity,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Star,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ScreenerFilter {
  id: string;
  name: string;
  type: 'range' | 'select' | 'multiselect';
  min?: number;
  max?: number;
  value?: string;
  values?: string[];
  options?: string[];
}

interface ScreenerResult {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  price: number;
  change: number;
  changePercent: number;
  pe: number | null;
  forwardPe: number | null;
  dividendYield: number | null;
  volume: number;
  avgVolume: number;
  beta: number;
  eps: number;
  revenueGrowth: number;
  profitMargin: number;
}

const SECTORS = [
  'All Sectors',
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials',
  'Communication Services',
];

const MARKET_CAP_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Mega Cap (>$200B)', value: 'mega' },
  { label: 'Large Cap ($10B-$200B)', value: 'large' },
  { label: 'Mid Cap ($2B-$10B)', value: 'mid' },
  { label: 'Small Cap ($300M-$2B)', value: 'small' },
  { label: 'Micro Cap (<$300M)', value: 'micro' },
];

const MOCK_RESULTS: ScreenerResult[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    marketCap: 3200000000000,
    price: 198.45,
    change: 3.21,
    changePercent: 1.64,
    pe: 32.5,
    forwardPe: 28.2,
    dividendYield: 0.48,
    volume: 52340000,
    avgVolume: 48000000,
    beta: 1.28,
    eps: 6.11,
    revenueGrowth: 8.2,
    profitMargin: 25.3,
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    sector: 'Technology',
    industry: 'Software',
    marketCap: 3100000000000,
    price: 425.80,
    change: 5.42,
    changePercent: 1.29,
    pe: 36.8,
    forwardPe: 31.5,
    dividendYield: 0.72,
    volume: 21560000,
    avgVolume: 19800000,
    beta: 0.89,
    eps: 11.57,
    revenueGrowth: 15.3,
    profitMargin: 36.7,
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    sector: 'Technology',
    industry: 'Semiconductors',
    marketCap: 2800000000000,
    price: 875.50,
    change: -12.30,
    changePercent: -1.39,
    pe: 68.2,
    forwardPe: 42.1,
    dividendYield: 0.02,
    volume: 45230000,
    avgVolume: 42100000,
    beta: 1.72,
    eps: 12.84,
    revenueGrowth: 122.4,
    profitMargin: 55.2,
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    sector: 'Communication Services',
    industry: 'Internet Content',
    marketCap: 2100000000000,
    price: 172.35,
    change: 1.85,
    changePercent: 1.08,
    pe: 25.4,
    forwardPe: 21.8,
    dividendYield: null,
    volume: 18420000,
    avgVolume: 17500000,
    beta: 1.05,
    eps: 6.78,
    revenueGrowth: 13.5,
    profitMargin: 24.8,
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    sector: 'Consumer Discretionary',
    industry: 'E-Commerce',
    marketCap: 1950000000000,
    price: 186.20,
    change: 2.45,
    changePercent: 1.33,
    pe: 62.1,
    forwardPe: 38.5,
    dividendYield: null,
    volume: 32100000,
    avgVolume: 29800000,
    beta: 1.15,
    eps: 3.00,
    revenueGrowth: 12.8,
    profitMargin: 6.4,
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase',
    sector: 'Financials',
    industry: 'Banks',
    marketCap: 580000000000,
    price: 198.75,
    change: -0.85,
    changePercent: -0.43,
    pe: 11.8,
    forwardPe: 10.5,
    dividendYield: 2.32,
    volume: 8540000,
    avgVolume: 9200000,
    beta: 1.12,
    eps: 16.84,
    revenueGrowth: 9.2,
    profitMargin: 32.5,
  },
  {
    symbol: 'JNJ',
    name: 'Johnson & Johnson',
    sector: 'Healthcare',
    industry: 'Pharmaceuticals',
    marketCap: 375000000000,
    price: 155.40,
    change: 0.65,
    changePercent: 0.42,
    pe: 15.2,
    forwardPe: 14.8,
    dividendYield: 3.05,
    volume: 6230000,
    avgVolume: 6800000,
    beta: 0.52,
    eps: 10.22,
    revenueGrowth: 4.5,
    profitMargin: 18.9,
  },
  {
    symbol: 'XOM',
    name: 'Exxon Mobil',
    sector: 'Energy',
    industry: 'Oil & Gas',
    marketCap: 485000000000,
    price: 118.30,
    change: 2.15,
    changePercent: 1.85,
    pe: 13.5,
    forwardPe: 12.8,
    dividendYield: 3.28,
    volume: 14560000,
    avgVolume: 13200000,
    beta: 0.95,
    eps: 8.76,
    revenueGrowth: -2.3,
    profitMargin: 10.8,
  },
];

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(2)}`;
}

function formatVolume(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toString();
}

type SortField = 'marketCap' | 'price' | 'changePercent' | 'pe' | 'dividendYield' | 'volume';

export default function ScreeningPage() {
  const [results, setResults] = useState<ScreenerResult[]>(MOCK_RESULTS);
  const [isLoading, setIsLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('marketCap');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Filter states
  const [sector, setSector] = useState('All Sectors');
  const [marketCapFilter, setMarketCapFilter] = useState('all');
  const [minPe, setMinPe] = useState('');
  const [maxPe, setMaxPe] = useState('');
  const [minDividend, setMinDividend] = useState('');
  const [minVolume, setMinVolume] = useState('');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    let aVal = a[sortField] ?? 0;
    let bVal = b[sortField] ?? 0;
    return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const handleRunScreener = async () => {
    setIsLoading(true);
    // In production, this would call /api/screener with filters
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {sortField === field ? (
        sortDirection === 'asc' ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Filter className="w-6 h-6" />
            Stock Screener
          </h1>
          <p className="text-muted-foreground">
            Filter stocks by fundamentals, technicals, and performance metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Save className="w-4 h-4" />
            Save Screen
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Filters Sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>Refine your search criteria</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sector */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Sector
              </label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Market Cap */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Market Cap
              </label>
              <Select value={marketCapFilter} onValueChange={setMarketCapFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_CAP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* P/E Ratio */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                P/E Ratio
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={minPe}
                  onChange={(e) => setMinPe(e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={maxPe}
                  onChange={(e) => setMaxPe(e.target.value)}
                />
              </div>
            </div>

            {/* Dividend Yield */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Percent className="w-4 h-4" />
                Min Dividend Yield %
              </label>
              <Input
                type="number"
                placeholder="e.g., 2.0"
                value={minDividend}
                onChange={(e) => setMinDividend(e.target.value)}
              />
            </div>

            {/* Volume */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Min Avg Volume
              </label>
              <Input
                type="number"
                placeholder="e.g., 1000000"
                value={minVolume}
                onChange={(e) => setMinVolume(e.target.value)}
              />
            </div>

            <Button
              onClick={handleRunScreener}
              disabled={isLoading}
              className="w-full gap-2"
            >
              <Play className="w-4 h-4" />
              {isLoading ? 'Running...' : 'Run Screener'}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setSector('All Sectors');
                setMarketCapFilter('all');
                setMinPe('');
                setMaxPe('');
                setMinDividend('');
                setMinVolume('');
              }}
              className="w-full"
            >
              Reset Filters
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Results</CardTitle>
                <CardDescription>{sortedResults.length} stocks found</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Symbol</th>
                    <th className="pb-3 font-medium">
                      <SortHeader field="price" label="Price" />
                    </th>
                    <th className="pb-3 font-medium">
                      <SortHeader field="changePercent" label="Change" />
                    </th>
                    <th className="pb-3 font-medium">
                      <SortHeader field="marketCap" label="Market Cap" />
                    </th>
                    <th className="pb-3 font-medium">
                      <SortHeader field="pe" label="P/E" />
                    </th>
                    <th className="pb-3 font-medium">
                      <SortHeader field="dividendYield" label="Div Yield" />
                    </th>
                    <th className="pb-3 font-medium">
                      <SortHeader field="volume" label="Volume" />
                    </th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((stock) => (
                    <tr key={stock.symbol} className="border-b hover:bg-muted/50">
                      <td className="py-3">
                        <Link
                          href={`/company/${stock.symbol}`}
                          className="font-medium hover:text-primary"
                        >
                          {stock.symbol}
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {stock.name}
                        </p>
                      </td>
                      <td className="py-3 font-medium">${stock.price.toFixed(2)}</td>
                      <td className="py-3">
                        <span
                          className={cn(
                            'flex items-center gap-1',
                            stock.changePercent >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          )}
                        >
                          {stock.changePercent >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {stock.changePercent >= 0 ? '+' : ''}
                          {stock.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3">{formatMarketCap(stock.marketCap)}</td>
                      <td className="py-3">
                        {stock.pe ? stock.pe.toFixed(1) : '-'}
                      </td>
                      <td className="py-3">
                        {stock.dividendYield
                          ? `${stock.dividendYield.toFixed(2)}%`
                          : '-'}
                      </td>
                      <td className="py-3">{formatVolume(stock.volume)}</td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Star className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Preset Screens */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Popular Screens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { name: 'Value Stocks', desc: 'Low P/E, high dividend yield', icon: DollarSign },
              { name: 'Growth Leaders', desc: 'High revenue growth, momentum', icon: TrendingUp },
              { name: 'Dividend Aristocrats', desc: '25+ years dividend growth', icon: Percent },
              { name: 'Large Cap Tech', desc: 'Mega cap technology stocks', icon: Building2 },
            ].map((screen) => (
              <Button
                key={screen.name}
                variant="outline"
                className="h-auto py-3 flex-col items-start gap-1"
              >
                <div className="flex items-center gap-2">
                  <screen.icon className="w-4 h-4" />
                  <span className="font-medium">{screen.name}</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {screen.desc}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
