'use client';

import { useState } from 'react';
import { Plus, Search, FileText, Share2, Download, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Report {
  id: string;
  title: string;
  content: string;
  symbols: string[];
  type: 'analysis' | 'comparison' | 'research';
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MOCK_REPORTS: Report[] = [
  {
    id: '1',
    title: 'Apple Q4 2024 Earnings Analysis',
    content: 'Comprehensive analysis of Apple\'s Q4 2024 earnings results...',
    symbols: ['AAPL'],
    type: 'analysis',
    isPublic: false,
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 86400000),
  },
  {
    id: '2',
    title: 'Cloud Computing Market Comparison',
    content: 'Detailed comparison of AWS, Azure, and Google Cloud performance...',
    symbols: ['AMZN', 'MSFT', 'GOOGL'],
    type: 'comparison',
    isPublic: true,
    createdAt: new Date(Date.now() - 259200000),
    updatedAt: new Date(Date.now() - 172800000),
  },
  {
    id: '3',
    title: 'AI Semiconductor Industry Deep Dive',
    content: 'Research report on the AI semiconductor industry including NVIDIA, AMD...',
    symbols: ['NVDA', 'AMD', 'INTC'],
    type: 'research',
    isPublic: false,
    createdAt: new Date(Date.now() - 604800000),
    updatedAt: new Date(Date.now() - 432000000),
  },
  {
    id: '4',
    title: 'Tesla Valuation Analysis 2024',
    content: 'Analyzing Tesla\'s current valuation metrics and growth prospects...',
    symbols: ['TSLA'],
    type: 'analysis',
    isPublic: false,
    createdAt: new Date(Date.now() - 1209600000),
    updatedAt: new Date(Date.now() - 1209600000),
  },
];

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>(MOCK_REPORTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'analysis' | 'comparison' | 'research'>('all');

  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.symbols.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = filter === 'all' || report.type === filter;
    return matchesSearch && matchesFilter;
  });

  const handleDelete = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const getTypeColor = (type: Report['type']) => {
    switch (type) {
      case 'analysis':
        return 'bg-blue-500/10 text-blue-500';
      case 'comparison':
        return 'bg-purple-500/10 text-purple-500';
      case 'research':
        return 'bg-green-500/10 text-green-500';
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Saved Reports</h1>
          <p className="text-muted-foreground">Your saved research and analysis</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Report
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'analysis', 'comparison', 'research'] as const).map((type) => (
            <Button
              key={type}
              variant={filter === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(type)}
              className="capitalize"
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredReports.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow group">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="outline" className={getTypeColor(report.type)}>
                    {report.type}
                  </Badge>
                </div>
                {report.isPublic && (
                  <Badge variant="secondary">Public</Badge>
                )}
              </div>
              <CardTitle className="text-lg mt-2 line-clamp-2">
                {report.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                {report.content}
              </p>

              <div className="flex flex-wrap gap-1 mb-4">
                {report.symbols.map((symbol) => (
                  <Badge key={symbol} variant="outline" className="text-xs">
                    {symbol}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(report.updatedAt)}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(report.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredReports.length === 0 && (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No reports found</p>
          <Button className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Report
          </Button>
        </div>
      )}
    </div>
  );
}
