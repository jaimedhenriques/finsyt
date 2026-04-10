'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  BarChart3,
  Activity,
  AlertTriangle,
  Plus,
  Upload,
  Download,
  RefreshCw,
  Target,
  Scale,
  Zap,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Position {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  value: number;
  gain: number;
  gainPercent: number;
  weight: number;
  sector: string;
  dayChange: number;
  dayChangePercent: number;
}

interface PortfolioMetrics {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPercent: number;
  dayChange: number;
  dayChangePercent: number;
  beta: number;
  sharpeRatio: number;
  volatility: number;
  dividendYield: number;
  annualDividends: number;
}

const MOCK_POSITIONS: Position[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    shares: 50,
    avgCost: 165.00,
    currentPrice: 198.45,
    value: 9922.50,
    gain: 1672.50,
    gainPercent: 20.27,
    weight: 18.5,
    sector: 'Technology',
    dayChange: 160.50,
    dayChangePercent: 1.64,
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    shares: 25,
    avgCost: 380.00,
    currentPrice: 425.80,
    value: 10645.00,
    gain: 1145.00,
    gainPercent: 12.05,
    weight: 19.8,
    sector: 'Technology',
    dayChange: 135.50,
    dayChangePercent: 1.29,
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    shares: 10,
    avgCost: 650.00,
    currentPrice: 875.50,
    value: 8755.00,
    gain: 2255.00,
    gainPercent: 34.69,
    weight: 16.3,
    sector: 'Technology',
    dayChange: -123.00,
    dayChangePercent: -1.39,
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase',
    shares: 40,
    avgCost: 175.00,
    currentPrice: 198.75,
    value: 7950.00,
    gain: 950.00,
    gainPercent: 13.57,
    weight: 14.8,
    sector: 'Financials',
    dayChange: -34.00,
    dayChangePercent: -0.43,
  },
  {
    symbol: 'JNJ',
    name: 'Johnson & Johnson',
    shares: 30,
    avgCost: 160.00,
    currentPrice: 155.40,
    value: 4662.00,
    gain: -138.00,
    gainPercent: -2.88,
    weight: 8.7,
    sector: 'Healthcare',
    dayChange: 19.50,
    dayChangePercent: 0.42,
  },
  {
    symbol: 'XOM',
    name: 'Exxon Mobil',
    shares: 45,
    avgCost: 95.00,
    currentPrice: 118.30,
    value: 5323.50,
    gain: 1048.50,
    gainPercent: 24.54,
    weight: 9.9,
    sector: 'Energy',
    dayChange: 96.75,
    dayChangePercent: 1.85,
  },
  {
    symbol: 'VZ',
    name: 'Verizon',
    shares: 100,
    avgCost: 38.00,
    currentPrice: 42.15,
    value: 4215.00,
    gain: 415.00,
    gainPercent: 10.92,
    weight: 7.9,
    sector: 'Communication Services',
    dayChange: 21.00,
    dayChangePercent: 0.50,
  },
  {
    symbol: 'PG',
    name: 'Procter & Gamble',
    shares: 15,
    avgCost: 155.00,
    currentPrice: 168.25,
    value: 2523.75,
    gain: 198.75,
    gainPercent: 8.55,
    weight: 4.7,
    sector: 'Consumer Staples',
    dayChange: 15.00,
    dayChangePercent: 0.60,
  },
];

const MOCK_METRICS: PortfolioMetrics = {
  totalValue: 53696.75,
  totalCost: 47150.00,
  totalGain: 6546.75,
  totalGainPercent: 13.88,
  dayChange: 291.25,
  dayChangePercent: 0.55,
  beta: 1.12,
  sharpeRatio: 1.45,
  volatility: 18.5,
  dividendYield: 1.82,
  annualDividends: 976.80,
};

const SECTOR_ALLOCATION = [
  { sector: 'Technology', weight: 54.6, color: 'bg-blue-500' },
  { sector: 'Financials', weight: 14.8, color: 'bg-green-500' },
  { sector: 'Energy', weight: 9.9, color: 'bg-yellow-500' },
  { sector: 'Healthcare', weight: 8.7, color: 'bg-red-500' },
  { sector: 'Communication Services', weight: 7.9, color: 'bg-purple-500' },
  { sector: 'Consumer Staples', weight: 4.1, color: 'bg-orange-500' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p
              className={cn(
                'text-2xl font-bold mt-1',
                trend === 'up' && 'text-green-600',
                trend === 'down' && 'text-red-600'
              )}
            >
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div
            className={cn(
              'p-2 rounded-lg',
              trend === 'up' && 'bg-green-100 text-green-600',
              trend === 'down' && 'bg-red-100 text-red-600',
              trend === 'neutral' && 'bg-muted text-muted-foreground',
              !trend && 'bg-primary/10 text-primary'
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortfolioPage() {
  const [positions] = useState<Position[]>(MOCK_POSITIONS);
  const [metrics] = useState<PortfolioMetrics>(MOCK_METRICS);
  const [isLoading, setIsLoading] = useState(false);

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PieChart className="w-6 h-6" />
            Portfolio Analytics
          </h1>
          <p className="text-muted-foreground">
            Track performance, allocation, and risk metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Position
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Value"
          value={formatCurrency(metrics.totalValue)}
          subtitle={`Cost basis: ${formatCurrency(metrics.totalCost)}`}
          icon={DollarSign}
        />
        <MetricCard
          title="Total Gain/Loss"
          value={`${metrics.totalGainPercent >= 0 ? '+' : ''}${formatCurrency(metrics.totalGain)}`}
          subtitle={`${metrics.totalGainPercent >= 0 ? '+' : ''}${metrics.totalGainPercent.toFixed(2)}%`}
          icon={TrendingUp}
          trend={metrics.totalGain >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          title="Today's Change"
          value={`${metrics.dayChange >= 0 ? '+' : ''}${formatCurrency(metrics.dayChange)}`}
          subtitle={`${metrics.dayChangePercent >= 0 ? '+' : ''}${metrics.dayChangePercent.toFixed(2)}%`}
          icon={Activity}
          trend={metrics.dayChange >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          title="Annual Dividends"
          value={formatCurrency(metrics.annualDividends)}
          subtitle={`Yield: ${metrics.dividendYield.toFixed(2)}%`}
          icon={Percent}
        />
      </div>

      {/* Risk Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Beta</p>
                <p className="text-xl font-bold">{metrics.beta.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
                <p className="text-xl font-bold">{metrics.sharpeRatio.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 text-orange-600">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Volatility</p>
                <p className="text-xl font-bold">{metrics.volatility.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Diversification</p>
                <p className="text-xl font-bold">Good</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Holdings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Holdings</CardTitle>
            <CardDescription>{positions.length} positions</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Symbol</th>
                    <th className="pb-3 font-medium text-right">Shares</th>
                    <th className="pb-3 font-medium text-right">Price</th>
                    <th className="pb-3 font-medium text-right">Value</th>
                    <th className="pb-3 font-medium text-right">Gain/Loss</th>
                    <th className="pb-3 font-medium text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={position.symbol} className="border-b hover:bg-muted/50">
                      <td className="py-3">
                        <Link
                          href={`/company/${position.symbol}`}
                          className="font-medium hover:text-primary"
                        >
                          {position.symbol}
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {position.name}
                        </p>
                      </td>
                      <td className="py-3 text-right">{position.shares}</td>
                      <td className="py-3 text-right">
                        <div>
                          ${position.currentPrice.toFixed(2)}
                          <p
                            className={cn(
                              'text-xs',
                              position.dayChangePercent >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {position.dayChangePercent >= 0 ? '+' : ''}
                            {position.dayChangePercent.toFixed(2)}%
                          </p>
                        </div>
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(position.value)}
                      </td>
                      <td className="py-3 text-right">
                        <div
                          className={cn(
                            position.gain >= 0 ? 'text-green-600' : 'text-red-600'
                          )}
                        >
                          <p className="font-medium">
                            {position.gain >= 0 ? '+' : ''}
                            {formatCurrency(position.gain)}
                          </p>
                          <p className="text-xs">
                            {position.gainPercent >= 0 ? '+' : ''}
                            {position.gainPercent.toFixed(2)}%
                          </p>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <Badge variant="outline">{position.weight.toFixed(1)}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Allocation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sector Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Visual bar */}
              <div className="h-4 rounded-full overflow-hidden flex">
                {SECTOR_ALLOCATION.map((sector) => (
                  <div
                    key={sector.sector}
                    className={cn(sector.color)}
                    style={{ width: `${sector.weight}%` }}
                  />
                ))}
              </div>

              {/* Legend */}
              <div className="space-y-2">
                {SECTOR_ALLOCATION.map((sector) => (
                  <div
                    key={sector.sector}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn('w-3 h-3 rounded', sector.color)} />
                      <span className="text-sm">{sector.sector}</span>
                    </div>
                    <span className="text-sm font-medium">{sector.weight}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Concentration Warning */}
            <div className="mt-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    High Tech Concentration
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    54.6% in Technology sector. Consider diversifying.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance vs Benchmarks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { name: 'Your Portfolio', ytd: 13.88, color: 'text-primary' },
              { name: 'S&P 500', ytd: 12.45, color: 'text-muted-foreground' },
              { name: 'NASDAQ', ytd: 15.32, color: 'text-muted-foreground' },
              { name: 'Dow Jones', ytd: 8.76, color: 'text-muted-foreground' },
            ].map((bench) => (
              <div key={bench.name} className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">{bench.name}</p>
                <p className={cn('text-2xl font-bold mt-1', bench.color)}>
                  +{bench.ytd.toFixed(2)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">YTD Return</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
