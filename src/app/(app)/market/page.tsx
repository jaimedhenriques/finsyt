'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
  RefreshCw,
  Clock,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { cn, formatCurrency, formatPercent, formatVolume } from '@/lib/utils';
import { SparklineChart } from '@/components/charts/price-chart';
import { LoadingSpinner } from '@/components/ui/loading';
import { ErrorMessage } from '@/components/ui/error-boundary';

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
}

// Fetch function for market data
async function fetchMarketData(action: string) {
  const res = await fetch(`/api/market?action=${action}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${action}`);
  }
  return res.json();
}

// Default indices to show
const DEFAULT_INDICES = ['SPY', 'QQQ', 'DIA', 'IWM'];

export default function MarketPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch market indices
  const { data: indices, isLoading: indicesLoading, error: indicesError, refetch: refetchIndices } = useQuery({
    queryKey: ['market', 'quotes', DEFAULT_INDICES],
    queryFn: () => fetchMarketData(`quotes&symbols=${DEFAULT_INDICES.join(',')}`),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch gainers
  const { data: gainers, isLoading: gainersLoading, refetch: refetchGainers } = useQuery({
    queryKey: ['market', 'gainers'],
    queryFn: () => fetchMarketData('gainers'),
    staleTime: 60000,
  });

  // Fetch losers
  const { data: losers, isLoading: losersLoading, refetch: refetchLosers } = useQuery({
    queryKey: ['market', 'losers'],
    queryFn: () => fetchMarketData('losers'),
    staleTime: 60000,
  });

  // Fetch most active
  const { data: actives, isLoading: activesLoading, refetch: refetchActives } = useQuery({
    queryKey: ['market', 'actives'],
    queryFn: () => fetchMarketData('actives'),
    staleTime: 60000,
  });

  // Fetch sectors
  const { data: sectors, isLoading: sectorsLoading } = useQuery({
    queryKey: ['market', 'sectors'],
    queryFn: () => fetchMarketData('sectors'),
    staleTime: 60000,
  });

  const refresh = () => {
    refetchIndices();
    refetchGainers();
    refetchLosers();
    refetchActives();
  };

  const lastUpdate = new Date();

  return (
    <div className="flex-1 overflow-auto">
      <div className="container-responsive py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Market Monitor</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add to Watchlist
            </Button>
          </div>
        </div>

        {/* Market Indices */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {indicesLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-24" />
                </CardContent>
              </Card>
            ))
          ) : indicesError ? (
            <Card className="col-span-4">
              <CardContent className="pt-6">
                <ErrorMessage
                  message="Failed to load market indices"
                  onRetry={() => refetchIndices()}
                />
              </CardContent>
            </Card>
          ) : (
            (indices || []).map((index: Quote) => (
              <Card key={index.symbol}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">{index.name || index.symbol}</p>
                      <p className="text-2xl font-bold">{formatCurrency(index.price)}</p>
                    </div>
                    <Badge
                      variant={index.changePercent >= 0 ? 'success' : 'danger'}
                      className="flex items-center gap-1"
                    >
                      {index.changePercent >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {formatPercent(index.changePercent)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search stocks by symbol or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Market Movers */}
        <Tabs defaultValue="gainers">
          <TabsList>
            <TabsTrigger value="gainers" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Top Gainers
            </TabsTrigger>
            <TabsTrigger value="losers" className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Top Losers
            </TabsTrigger>
            <TabsTrigger value="active" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Most Active
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gainers" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Gainers</CardTitle>
                <CardDescription>Stocks with the highest percentage gains today</CardDescription>
              </CardHeader>
              <CardContent>
                {gainersLoading ? (
                  <LoadingTable />
                ) : (
                  <StockTable stocks={gainers || []} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="losers" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Losers</CardTitle>
                <CardDescription>Stocks with the largest percentage losses today</CardDescription>
              </CardHeader>
              <CardContent>
                {losersLoading ? (
                  <LoadingTable />
                ) : (
                  <StockTable stocks={losers || []} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Most Active</CardTitle>
                <CardDescription>Stocks with the highest trading volume today</CardDescription>
              </CardHeader>
              <CardContent>
                {activesLoading ? (
                  <LoadingTable />
                ) : (
                  <StockTable stocks={actives || []} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Sector Performance */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Sector Performance</CardTitle>
            <CardDescription>Today's performance by sector</CardDescription>
          </CardHeader>
          <CardContent>
            {sectorsLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(sectors || []).map((sector: { sector: string; changesPercentage: number }) => (
                  <div
                    key={sector.sector}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <span className="text-sm font-medium">{sector.sector}</span>
                    <span
                      className={cn(
                        'text-sm font-medium',
                        sector.changesPercentage >= 0 ? 'text-bull' : 'text-bear'
                      )}
                    >
                      {formatPercent(sector.changesPercentage)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function StockTable({ stocks }: { stocks: Quote[] }) {
  if (!stocks || stocks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No data available</p>
        <p className="text-sm">Configure API keys to see live market data</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th className="text-right">Price</th>
            <th className="text-right">Change</th>
            <th className="text-right">% Change</th>
            <th className="text-right">Volume</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr key={stock.symbol} className="cursor-pointer hover:bg-muted/50">
              <td className="font-medium">{stock.symbol}</td>
              <td className="text-muted-foreground">{stock.name}</td>
              <td className="text-right font-mono">{formatCurrency(stock.price)}</td>
              <td
                className={cn(
                  'text-right font-mono',
                  stock.change >= 0 ? 'text-bull' : 'text-bear'
                )}
              >
                {stock.change >= 0 ? '+' : ''}
                {stock.change?.toFixed(2) || '0.00'}
              </td>
              <td className="text-right">
                <Badge
                  variant={stock.changePercent >= 0 ? 'success' : 'danger'}
                  className="font-mono"
                >
                  {formatPercent(stock.changePercent)}
                </Badge>
              </td>
              <td className="text-right text-muted-foreground">
                {formatVolume(stock.volume || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
