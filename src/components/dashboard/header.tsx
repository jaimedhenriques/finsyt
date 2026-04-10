'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  User,
  Menu,
  LogOut,
  Settings,
  Moon,
  Sun,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/stores/dashboard-store';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export function Header({ title, subtitle, className }: HeaderProps) {
  const router = useRouter();
  const { toggleSidebar } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  // Mock notifications
  const notifications = [
    { id: 1, title: 'AAPL hit your price target', time: '5 min ago', unread: true },
    { id: 2, title: 'Weekly market summary ready', time: '1 hour ago', unread: true },
    { id: 3, title: 'New SEC filing for TSLA', time: '2 hours ago', unread: false },
  ];

  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <header className={cn('border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Title */}
          {title && (
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold">{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          )}
        </div>

        {/* Center - Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search stocks, queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
        </form>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Help */}
          <Button variant="ghost" size="icon" title="Help">
            <HelpCircle className="h-5 w-5" />
          </Button>

          {/* Notifications */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-card shadow-lg z-50">
                <div className="p-3 border-b">
                  <h3 className="font-semibold">Notifications</h3>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        'p-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0',
                        notification.unread && 'bg-primary/5'
                      )}
                    >
                      <p className="text-sm font-medium">{notification.title}</p>
                      <p className="text-xs text-muted-foreground">{notification.time}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t">
                  <Button variant="ghost" size="sm" className="w-full">
                    View all notifications
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowNotifications(false);
              }}
              title="User menu"
            >
              <User className="h-5 w-5" />
            </Button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border bg-card shadow-lg z-50">
                <div className="p-3 border-b">
                  <p className="font-semibold">John Doe</p>
                  <p className="text-sm text-muted-foreground">john@example.com</p>
                </div>
                <div className="p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => router.push('/dashboard/settings')}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <Sun className="mr-2 h-4 w-4 dark:hidden" />
                    <Moon className="mr-2 h-4 w-4 hidden dark:block" />
                    Toggle theme
                  </Button>
                  <div className="border-t my-2" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-red-500 hover:text-red-500 hover:bg-red-500/10"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
