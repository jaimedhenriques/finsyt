'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { cn, formatCurrency, formatPercent, formatVolume } from '@/lib/utils';

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
}

// Mock data - in production this would fetch from /api/market
const MOCK_INDICES = [
  { symbol: 'SPY', name: 'S&P 500', price: 512.45, change: 3.21, changePercent: 0.63 },
  { symbol: 'QQQ', name: 'NASDAQ 100', price: 438.92, change: -1.45, changePercent: -0.33 },
  { symbol: 'DIA', name: 'Dow Jones', price: 398.67, change: 2.15, changePercent: 0.54 },
  { symbol: 'IWM', name: 'Russell 2000', price: 207.33, change: -0.89, changePercent: -0.43 },
];

const MOCK_GAINERS = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', price: 875.32, change: 45.67, changePercent: 5.51, volume: 48000000 },
  { symbol: 'META', name: 'Meta Platforms', price: 502.45, change: 18.23, changePercent: 3.76, volume: 22000000 },
  { symbol: 'AMD', name: 'AMD Inc', price: 178.90, change: 5.67, changePercent: 3.27, volume: 35000000 },
];

const MOCK_LOSERS = [
  { symbol: 'TSLA', name: 'Tesla Inc', price: 178.45, change: -8.90, changePercent: -4.75, volume: 95000000 },
  { symbol: 'NFLX', name: 'Netflix Inc', price: 612.30, change: -15.20, changePercent: -2.42, volume: 8000000 },
];

export default function MarketPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // In production, these would be real API calls
  const indices = MOCK_INDICES;
  const gainers = MOCK_GAINERS;
  const losers = MOCK_LOSERS;

  const refresh = () => {
    setLastUpdate(new Date());
    // Would trigger refetch
  };

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
          {indices.map((index) => (
            <Card key={index.symbol}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-muted-foreground">{index.name}</p>
                    <p className="text-2xl font-bold">{formatCurrency(index.price)}</p>
                  </div>
                  <Badge
                    variant={index.change >= 0 ? 'success' : 'danger'}
                    className="flex items-center gap-1"
                  >
                    {index.change >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {formatPercent(index.changePercent)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
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
                <StockTable stocks={gainers} />
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
                <StockTable stocks={losers} />
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
                <StockTable stocks={[...gainers, ...losers].sort((a, b) => (b.volume || 0) - (a.volume || 0))} />
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { name: 'Technology', change: 1.24 },
                { name: 'Healthcare', change: 0.87 },
                { name: 'Financials', change: -0.32 },
                { name: 'Energy', change: -1.15 },
                { name: 'Consumer Discretionary', change: 0.56 },
                { name: 'Industrials', change: 0.21 },
                { name: 'Materials', change: -0.45 },
                { name: 'Real Estate', change: -0.78 },
              ].map((sector) => (
                <div
                  key={sector.name}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <span className="text-sm font-medium">{sector.name}</span>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      sector.change >= 0 ? 'text-bull' : 'text-bear'
                    )}
                  >
                    {formatPercent(sector.change)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StockTable({ stocks }: { stocks: Quote[] }) {
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
                {stock.change.toFixed(2)}
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
