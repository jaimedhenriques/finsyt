'use client';

import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewsArticle } from '@/types';
import { cn } from '@/lib/utils';

interface NewsFeedProps {
  articles: NewsArticle[];
  title?: string;
}

export function NewsFeed({ articles, title = 'Market News' }: NewsFeedProps) {
  const getSentimentIcon = (sentiment?: NewsArticle['sentiment']) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'negative':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {articles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No news articles available
          </p>
        ) : (
          articles.map((article) => (
            <article
              key={article.id}
              className="group border-b pb-4 last:border-0 last:pb-0"
            >
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:bg-accent/50 -mx-2 px-2 py-1 rounded transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {getSentimentIcon(article.sentiment)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {article.summary}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">
                        {article.source}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(article.publishedAt)}
                      </span>
                      {article.symbols && article.symbols.length > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <div className="flex gap-1">
                            {article.symbols.map((symbol) => (
                              <span
                                key={symbol}
                                className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded"
                              >
                                {symbol}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </a>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}
