'use client';

import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  FileText,
  Filter,
  SortAsc,
  X,
  Download,
  Copy,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ReportCard } from '@/components/dashboard/report-card';
import { useDashboardStore, SavedReport } from '@/stores/dashboard-store';
import { formatDistanceToNow } from 'date-fns';

export default function ReportsPage() {
  const { reports, addReport, updateReport } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [viewingReport, setViewingReport] = useState<SavedReport | null>(null);
  const [editingReport, setEditingReport] = useState<SavedReport | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New report form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newSymbols, setNewSymbols] = useState('');
  const [newTags, setNewTags] = useState('');

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    reports.forEach((report) => {
      report.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [reports]);

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    let items = [...reports];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (report) =>
          report.title.toLowerCase().includes(query) ||
          report.content.toLowerCase().includes(query) ||
          report.symbols.some((s) => s.toLowerCase().includes(query))
      );
    }

    // Filter by tag
    if (selectedTag) {
      items = items.filter((report) => report.tags.includes(selectedTag));
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return items;
  }, [reports, searchQuery, selectedTag, sortBy]);

  const handleCreateReport = () => {
    if (newTitle.trim() && newContent.trim()) {
      addReport({
        title: newTitle.trim(),
        query: '',
        content: newContent.trim(),
        symbols: newSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        tags: newTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      });
      resetForm();
      setShowCreateModal(false);
    }
  };

  const handleUpdateReport = () => {
    if (editingReport && newTitle.trim() && newContent.trim()) {
      updateReport(editingReport.id, {
        title: newTitle.trim(),
        content: newContent.trim(),
        symbols: newSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        tags: newTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      });
      resetForm();
      setEditingReport(null);
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewContent('');
    setNewSymbols('');
    setNewTags('');
  };

  const openEditModal = (report: SavedReport) => {
    setNewTitle(report.title);
    setNewContent(report.content);
    setNewSymbols(report.symbols.join(', '));
    setNewTags(report.tags.join(', '));
    setEditingReport(report);
  };

  const handleExportAll = () => {
    const content = reports
      .map(
        (r) =>
          `# ${r.title}\n\nSymbols: ${r.symbols.join(', ')}\nTags: ${r.tags.join(', ')}\nCreated: ${new Date(r.createdAt).toLocaleDateString()}\n\n${r.content}\n\n---\n`
      )
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finsyt-reports-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Saved Reports</h1>
          <p className="text-muted-foreground">
            View and manage your research reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportAll}>
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
          )}
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortBy(sortBy === 'date' ? 'title' : 'date')}
          >
            <SortAsc className="h-4 w-4 mr-2" />
            Sort: {sortBy === 'date' ? 'Date' : 'Title'}
          </Button>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {allTags.slice(0, 5).map((tag) => (
                <Button
                  key={tag}
                  variant={selectedTag === tag ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >
                  {tag}
                </Button>
              ))}
              {selectedTag && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedTag(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            {reports.length === 0 ? (
              <>
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No saved reports</h3>
                <p className="text-muted-foreground mb-4">
                  Save your research findings for future reference
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Report
                </Button>
              </>
            ) : (
              <>
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  No reports match your search criteria
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onView={(r) => setViewingReport(r)}
              onEdit={openEditModal}
            />
          ))}
        </div>
      )}

      {/* View Report Modal */}
      {viewingReport && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingReport(null)}
        >
          <div
            className="bg-card rounded-lg border shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{viewingReport.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Created {formatDistanceToNow(new Date(viewingReport.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setViewingReport(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {viewingReport.symbols.map((symbol) => (
                  <span
                    key={symbol}
                    className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium"
                  >
                    {symbol}
                  </span>
                ))}
                {viewingReport.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                {viewingReport.content}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(viewingReport.content);
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button onClick={() => {
                openEditModal(viewingReport);
                setViewingReport(null);
              }}>
                Edit Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Report Modal */}
      {(showCreateModal || editingReport) && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowCreateModal(false);
            setEditingReport(null);
            resetForm();
          }}
        >
          <div
            className="bg-card rounded-lg border shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingReport ? 'Edit Report' : 'Create New Report'}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingReport(null);
                    resetForm();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Report title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Symbols (comma-separated)
                </label>
                <Input
                  placeholder="AAPL, MSFT, GOOGL"
                  value={newSymbols}
                  onChange={(e) => setNewSymbols(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Tags (comma-separated)
                </label>
                <Input
                  placeholder="earnings, analysis, tech"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[200px] resize-y"
                  placeholder="Write your report content..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingReport(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={editingReport ? handleUpdateReport : handleCreateReport}
                disabled={!newTitle.trim() || !newContent.trim()}
              >
                {editingReport ? 'Save Changes' : 'Create Report'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
