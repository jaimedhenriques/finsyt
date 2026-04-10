'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Eye,
  FileText,
  History,
  Settings,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/stores/dashboard-store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Research',
    icon: <Search className="h-4 w-4" />,
  },
  {
    href: '/dashboard/watchlist',
    label: 'Watchlist',
    icon: <Eye className="h-4 w-4" />,
  },
  {
    href: '/dashboard/reports',
    label: 'Reports',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    href: '/dashboard/history',
    label: 'History',
    icon: <History className="h-4 w-4" />,
  },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: <Settings className="h-4 w-4" />,
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useDashboardStore();

  return (
    <aside
      className={cn(
        'relative border-r bg-card/50 transition-all duration-300 flex flex-col',
        sidebarOpen ? 'w-64' : 'w-16',
        className
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-2 p-4 border-b',
        !sidebarOpen && 'justify-center'
      )}>
        <TrendingUp className="h-6 w-6 text-primary shrink-0" />
        {sidebarOpen && (
          <span className="text-lg font-bold">Finsyt</span>
        )}
      </div>

      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-16 z-10 h-6 w-6 rounded-full border bg-background shadow-sm"
        onClick={toggleSidebar}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full',
                  sidebarOpen ? 'justify-start' : 'justify-center px-0'
                )}
                title={!sidebarOpen ? item.label : undefined}
              >
                {item.icon}
                {sidebarOpen && <span className="ml-2">{item.label}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* Pro Card */}
      {sidebarOpen && (
        <div className="p-4">
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Pro Features</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Unlock unlimited queries, SEC filings, and advanced analytics.
            </p>
            <Button size="sm" className="w-full">
              Upgrade Now
            </Button>
          </div>
        </div>
      )}

      {/* Collapsed Pro Icon */}
      {!sidebarOpen && (
        <div className="p-2 mb-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            title="Upgrade to Pro"
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </Button>
        </div>
      )}
    </aside>
  );
}
