'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  Plus,
  Play,
  Pause,
  Trash2,
  Settings,
  TrendingUp,
  FileText,
  Bell,
  Newspaper,
  Clock,
  CheckCircle,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  description: string;
  type: 'EARNINGS_MONITOR' | 'NEWS_DIGEST' | 'FILING_ALERT' | 'PRICE_ALERT' | 'CUSTOM_RESEARCH';
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR';
  schedule?: string;
  lastRunAt?: Date;
  config: Record<string, unknown>;
}

const AGENT_TYPES = [
  {
    type: 'EARNINGS_MONITOR',
    name: 'Earnings Monitor',
    description: 'Track earnings releases and surprises for your watchlist',
    icon: <TrendingUp className="w-5 h-5" />,
  },
  {
    type: 'NEWS_DIGEST',
    name: 'News Digest',
    description: 'Get daily summaries of relevant news for selected companies',
    icon: <Newspaper className="w-5 h-5" />,
  },
  {
    type: 'FILING_ALERT',
    name: 'Filing Alert',
    description: 'Get notified when new SEC filings are published',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    type: 'PRICE_ALERT',
    name: 'Price Alert',
    description: 'Monitor price movements and set custom alerts',
    icon: <Bell className="w-5 h-5" />,
  },
  {
    type: 'CUSTOM_RESEARCH',
    name: 'Custom Research',
    description: 'Run custom research queries on a schedule',
    icon: <Bot className="w-5 h-5" />,
  },
];

// Mock data
const MOCK_AGENTS: Agent[] = [
  {
    id: '1',
    name: 'FAANG Earnings Tracker',
    description: 'Monitors earnings for AAPL, GOOGL, META, AMZN, NFLX',
    type: 'EARNINGS_MONITOR',
    status: 'RUNNING',
    schedule: '0 9 * * *',
    lastRunAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    config: { symbols: ['AAPL', 'GOOGL', 'META', 'AMZN', 'NFLX'] },
  },
  {
    id: '2',
    name: 'Tech News Daily',
    description: 'Daily digest of technology sector news',
    type: 'NEWS_DIGEST',
    status: 'IDLE',
    schedule: '0 8 * * 1-5',
    lastRunAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    config: { sectors: ['Technology'], limit: 20 },
  },
  {
    id: '3',
    name: '10-K Alert',
    description: 'Alerts for annual report filings',
    type: 'FILING_ALERT',
    status: 'PAUSED',
    schedule: '0 */4 * * *',
    config: { formTypes: ['10-K', '10-K/A'] },
  },
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const getStatusBadge = (status: Agent['status']) => {
    switch (status) {
      case 'RUNNING':
        return (
          <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Running
          </Badge>
        );
      case 'IDLE':
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Idle
          </Badge>
        );
      case 'PAUSED':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Pause className="w-3 h-3" />
            Paused
          </Badge>
        );
      case 'ERROR':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Error
          </Badge>
        );
    }
  };

  const getAgentIcon = (type: Agent['type']) => {
    const agentType = AGENT_TYPES.find((t) => t.type === type);
    return agentType?.icon || <Bot className="w-5 h-5" />;
  };

  const toggleAgent = (id: string) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === id
          ? {
              ...agent,
              status: agent.status === 'RUNNING' ? 'PAUSED' : 'RUNNING',
            }
          : agent
      )
    );
  };

  const deleteAgent = (id: string) => {
    setAgents((prev) => prev.filter((agent) => agent.id !== id));
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="container-responsive py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">AI Agents</h1>
            <p className="text-muted-foreground">
              Automate research tasks and get intelligent alerts
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Agent</DialogTitle>
                <DialogDescription>
                  Choose an agent type to automate your research
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                {AGENT_TYPES.map((agentType) => (
                  <button
                    key={agentType.type}
                    onClick={() => setSelectedType(agentType.type)}
                    className={cn(
                      'w-full flex items-start gap-3 p-4 rounded-lg border text-left transition',
                      selectedType === agentType.type
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                      {agentType.icon}
                    </div>
                    <div>
                      <p className="font-medium">{agentType.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {agentType.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button disabled={!selectedType}>Configure Agent</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Agent Stats */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {agents.filter((a) => a.status === 'RUNNING').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active Agents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">127</p>
                  <p className="text-sm text-muted-foreground">
                    Runs This Month
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">23</p>
                  <p className="text-sm text-muted-foreground">
                    Alerts Generated
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agents List */}
        <div className="space-y-4">
          {agents.length > 0 ? (
            agents.map((agent) => (
              <Card key={agent.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        {getAgentIcon(agent.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{agent.name}</h3>
                          {getStatusBadge(agent.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {agent.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {agent.schedule
                              ? `Scheduled: ${agent.schedule}`
                              : 'Manual'}
                          </span>
                          {agent.lastRunAt && (
                            <span>
                              Last run: {formatDate(agent.lastRunAt, 'relative')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAgent(agent.id)}
                      >
                        {agent.status === 'RUNNING' ? (
                          <>
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Start
                          </>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteAgent(agent.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Bot className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-semibold mb-2">No Agents Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first AI agent to automate research tasks
                </p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Agent
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
