'use client';

import { useState } from 'react';
import {
  User,
  CreditCard,
  Bell,
  Database,
  Shield,
  Moon,
  Sun,
  Monitor,
  Check,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardStore } from '@/stores/dashboard-store';
import { cn } from '@/lib/utils';

type SettingsSection = 'account' | 'notifications' | 'subscription' | 'api' | 'security';

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function Toggle({ enabled, onToggle, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        enabled ? 'bg-primary' : 'bg-input'
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { settings, updateNotificationSettings, updatePreferences, updateApiSettings } = useDashboardStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>('account');
  const [isSaving, setIsSaving] = useState(false);

  // Mock user data
  const [userInfo, setUserInfo] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    company: 'Acme Corp',
  });

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'Account', icon: <User className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
    { id: 'subscription', label: 'Subscription', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'api', label: 'API & Data', icon: <Database className="h-4 w-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <nav className="lg:w-64 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
            {sections.map((section) => (
              <Button
                key={section.id}
                variant={activeSection === section.id ? 'secondary' : 'ghost'}
                className={cn(
                  'justify-start shrink-0',
                  activeSection === section.id && 'bg-secondary'
                )}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon}
                <span className="ml-2">{section.label}</span>
              </Button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <div className="flex-1 max-w-2xl">
          {/* Account Settings */}
          {activeSection === 'account' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>
                    Update your account details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Full Name</label>
                    <Input
                      value={userInfo.name}
                      onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Email</label>
                    <Input
                      type="email"
                      value={userInfo.email}
                      onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Company (optional)</label>
                    <Input
                      value={userInfo.company}
                      onChange={(e) => setUserInfo({ ...userInfo, company: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>
                    Customize how Finsyt looks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    {[
                      { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
                      { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
                      { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
                    ].map((option) => (
                      <Button
                        key={option.value}
                        variant={settings.preferences.theme === option.value ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => updatePreferences({ theme: option.value as 'light' | 'dark' | 'system' })}
                      >
                        {option.icon}
                        <span className="ml-2">{option.label}</span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Notification Settings */}
          {activeSection === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose what notifications you receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Price Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified when stocks hit your price targets
                    </p>
                  </div>
                  <Toggle
                    enabled={settings.notifications.priceAlerts}
                    onToggle={() => updateNotificationSettings({ priceAlerts: !settings.notifications.priceAlerts })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Daily Digest</p>
                    <p className="text-sm text-muted-foreground">
                      Receive a daily summary of your watchlist
                    </p>
                  </div>
                  <Toggle
                    enabled={settings.notifications.dailyDigest}
                    onToggle={() => updateNotificationSettings({ dailyDigest: !settings.notifications.dailyDigest })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Weekly Report</p>
                    <p className="text-sm text-muted-foreground">
                      Get a weekly market analysis report
                    </p>
                  </div>
                  <Toggle
                    enabled={settings.notifications.weeklyReport}
                    onToggle={() => updateNotificationSettings({ weeklyReport: !settings.notifications.weeklyReport })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Market News</p>
                    <p className="text-sm text-muted-foreground">
                      Breaking news about stocks you follow
                    </p>
                  </div>
                  <Toggle
                    enabled={settings.notifications.marketNews}
                    onToggle={() => updateNotificationSettings({ marketNews: !settings.notifications.marketNews })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subscription Settings */}
          {activeSection === 'subscription' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Current Plan</CardTitle>
                  <CardDescription>
                    You are on the Free plan
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 mb-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">Free Plan</p>
                      <p className="text-sm text-muted-foreground">
                        10 queries/month - Basic features
                      </p>
                    </div>
                    <Button>Upgrade</Button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">Plan includes:</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        10 research queries per month
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        5 stocks in watchlist
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        Basic market data
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <CardTitle>Upgrade to Pro</CardTitle>
                  </div>
                  <CardDescription>
                    Unlock unlimited access and premium features
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="font-semibold mb-2">Pro Monthly</p>
                      <p className="text-2xl font-bold">$29<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                      <Button className="w-full mt-4">Get Pro Monthly</Button>
                    </div>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 relative">
                      <span className="absolute -top-2 right-4 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        Save 20%
                      </span>
                      <p className="font-semibold mb-2">Pro Annual</p>
                      <p className="text-2xl font-bold">$279<span className="text-sm font-normal text-muted-foreground">/yr</span></p>
                      <Button className="w-full mt-4">Get Pro Annual</Button>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Unlimited research queries
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Unlimited watchlist stocks
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Real-time market data
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      SEC filings access
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Advanced analytics
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {/* API Settings */}
          {activeSection === 'api' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Data Preferences</CardTitle>
                  <CardDescription>
                    Configure data sources and refresh settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Real-time Data</p>
                      <p className="text-sm text-muted-foreground">
                        Enable live market data (Pro feature)
                      </p>
                    </div>
                    <Toggle
                      enabled={settings.api.enableRealTimeData}
                      onToggle={() => updateApiSettings({ enableRealTimeData: !settings.api.enableRealTimeData })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Data Provider</label>
                    <div className="flex gap-2">
                      {['alpha-vantage', 'polygon', 'yahoo'].map((provider) => (
                        <Button
                          key={provider}
                          variant={settings.api.dataProvider === provider ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateApiSettings({ dataProvider: provider as 'alpha-vantage' | 'polygon' | 'yahoo' })}
                        >
                          {provider.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Refresh Interval (seconds)
                    </label>
                    <Input
                      type="number"
                      min={10}
                      max={300}
                      value={settings.preferences.refreshInterval}
                      onChange={(e) => updatePreferences({ refreshInterval: parseInt(e.target.value) || 30 })}
                      className="max-w-[120px]"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      How often to refresh stock quotes (10-300 seconds)
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Currency</CardTitle>
                  <CardDescription>
                    Set your preferred currency for prices
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {['USD', 'EUR', 'GBP', 'JPY'].map((currency) => (
                      <Button
                        key={currency}
                        variant={settings.preferences.currency === currency ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updatePreferences({ currency })}
                      >
                        {currency}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Security Settings */}
          {activeSection === 'security' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Password</CardTitle>
                  <CardDescription>
                    Update your password
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Current Password</label>
                    <Input type="password" placeholder="Enter current password" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">New Password</label>
                    <Input type="password" placeholder="Enter new password" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Confirm New Password</label>
                    <Input type="password" placeholder="Confirm new password" />
                  </div>
                  <Button>Update Password</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Two-Factor Authentication</CardTitle>
                  <CardDescription>
                    Add an extra layer of security to your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">2FA is disabled</p>
                      <p className="text-sm text-muted-foreground">
                        Protect your account with two-factor authentication
                      </p>
                    </div>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sessions</CardTitle>
                  <CardDescription>
                    Manage your active sessions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">Current Session</p>
                        <p className="text-sm text-muted-foreground">
                          Chrome on macOS - Last active now
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-md bg-green-500/10 text-green-500 text-xs font-medium">
                        Active
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" className="mt-4 text-red-500 hover:text-red-500 hover:bg-red-500/10">
                    Sign out all other sessions
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-red-500/50">
                <CardHeader>
                  <CardTitle className="text-red-500">Danger Zone</CardTitle>
                  <CardDescription>
                    Irreversible actions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Delete Account</p>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all data
                      </p>
                    </div>
                    <Button variant="destructive">Delete Account</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
