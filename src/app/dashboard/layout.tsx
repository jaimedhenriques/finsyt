'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { useDashboardStore } from '@/stores/dashboard-store';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen, setSidebarOpen } = useDashboardStore();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setSidebarOpen]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuOpen && isMobile) {
        const target = e.target as HTMLElement;
        if (!target.closest('aside') && !target.closest('[data-sidebar-toggle]')) {
          setMobileMenuOpen(false);
        }
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [mobileMenuOpen, isMobile]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Overlay */}
      {isMobile && mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <div className="hidden lg:block">
        <Sidebar className="fixed left-0 top-0 h-screen z-30" />
      </div>

      {/* Sidebar - Mobile */}
      <div
        className={cn(
          'lg:hidden fixed left-0 top-0 h-screen z-50 transition-transform duration-300',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar className="h-full w-64" />
      </div>

      {/* Main Content */}
      <main
        className={cn(
          'flex-1 flex flex-col min-h-screen transition-all duration-300',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'
        )}
      >
        <Header
          className="sticky top-0 z-20"
        />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>

      {/* Mobile Menu Toggle - Custom handler */}
      <style jsx global>{`
        @media (max-width: 1023px) {
          [data-sidebar-toggle] {
            display: block;
          }
        }
      `}</style>
    </div>
  );
}
