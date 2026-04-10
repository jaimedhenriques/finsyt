'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Clock,
  RotateCcw,
  Trash2,
  ChevronRight,
  X,
  AlertTriangle,
  History,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardStore, QueryHistoryItem } from '@/stores/dashboard-store';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export default function HistoryPage() {
  const router = useRouter();
  const { queryHistory, deleteFromHistory, clearHistory, addReport } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<QueryHistoryItem | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Filter history
  const filteredHistory = useMemo(() => {
    if (!searchQuery) return queryHistory;

    const query = searchQuery.toLowerCase();
    return queryHistory.filter(
      (item) =>
        item.query.toLowerCase().includes(query) ||
        item.response.toLowerCase().includes(query) ||
        item.symbols?.some((s) => s.toLowerCase().includes(query))
    );
  }, [queryHistory, searchQuery]);

  const handleRerun = (query: string) => {
    router.push(`/dashboard?q=${encodeURIComponent(query)}`);
  };

  const handleDelete = (id: string) => {
    deleteFromHistory(id);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
  };

  const handleClearAll = () => {
    clearHistory();
    setSelectedItem(null);
    setShowClearConfirm(false);
  };

  const handleSaveAsReport = (item: QueryHistoryItem) => {
    addReport({
      title: item.query.length > 50 ? item.query.substring(0, 50) + '...' : item.query,
      query: item.query,
      content: item.response,
      symbols: item.symbols || [],
      tags: ['from-history'],
    });
    // Could add toast notification here
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* History List */}
      <div className="w-full lg:w-1/2 xl:w-2/5 border-r flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Query History</h1>
              <p className="text-muted-foreground">Your past research queries</p>
            </div>
            {queryHistory.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12">
              {queryHistory.length === 0 ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <History className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No query history</h3>
                  <p className="text-muted-foreground mb-4">
                    Your research queries will appear here
                  </p>
                  <Button onClick={() => router.push('/dashboard')}>
                    Start Researching
                  </Button>
                </>
              ) : (
                <>
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No results found</h3>
                  <p className="text-muted-foreground">
                    No queries match your search
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((item) => {
                const timestamp = new Date(item.timestamp);
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-accent group',
                      selectedItem?.id === item.id && 'border-primary bg-accent'
                    )}
                    onClick={() => setSelectedItem(item)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium line-clamp-2">{item.query}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatDistanceToNow(timestamp, { addSuffix: true })}</span>
                            {item.symbols && item.symbols.length > 0 && (
                              <>
                                <span>-</span>
                                <span>{item.symbols.join(', ')}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail View */}
      <div className="hidden lg:flex flex-1 flex-col">
        {selectedItem ? (
          <>
            <div className="p-6 border-b">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold">{selectedItem.query}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(selectedItem.timestamp).toLocaleString()}
                    {selectedItem.symbols && selectedItem.symbols.length > 0 && (
                      <span> - {selectedItem.symbols.join(', ')}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSaveAsReport(selectedItem)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Save as Report
                  </Button>
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
                    className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                    onClick={() => handleDelete(selectedItem.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Response</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    {selectedItem.response}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a query to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Detail View */}
      {selectedItem && (
        <div className="lg:hidden fixed inset-0 bg-background z-50 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedItem(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRerun(selectedItem.query)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500"
                onClick={() => handleDelete(selectedItem.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-lg font-semibold mb-2">{selectedItem.query}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {new Date(selectedItem.timestamp).toLocaleString()}
            </p>
            <Card>
              <CardContent className="p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                  {selectedItem.response}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-card rounded-lg border shadow-lg p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Clear All History</h3>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete all {queryHistory.length} queries from your history?
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleClearAll}
              >
                Clear All
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
