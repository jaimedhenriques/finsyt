'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Search,
  LineChart,
  Bell,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StockQuote } from '@/types';
import { formatCurrency, formatPercentage, formatCompactNumber, cn } from '@/lib/utils';
import { useDashboardStore, WatchlistItem } from '@/stores/dashboard-store';

interface WatchlistCardProps {
  item: WatchlistItem;
  quote?: StockQuote;
  isLoading?: boolean;
}

export function WatchlistCard({ item, quote, isLoading }: WatchlistCardProps) {
  const router = useRouter();
  const { removeFromWatchlist, updateWatchlistAlert } = useDashboardStore();
  const [showMenu, setShowMenu] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertPrice, setAlertPrice] = useState(item.alertPrice?.toString() || '');
  const [alertType, setAlertType] = useState<'above' | 'below'>(item.alertType || 'above');

  const isPositive = quote ? quote.change >= 0 : true;
  const hasAlert = item.alertPrice !== undefined;

  const handleResearch = () => {
    router.push(`/dashboard?q=${encodeURIComponent(`Analyze ${item.symbol}`)}`);
    setShowMenu(false);
  };

  const handleViewChart = () => {
    // Could open a modal or navigate to chart view
    window.open(`https://finance.yahoo.com/quote/${item.symbol}`, '_blank');
    setShowMenu(false);
  };

  const handleRemove = () => {
    removeFromWatchlist(item.symbol);
    setShowMenu(false);
  };

  const handleSetAlert = () => {
    setShowAlertModal(true);
    setShowMenu(false);
  };

  const handleSaveAlert = () => {
    const price = parseFloat(alertPrice);
    if (!isNaN(price) && price > 0) {
      updateWatchlistAlert(item.symbol, price, alertType);
    } else {
      updateWatchlistAlert(item.symbol, undefined, undefined);
    }
    setShowAlertModal(false);
  };

  const handleClearAlert = () => {
    updateWatchlistAlert(item.symbol, undefined, undefined);
    setAlertPrice('');
    setShowAlertModal(false);
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-6 w-16 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded mt-2" />
            </div>
            <div className="h-6 w-16 bg-muted rounded" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <div>
              <div className="h-8 w-20 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded mt-2" />
            </div>
            <div className="h-4 w-24 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="relative group">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">{item.symbol}</h3>
                {hasAlert && (
                  <Bell className="h-3 w-3 text-primary" />
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate max-w-[150px]">
                {item.name}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {quote && (
                <div
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium',
                    isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                  )}
                >
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {formatPercentage(quote.changePercent)}
                </div>
              )}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setShowMenu(!showMenu)}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>

                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-card shadow-lg z-50">
                    <div className="p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={handleResearch}
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Research
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={handleViewChart}
                      >
                        <LineChart className="mr-2 h-4 w-4" />
                        View Chart
                        <ExternalLink className="ml-auto h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={handleSetAlert}
                      >
                        <Bell className="mr-2 h-4 w-4" />
                        {hasAlert ? 'Edit Alert' : 'Set Alert'}
                      </Button>
                      <div className="border-t my-1" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-red-500 hover:text-red-500 hover:bg-red-500/10"
                        onClick={handleRemove}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold">
                {quote ? formatCurrency(quote.price) : '--'}
              </p>
              {quote && (
                <p
                  className={cn(
                    'text-sm',
                    isPositive ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {isPositive ? '+' : ''}
                  {formatCurrency(quote.change)}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              {quote && (
                <>
                  <p>Vol: {formatCompactNumber(quote.volume)}</p>
                  {quote.marketCap > 0 && (
                    <p>Cap: {formatCompactNumber(quote.marketCap)}</p>
                  )}
                </>
              )}
            </div>
          </div>
          {hasAlert && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Alert when price goes {item.alertType}{' '}
                <span className="font-medium text-foreground">
                  {formatCurrency(item.alertPrice!)}
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert Modal */}
      {showAlertModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAlertModal(false)}
        >
          <div
            className="bg-card rounded-lg border shadow-lg p-6 w-full max-w-sm m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">
              Set Price Alert for {item.symbol}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Alert Type</label>
                <div className="flex gap-2">
                  <Button
                    variant={alertType === 'above' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setAlertType('above')}
                  >
                    Above
                  </Button>
                  <Button
                    variant={alertType === 'below' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setAlertType('below')}
                  >
                    Below
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Target Price</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter price"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                />
                {quote && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Current price: {formatCurrency(quote.price)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              {hasAlert && (
                <Button variant="outline" onClick={handleClearAlert}>
                  Clear Alert
                </Button>
              )}
              <Button
                variant="outline"
                className="ml-auto"
                onClick={() => setShowAlertModal(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveAlert}>
                Save Alert
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
