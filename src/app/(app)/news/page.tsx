'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Newspaper,
  Search,
  ExternalLink,
  Clock,
  TrendingUp,
  TrendingDown,
  Building2,
  Globe,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  symbols: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  category: 'market' | 'company' | 'economic' | 'sector';
  imageUrl?: string;
}

const MOCK_NEWS: NewsArticle[] = [
  {
    id: '1',
    title: 'Federal Reserve Signals Potential Rate Cuts in 2026',
    summary: 'Fed Chair indicates inflation is approaching target, opening door for monetary policy easing later this year.',
    source: 'Bloomberg',
    url: '#',
    publishedAt: new Date(Date.now() - 3600000).toISOString(),
    symbols: ['SPY', 'QQQ'],
    sentiment: 'positive',
    category: 'economic',
  },
  {
    id: '2',
    title: 'Apple Reports Record Q1 Services Revenue',
    summary: 'Apple Inc. beats analyst expectations with services segment growing 18% year-over-year, driven by App Store and subscriptions.',
    source: 'Reuters',
    url: '#',
    publishedAt: new Date(Date.now() - 7200000).toISOString(),
    symbols: ['AAPL'],
    sentiment: 'positive',
    category: 'company',
  },
  {
    id: '3',
    title: 'Tech Sector Faces Headwinds Amid AI Spending Concerns',
    summary: 'Investors question sustainability of massive AI infrastructure investments as monetization timelines extend.',
    source: 'Financial Times',
    url: '#',
    publishedAt: new Date(Date.now() - 10800000).toISOString(),
    symbols: ['NVDA', 'MSFT', 'GOOGL'],
    sentiment: 'negative',
    category: 'sector',
  },
  {
    id: '4',
    title: 'Oil Prices Surge on Middle East Supply Disruptions',
    summary: 'Crude oil jumps 3% as geopolitical tensions threaten key shipping routes, raising energy cost concerns.',
    source: 'CNBC',
    url: '#',
    publishedAt: new Date(Date.now() - 14400000).toISOString(),
    symbols: ['XOM', 'CVX', 'USO'],
    sentiment: 'neutral',
    category: 'market',
  },
  {
    id: '5',
    title: 'Tesla Announces New Battery Technology Breakthrough',
    summary: 'Electric vehicle maker unveils next-generation battery cells with 40% higher energy density and faster charging.',
    source: 'WSJ',
    url: '#',
    publishedAt: new Date(Date.now() - 18000000).toISOString(),
    symbols: ['TSLA'],
    sentiment: 'positive',
    category: 'company',
  },
  {
    id: '6',
    title: 'JPMorgan Raises S&P 500 Year-End Target',
    summary: 'Wall Street bank increases price target citing resilient consumer spending and corporate earnings growth.',
    source: 'MarketWatch',
    url: '#',
    publishedAt: new Date(Date.now() - 21600000).toISOString(),
    symbols: ['SPY', 'JPM'],
    sentiment: 'positive',
    category: 'market',
  },
];

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (!sentiment) return null;

  const config = {
    positive: { icon: TrendingUp, className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    negative: { icon: TrendingDown, className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
    neutral: { icon: null, className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  }[sentiment] || { icon: null, className: '' };

  const Icon = config.icon;

  return (
    <Badge variant="secondary" className={cn('gap-1', config.className)}>
      {Icon && <Icon className="w-3 h-3" />}
      {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
    </Badge>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const icons = {
    market: Globe,
    company: Building2,
    economic: TrendingUp,
    sector: Newspaper,
  };
  const Icon = icons[category as keyof typeof icons] || Newspaper;
  return <Icon className="w-4 h-4 text-muted-foreground" />;
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsArticle[]>(MOCK_NEWS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  const filteredNews = news.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.symbols.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleRefresh = async () => {
    setIsLoading(true);
    // In production, this would fetch from /api/news
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Newspaper className="w-6 h-6" />
            Financial News
          </h1>
          <p className="text-muted-foreground">
            Real-time news and market updates from trusted sources
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search news by keyword, ticker, or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="market">Market</TabsTrigger>
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="economic">Economic</TabsTrigger>
            <TabsTrigger value="sector">Sector</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* News Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Main News Feed */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Latest Headlines</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {filteredNews.map((article) => (
                  <article
                    key={article.id}
                    className="border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-start gap-3">
                      <CategoryIcon category={article.category} />
                      <div className="flex-1 min-w-0">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:text-primary transition-colors line-clamp-2 flex items-start gap-1"
                        >
                          {article.title}
                          <ExternalLink className="w-3 h-3 flex-shrink-0 mt-1" />
                        </a>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {article.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {article.source}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimeAgo(article.publishedAt)}
                          </span>
                          <SentimentBadge sentiment={article.sentiment} />
                          {article.symbols.map((symbol) => (
                            <Badge key={symbol} variant="outline" className="text-xs">
                              {symbol}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Trending Topics & Watchlist News */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Trending Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {['AI', 'Fed Rates', 'Earnings', 'Energy', 'China', 'Tech', 'Crypto', 'Banks'].map(
                  (topic) => (
                    <Button
                      key={topic}
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchQuery(topic)}
                    >
                      {topic}
                    </Button>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Market Sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Overall Sentiment</span>
                  <Badge className="bg-green-100 text-green-700">Bullish</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: '65%' }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Bearish (35%)</span>
                  <span>Bullish (65%)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Mentioned Tickers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { symbol: 'AAPL', mentions: 24, change: '+2.3%' },
                  { symbol: 'NVDA', mentions: 21, change: '-1.5%' },
                  { symbol: 'TSLA', mentions: 18, change: '+4.1%' },
                  { symbol: 'MSFT', mentions: 15, change: '+0.8%' },
                  { symbol: 'GOOGL', mentions: 12, change: '-0.3%' },
                ].map((item) => (
                  <div
                    key={item.symbol}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.mentions} mentions
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-medium',
                        item.change.startsWith('+')
                          ? 'text-green-600'
                          : 'text-red-600'
                      )}
                    >
                      {item.change}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
