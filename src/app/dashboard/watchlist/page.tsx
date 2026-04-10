'use client';

import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Grid3X3,
  List,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { WatchlistCard } from '@/components/dashboard/watchlist-card';
import { useDashboardStore } from '@/stores/dashboard-store';
import { StockQuote } from '@/types';
import { cn, formatPercentage } from '@/lib/utils';

export default function WatchlistPage() {
  const { watchlist, addToWatchlist, settings, updatePreferences } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'change'>('name');

  const viewMode = settings.preferences.defaultView;

  // Fetch quotes for all watchlist items
  const quoteQueries = useQueries({
    queries: watchlist.map((item) => ({
      queryKey: ['stock-quote', item.symbol],
      queryFn: async (): Promise<{ quote: StockQuote }> => {
        const response = await fetch(`/api/quote?symbol=${item.symbol}`);
        if (!response.ok) throw new Error('Failed to fetch quote');
        return response.json();
      },
      staleTime: 30000,
      enabled: !!item.symbol,
    })),
  });

  // Create a map of symbol -> quote
  const quoteMap = useMemo(() => {
    const map: Record<string, StockQuote> = {};
    watchlist.forEach((item, index) => {
      const query = quoteQueries[index];
      if (query?.data?.quote) {
        map[item.symbol] = query.data.quote;
      }
    });
    return map;
  }, [watchlist, quoteQueries]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const quotes = Object.values(quoteMap);
    if (quotes.length === 0) return null;

    const gainers = quotes.filter((q) => q.change > 0).length;
    const losers = quotes.filter((q) => q.change < 0).length;
    const totalValue = quotes.reduce((sum, q) => sum + q.price, 0);
    const avgChange = quotes.reduce((sum, q) => sum + q.changePercent, 0) / quotes.length;

    const topGainer = quotes.reduce((prev, curr) =>
      curr.changePercent > (prev?.changePercent || -Infinity) ? curr : prev
    , quotes[0]);
    const topLoser = quotes.reduce((prev, curr) =>
      curr.changePercent < (prev?.changePercent || Infinity) ? curr : prev
    , quotes[0]);

    return { gainers, losers, totalValue, avgChange, topGainer, topLoser };
  }, [quoteMap]);

  // Filter and sort watchlist
  const filteredWatchlist = useMemo(() => {
    let items = [...watchlist];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.symbol.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query)
      );
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.symbol.localeCompare(b.symbol);
        case 'price':
          return (quoteMap[b.symbol]?.price || 0) - (quoteMap[a.symbol]?.price || 0);
        case 'change':
          return (quoteMap[b.symbol]?.changePercent || 0) - (quoteMap[a.symbol]?.changePercent || 0);
        default:
          return 0;
      }
    });

    return items;
  }, [watchlist, searchQuery, sortBy, quoteMap]);

  const handleAddStock = () => {
    if (newSymbol.trim()) {
      addToWatchlist({
        symbol: newSymbol.toUpperCase().trim(),
        name: newName.trim() || newSymbol.toUpperCase().trim(),
      });
      setNewSymbol('');
      setNewName('');
      setShowAddModal(false);
    }
  };

  const handleRefreshAll = () => {
    quoteQueries.forEach((query) => query.refetch());
  };

  const isLoading = quoteQueries.some((q) => q.isLoading);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Watchlist</h1>
          <p className="text-muted-foreground">
            Track your favorite stocks and set price alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stock
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && watchlist.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Stocks Tracked</p>
              <p className="text-2xl font-bold">{watchlist.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Avg. Change</p>
              <p className={cn(
                'text-2xl font-bold',
                summary.avgChange >= 0 ? 'text-green-500' : 'text-red-500'
              )}>
                {formatPercentage(summary.avgChange)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" /> Top Gainer
              </p>
              <p className="text-lg font-bold">{summary.topGainer?.symbol}</p>
              <p className="text-sm text-green-500">
                {formatPercentage(summary.topGainer?.changePercent || 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-500" /> Top Loser
              </p>
              <p className="text-lg font-bold">{summary.topLoser?.symbol}</p>
              <p className="text-sm text-red-500">
                {formatPercentage(summary.topLoser?.changePercent || 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search watchlist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortBy(sortBy === 'name' ? 'change' : sortBy === 'change' ? 'price' : 'name')}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Sort: {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
          </Button>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => updatePreferences({ defaultView: 'grid' })}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => updatePreferences({ defaultView: 'list' })}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Watchlist Grid/List */}
      {filteredWatchlist.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            {watchlist.length === 0 ? (
              <>
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No stocks in watchlist</h3>
                <p className="text-muted-foreground mb-4">
                  Add stocks to track their prices and set alerts
                </p>
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Stock
                </Button>
              </>
            ) : (
              <>
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  No stocks match your search query
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-3'
          )}
        >
          {filteredWatchlist.map((item, index) => (
            <WatchlistCard
              key={item.symbol}
              item={item}
              quote={quoteMap[item.symbol]}
              isLoading={quoteQueries[index]?.isLoading}
            />
          ))}
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-card rounded-lg border shadow-lg p-6 w-full max-w-md m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Add Stock to Watchlist</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Stock Symbol <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g., AAPL, MSFT, GOOGL"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Company Name (optional)
                </label>
                <Input
                  placeholder="e.g., Apple Inc."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddStock}
                disabled={!newSymbol.trim()}
              >
                Add Stock
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
