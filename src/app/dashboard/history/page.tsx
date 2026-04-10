'use client';

import { useState } from 'react';
import { Search, Clock, RotateCcw, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface HistoryItem {
  id: string;
  query: string;
  response: string;
  timestamp: Date;
  tokens: number;
}

const MOCK_HISTORY: HistoryItem[] = [
  {
    id: '1',
    query: "What's Apple's revenue growth over the last 5 years?",
    response: 'Apple has shown steady revenue growth from $274.5B in FY2020 to $383.3B in FY2024...',
    timestamp: new Date(Date.now() - 3600000),
    tokens: 850,
  },
  {
    id: '2',
    query: 'Compare Microsoft and Google cloud business',
    response: "Microsoft Azure and Google Cloud Platform have distinct strengths. Azure's revenue...",
    timestamp: new Date(Date.now() - 7200000),
    tokens: 1200,
  },
  {
    id: '3',
    query: "What are NVIDIA's key risks in 2024?",
    response: 'NVIDIA faces several key risks including semiconductor supply constraints, increasing competition...',
    timestamp: new Date(Date.now() - 86400000),
    tokens: 920,
  },
  {
    id: '4',
    query: 'Best dividend stocks in S&P 500',
    response: 'Top dividend stocks in the S&P 500 include: 1) Procter & Gamble (PG) - 2.4% yield...',
    timestamp: new Date(Date.now() - 172800000),
    tokens: 1100,
  },
  {
    id: '5',
    query: "Tesla's valuation compared to traditional automakers",
    response: "Tesla trades at a significant premium to traditional automakers. With a P/E ratio of...",
    timestamp: new Date(Date.now() - 259200000),
    tokens: 980,
  },
];

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>(MOCK_HISTORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

  const filteredHistory = history.filter((item) =>
    item.query.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const handleDelete = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
  };

  const handleRerun = (query: string) => {
    // Navigate to dashboard with query pre-filled
    window.location.href = `/dashboard?query=${encodeURIComponent(query)}`;
  };

  return (
    <div className="flex h-full">
      {/* History List */}
      <div className="w-full lg:w-1/2 xl:w-2/5 border-r p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Query History</h1>
          <p className="text-muted-foreground">Your recent research queries</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-2">
            {filteredHistory.map((item) => (
              <Card
                key={item.id}
                className={`cursor-pointer transition-colors hover:bg-accent ${
                  selectedItem?.id === item.id ? 'border-primary bg-accent' : ''
                }`}
                onClick={() => setSelectedItem(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.query}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatTimeAgo(item.timestamp)}</span>
                        <span>•</span>
                        <span>{item.tokens} tokens</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredHistory.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No queries found</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Detail View */}
      <div className="hidden lg:block flex-1 p-6">
        {selectedItem ? (
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">{selectedItem.query}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedItem.timestamp.toLocaleString()} • {selectedItem.tokens} tokens used
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRerun(selectedItem.query)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Re-run
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(selectedItem.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            <Card className="flex-1 overflow-hidden">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Response</h3>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p>{selectedItem.response}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Select a query to view details
          </div>
        )}
      </div>
    </div>
  );
}
