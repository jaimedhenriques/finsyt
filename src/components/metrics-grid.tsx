'use client';

import { Card, CardContent } from '@/components/ui/card';
import { FinancialMetrics } from '@/types';
import { formatCurrency, formatPercentage, formatCompactNumber, cn } from '@/lib/utils';

interface MetricsGridProps {
  metrics: FinancialMetrics;
}

interface MetricItem {
  label: string;
  value: string | number;
  description?: string;
  trend?: 'positive' | 'negative' | 'neutral';
}

export function MetricsGrid({ metrics }: MetricsGridProps) {
  const metricItems: MetricItem[] = [
    {
      label: 'P/E Ratio',
      value: metrics.peRatio.toFixed(2),
      description: 'Price to Earnings',
    },
    {
      label: 'PEG Ratio',
      value: metrics.pegRatio.toFixed(2),
      description: 'P/E to Growth',
    },
    {
      label: 'EPS',
      value: formatCurrency(metrics.eps),
      description: 'Earnings Per Share',
    },
    {
      label: 'Revenue',
      value: formatCompactNumber(metrics.revenue),
      description: 'TTM Revenue',
    },
    {
      label: 'Revenue Growth',
      value: formatPercentage(metrics.revenueGrowth),
      description: 'YoY Growth',
      trend: metrics.revenueGrowth > 0 ? 'positive' : metrics.revenueGrowth < 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Gross Margin',
      value: `${(metrics.grossMargin * 100).toFixed(1)}%`,
      description: 'Gross Profit Margin',
    },
    {
      label: 'Operating Margin',
      value: `${(metrics.operatingMargin * 100).toFixed(1)}%`,
      description: 'EBIT Margin',
    },
    {
      label: 'Net Margin',
      value: `${(metrics.netMargin * 100).toFixed(1)}%`,
      description: 'Net Profit Margin',
    },
    {
      label: 'ROE',
      value: `${(metrics.roe * 100).toFixed(1)}%`,
      description: 'Return on Equity',
      trend: metrics.roe > 0.15 ? 'positive' : metrics.roe < 0.05 ? 'negative' : 'neutral',
    },
    {
      label: 'ROA',
      value: `${(metrics.roa * 100).toFixed(1)}%`,
      description: 'Return on Assets',
    },
    {
      label: 'Debt/Equity',
      value: metrics.debtToEquity.toFixed(2),
      description: 'Leverage Ratio',
      trend: metrics.debtToEquity < 1 ? 'positive' : metrics.debtToEquity > 2 ? 'negative' : 'neutral',
    },
    {
      label: 'Current Ratio',
      value: metrics.currentRatio.toFixed(2),
      description: 'Liquidity',
      trend: metrics.currentRatio > 1.5 ? 'positive' : metrics.currentRatio < 1 ? 'negative' : 'neutral',
    },
    {
      label: 'Dividend Yield',
      value: `${(metrics.dividendYield * 100).toFixed(2)}%`,
      description: 'Annual Dividend',
    },
    {
      label: 'Payout Ratio',
      value: `${(metrics.payoutRatio * 100).toFixed(1)}%`,
      description: 'Dividend/Earnings',
    },
    {
      label: 'Free Cash Flow',
      value: formatCompactNumber(metrics.freeCashFlow),
      description: 'TTM FCF',
      trend: metrics.freeCashFlow > 0 ? 'positive' : 'negative',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {metricItems.map((item) => (
        <Card key={item.label} className="overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p
              className={cn(
                'text-lg font-semibold mt-1',
                item.trend === 'positive' && 'text-green-500',
                item.trend === 'negative' && 'text-red-500'
              )}
            >
              {item.value}
            </p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {item.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
