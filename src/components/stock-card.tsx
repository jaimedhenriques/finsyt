'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StockQuote } from '@/types';
import { formatCurrency, formatPercentage, formatCompactNumber, cn } from '@/lib/utils';

interface StockCardProps {
  quote: StockQuote;
  onClick?: () => void;
}

export function StockCard({ quote, onClick }: StockCardProps) {
  const isPositive = quote.change >= 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        onClick && 'hover:border-primary/50'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{quote.symbol}</CardTitle>
            <p className="text-sm text-muted-foreground truncate max-w-[150px]">
              {quote.name}
            </p>
          </div>
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium',
            isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          )}>
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {formatPercentage(quote.changePercent)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold">{formatCurrency(quote.price)}</p>
            <p className={cn(
              'text-sm',
              isPositive ? 'text-green-500' : 'text-red-500'
            )}>
              {isPositive ? '+' : ''}{formatCurrency(quote.change)}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Vol: {formatCompactNumber(quote.volume)}</p>
            {quote.marketCap > 0 && (
              <p>Cap: {formatCompactNumber(quote.marketCap)}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
