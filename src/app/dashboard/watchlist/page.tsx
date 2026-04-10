'use client';

import { useState } from 'react';
import { Plus, Search, TrendingUp, TrendingDown, Bell, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';

interface WatchlistItem {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  alertPrice?: number;
  alertEnabled: boolean;
}

const MOCK_WATCHLIST: WatchlistItem[] = [
  { id: '1', symbol: 'AAPL', name: 'Apple Inc.', price: 178.50, change: 2.35, changePercent: 1.33, alertEnabled: true, alertPrice: 175 },
  { id: '2', symbol: 'MSFT', name: 'Microsoft Corporation', price: 378.91, change: -1.24, changePercent: -0.33, alertEnabled: false },
  { id: '3', symbol: 'GOOGL', name: 'Alphabet Inc.', price: 141.80, change: 3.45, changePercent: 2.49, alertEnabled: true, alertPrice: 140 },
  { id: '4', symbol: 'AMZN', name: 'Amazon.com Inc.', price: 178.25, change: 1.12, changePercent: 0.63, alertEnabled: false },
  { id: '5', symbol: 'NVDA', name: 'NVIDIA Corporation', price: 875.28, change: 15.67, changePercent: 1.82, alertEnabled: true, alertPrice: 900 },
  { id: '6', symbol: 'TSLA', name: 'Tesla Inc.', price: 248.50, change: -8.25, changePercent: -3.21, alertEnabled: false },
];

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(MOCK_WATCHLIST);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWatchlist = watchlist.filter(
    (item) =>
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRemove = (id: string) => {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleAlert = (id: string) => {
    setWatchlist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, alertEnabled: !item.alertEnabled } : item
      )
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Watchlist</h1>
          <p className="text-muted-foreground">Track your favorite stocks</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Stock
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search watchlist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredWatchlist.map((item) => (
          <Card key={item.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {item.symbol}
                    {item.alertEnabled && (
                      <Bell className="h-4 w-4 text-primary" />
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {item.name}
                  </p>
                </div>
                <Badge
                  variant={item.change >= 0 ? 'success' : 'destructive'}
                  className="flex items-center gap-1"
                >
                  {item.change >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {formatPercentage(item.changePercent)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(item.price)}</p>
                  <p
                    className={cn(
                      'text-sm',
                      item.change >= 0 ? 'text-green-500' : 'text-red-500'
                    )}
                  >
                    {item.change >= 0 ? '+' : ''}{formatCurrency(item.change)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleAlert(item.id)}
                    className={cn(
                      item.alertEnabled && 'text-primary'
                    )}
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(item.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {item.alertPrice && item.alertEnabled && (
                <p className="text-xs text-muted-foreground mt-2">
                  Alert at: {formatCurrency(item.alertPrice)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredWatchlist.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No stocks in your watchlist</p>
          <Button className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Stock
          </Button>
        </div>
      )}
    </div>
  );
}
