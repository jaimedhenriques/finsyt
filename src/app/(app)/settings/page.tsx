import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Key,
  CreditCard,
  Bell,
  Shield,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const [user, apiKeys, usageThisMonth] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.apiKey.findMany({
      where: { userId },
      select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
    }),
    db.usageRecord.count({
      where: {
        userId,
        createdAt: { gte: new Date(new Date().setDate(1)) },
      },
    }),
  ]);

  const tierLimits = {
    FREE: { chats: 50, api: 100 },
    PRO: { chats: 500, api: 5000 },
    ENTERPRISE: { chats: -1, api: -1 }, // Unlimited
  };

  const currentTier = user?.tier || 'FREE';
  const limits = tierLimits[currentTier];

  return (
    <div className="flex-1 overflow-auto">
      <div className="container-responsive py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        {/* Profile */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Name
                </label>
                <p className="font-medium">{user?.name || 'Not set'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Email
                </label>
                <p className="font-medium">{user?.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Member Since
                </label>
                <p className="font-medium">
                  {user?.createdAt.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Role
                </label>
                <p className="font-medium capitalize">
                  {user?.role.toLowerCase()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Subscription
            </CardTitle>
            <CardDescription>Manage your plan and billing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-lg">{currentTier} Plan</span>
                  <Badge variant={currentTier === 'FREE' ? 'secondary' : 'default'}>
                    {currentTier === 'FREE' ? 'Current' : 'Active'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {limits.chats === -1
                    ? 'Unlimited'
                    : `${limits.chats} research chats`}
                  {' / '}
                  {limits.api === -1 ? 'Unlimited' : `${limits.api} API calls`} per
                  month
                </p>
              </div>
              {currentTier === 'FREE' && (
                <Button>
                  Upgrade to Pro
                  <ExternalLink className="ml-2 w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Usage this month</span>
                <span className="font-medium">
                  {usageThisMonth} /{' '}
                  {limits.chats === -1 ? 'Unlimited' : limits.chats + limits.api}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width:
                      limits.chats === -1
                        ? '5%'
                        : `${Math.min((usageThisMonth / (limits.chats + limits.api)) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  API Keys
                </CardTitle>
                <CardDescription>
                  Manage API keys for programmatic access
                </CardDescription>
              </div>
              <Button size="sm">Create Key</Button>
            </div>
          </CardHeader>
          <CardContent>
            {apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{key.name}</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {key.keyPrefix}...
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>
                        Created:{' '}
                        {key.createdAt.toLocaleDateString()}
                      </p>
                      {key.lastUsedAt && (
                        <p>
                          Last used:{' '}
                          {key.lastUsedAt.toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No API keys yet. Create one to access the Finsyt API.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Integrations
            </CardTitle>
            <CardDescription>
              Connect Finsyt to other tools and platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <span className="font-bold text-sm">MCP</span>
                  </div>
                  <div>
                    <p className="font-medium">MCP Server</p>
                    <p className="text-sm text-muted-foreground">
                      Connect to Claude Desktop via Model Context Protocol
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/docs/mcp">Setup Guide</Link>
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <span className="font-bold text-green-700 text-sm">XL</span>
                  </div>
                  <div>
                    <p className="font-medium">Excel Plugin</p>
                    <p className="text-sm text-muted-foreground">
                      Access financial data directly in Excel
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              Configure how you receive alerts and updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  label: 'Agent Alerts',
                  description: 'Receive notifications when agents complete tasks',
                  enabled: true,
                },
                {
                  label: 'Filing Notifications',
                  description: 'Get notified about new SEC filings for watchlist',
                  enabled: true,
                },
                {
                  label: 'Product Updates',
                  description: 'Stay informed about new features and improvements',
                  enabled: false,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Button variant={item.enabled ? 'default' : 'outline'} size="sm">
                    {item.enabled ? 'Enabled' : 'Enable'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
