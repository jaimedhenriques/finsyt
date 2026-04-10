'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  MoreVertical,
  Share2,
  Download,
  Copy,
  Trash2,
  Eye,
  Edit,
  Tag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDashboardStore, SavedReport } from '@/stores/dashboard-store';
import { formatDistanceToNow } from 'date-fns';

interface ReportCardProps {
  report: SavedReport;
  onView?: (report: SavedReport) => void;
  onEdit?: (report: SavedReport) => void;
}

export function ReportCard({ report, onView, onEdit }: ReportCardProps) {
  const router = useRouter();
  const { deleteReport } = useDashboardStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleView = () => {
    onView?.(report);
    setShowMenu(false);
  };

  const handleEdit = () => {
    onEdit?.(report);
    setShowMenu(false);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this report?')) {
      deleteReport(report.id);
    }
    setShowMenu(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.content);
      // Could add toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
    setShowMenu(false);
  };

  const handleExport = () => {
    const blob = new Blob([report.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/\s+/g, '-').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: report.title,
          text: report.content.substring(0, 200) + '...',
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      handleCopy();
    }
    setShowMenu(false);
  };

  const createdAt = new Date(report.createdAt);
  const updatedAt = new Date(report.updatedAt);
  const wasUpdated = updatedAt.getTime() !== createdAt.getTime();

  return (
    <Card className="group hover:shadow-md transition-shadow cursor-pointer" onClick={handleView}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base truncate">{report.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {wasUpdated ? 'Updated' : 'Created'}{' '}
                {formatDistanceToNow(wasUpdated ? updatedAt : createdAt, { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>

            {showMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-card shadow-lg z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleView}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleEdit}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <div className="border-t my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleCopy}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleExport}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleShare}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                  <div className="border-t my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-red-500 hover:text-red-500 hover:bg-red-500/10"
                    onClick={handleDelete}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {report.content.substring(0, 150)}...
        </p>
        <div className="flex flex-wrap gap-2">
          {report.symbols.slice(0, 3).map((symbol) => (
            <span
              key={symbol}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium"
            >
              {symbol}
            </span>
          ))}
          {report.symbols.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{report.symbols.length - 3} more
            </span>
          )}
          {report.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs"
            >
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
