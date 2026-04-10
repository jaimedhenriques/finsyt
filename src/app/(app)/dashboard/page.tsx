import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  TrendingUp,
  FileText,
  Plus,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  // Fetch user's recent activity
  const [recentChats, watchlists, usageThisMonth] = await Promise.all([
    db.chat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    db.watchlist.findMany({
      where: { userId },
      include: { _count: { select: { items: true } } },
    }),
    db.usageRecord.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(new Date().setDate(1)), // First of month
        },
      },
    }),
  ]);

  const firstName = session?.user?.name?.split(' ')[0] || 'there';

  return (
    <div className="flex-1 overflow-auto">
      <div className="container-responsive py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome back, {firstName}</h1>
          <p className="text-muted-foreground">
            Here's what's happening with your research today.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <QuickActionCard
            href="/research"
            icon={<MessageSquare className="w-5 h-5" />}
            title="New Research"
            description="Start a new AI research chat"
          />
          <QuickActionCard
            href="/market"
            icon={<TrendingUp className="w-5 h-5" />}
            title="Market Monitor"
            description="View real-time market data"
          />
          <QuickActionCard
            href="/filings"
            icon={<FileText className="w-5 h-5" />}
            title="SEC Filings"
            description="Search company filings"
          />
          <QuickActionCard
            href="/companies"
            icon={<Plus className="w-5 h-5" />}
            title="Add to Watchlist"
            description="Track companies you follow"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Chats */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Research</CardTitle>
                <CardDescription>Your latest research chats</CardDescription>
              </div>
              <Link href="/research">
                <Button variant="outline" size="sm">
                  View All <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentChats.length > 0 ? (
                <div className="space-y-3">
                  {recentChats.map((chat) => (
                    <Link
                      key={chat.id}
                      href={`/research/${chat.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition"
                    >
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">
                            {chat.title || 'Untitled Chat'}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(chat.updatedAt, 'relative')}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No research chats yet</p>
                  <Link href="/research">
                    <Button variant="link" size="sm">
                      Start your first research
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sidebar Stats */}
          <div className="space-y-6">
            {/* Watchlists */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Watchlists</CardTitle>
              </CardHeader>
              <CardContent>
                {watchlists.length > 0 ? (
                  <div className="space-y-2">
                    {watchlists.map((list) => (
                      <Link
                        key={list.id}
                        href={`/watchlist/${list.id}`}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted transition"
                      >
                        <span className="text-sm font-medium">{list.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {list._count.items} stocks
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No watchlists yet
                  </p>
                )}
                <Link href="/watchlist/new">
                  <Button variant="outline" size="sm" className="w-full mt-3">
                    <Plus className="mr-2 w-4 h-4" />
                    Create Watchlist
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usage This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{usageThisMonth}</div>
                <p className="text-sm text-muted-foreground">
                  queries & requests
                </p>
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-medium">Free Tier</span>
                  </div>
                  <Link href="/settings/billing">
                    <Button variant="link" size="sm" className="p-0 h-auto mt-2">
                      Upgrade for more
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition cursor-pointer h-full">
        <CardContent className="pt-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
            {icon}
          </div>
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
