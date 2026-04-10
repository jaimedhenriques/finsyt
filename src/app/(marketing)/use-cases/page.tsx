import Link from 'next/link';
import {
  TrendingUp,
  Building2,
  GraduationCap,
  Briefcase,
  LineChart,
  Users,
  ArrowRight,
  CheckCircle2,
  Quote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Testimonials } from '@/components/marketing/testimonials';

const useCases = [
  {
    icon: TrendingUp,
    title: 'Individual Investors',
    description: 'Make smarter investment decisions with AI-powered research at your fingertips.',
    benefits: [
      'Research any stock or ETF in seconds',
      'Understand complex financial statements',
      'Get AI-generated investment insights',
      'Track your portfolio performance',
      'Stay updated on earnings and news',
    ],
    example: {
      query: '"Compare Tesla\'s margins to traditional automakers over the past 3 years"',
      insight:
        'Tesla maintains gross margins of 18-25%, significantly higher than traditional automakers (10-15%), driven by direct sales model and software revenue.',
    },
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Briefcase,
    title: 'Financial Advisors',
    description: 'Serve clients better with instant access to comprehensive research and analysis.',
    benefits: [
      'Quick due diligence on any investment',
      'Generate client-ready reports',
      'Compare investment options instantly',
      'Stay compliant with sourced research',
      'Save hours on manual research',
    ],
    example: {
      query: '"What are the top dividend aristocrats with yields above 3% and payout ratios under 60%?"',
      insight:
        'Identified 15 companies meeting criteria including Johnson & Johnson (3.1% yield, 47% payout) and Procter & Gamble (3.2% yield, 58% payout).',
    },
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Building2,
    title: 'Hedge Funds & Asset Managers',
    description: 'Accelerate your research workflow and discover alpha-generating insights.',
    benefits: [
      'Deep-dive SEC filing analysis',
      'Earnings call sentiment tracking',
      'Competitive intelligence',
      'Custom screening and analytics',
      'API integration with existing tools',
    ],
    example: {
      query: '"Analyze management tone changes in NVIDIA\'s last 4 earnings calls regarding AI chip demand"',
      insight:
        'Sentiment increasingly bullish: Q1 cautious optimism, Q2-Q4 strong confidence with mentions of "unprecedented demand" up 340%.',
    },
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: LineChart,
    title: 'Equity Research Analysts',
    description: 'Produce better research faster with AI-assisted analysis and data gathering.',
    benefits: [
      'Instant access to all SEC filings',
      'Automatic financial modeling inputs',
      'Peer comparison analysis',
      'Industry trend identification',
      'Export to Excel and reports',
    ],
    example: {
      query: '"Extract all customer acquisition cost mentions from SaaS company 10-Ks filed in Q1 2024"',
      insight:
        'Analyzed 127 SaaS 10-K filings, extracted CAC data showing median CAC of $847 with payback period of 14 months.',
    },
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: GraduationCap,
    title: 'Students & Educators',
    description: 'Learn financial analysis with real-world data and AI-guided exploration.',
    benefits: [
      'Access to professional-grade data',
      'Learn by asking questions',
      'Understand complex concepts',
      'Academic research support',
      'Special educational pricing',
    ],
    example: {
      query: '"Explain how Apple\'s balance sheet changed after they started the share buyback program"',
      insight:
        'Detailed breakdown showing cash reserves dropped from $267B to $62B while shares outstanding decreased 35%, improving EPS growth.',
    },
    color: 'from-indigo-500 to-violet-500',
  },
  {
    icon: Users,
    title: 'Investment Clubs',
    description: 'Collaborate on research and make group investment decisions with confidence.',
    benefits: [
      'Shared research workspaces',
      'Collaborative analysis tools',
      'Meeting-ready presentations',
      'Vote and track decisions',
      'Group portfolio tracking',
    ],
    example: {
      query: '"Create a summary of the healthcare sector\'s performance and top opportunities for our club meeting"',
      insight:
        'Generated 3-page summary covering sector performance (+12% YTD), key trends (GLP-1 drugs, AI diagnostics), and 5 stock recommendations with thesis.',
    },
    color: 'from-teal-500 to-cyan-500',
  },
];

const workflows = [
  {
    title: 'Morning Research Workflow',
    steps: [
      'Check overnight news and earnings announcements',
      'Review portfolio positions and alerts',
      'Analyze any pre-market movers',
      'Generate watchlist for the day',
    ],
    time: '15 minutes vs 2 hours',
  },
  {
    title: 'Investment Due Diligence',
    steps: [
      'Ask for company overview and key metrics',
      'Deep dive into financial statements',
      'Analyze competitive positioning',
      'Review risk factors and management',
    ],
    time: '30 minutes vs 4 hours',
  },
  {
    title: 'Earnings Season Analysis',
    steps: [
      'Get earnings preview with estimates',
      'Analyze transcript after the call',
      'Compare results to guidance',
      'Update thesis and price target',
    ],
    time: '20 minutes vs 3 hours',
  },
];

export default function UseCasesPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />

        <div className="container mx-auto px-4 py-24 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Users className="h-4 w-4" />
              Use Cases
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              How{' '}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Different Users
              </span>{' '}
              Use Finsyt
            </h1>
            <p className="text-xl text-muted-foreground mb-10">
              From individual investors to hedge funds, see how Finsyt transforms
              financial research across different user types.
            </p>
            <Button size="lg" asChild className="text-lg px-8">
              <Link href="/auth/signin?trial=true">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Use Cases Grid */}
      <section className="container mx-auto px-4 py-24">
        <div className="space-y-24">
          {useCases.map((useCase, index) => (
            <div
              key={useCase.title}
              className={`flex flex-col ${
                index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
              } gap-12 items-center`}
            >
              <div className="flex-1">
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${useCase.color} flex items-center justify-center mb-6`}
                >
                  <useCase.icon className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-4">{useCase.title}</h2>
                <p className="text-muted-foreground text-lg mb-6">{useCase.description}</p>
                <ul className="space-y-3 mb-8">
                  {useCase.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild>
                  <Link href="/auth/signin?trial=true">
                    Try It Free <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="flex-1 w-full">
                <Card className="border bg-gradient-to-br from-card to-muted/20">
                  <CardHeader>
                    <CardDescription>Example Query</CardDescription>
                    <CardTitle className="text-lg font-normal italic">
                      {useCase.example.query}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-sm text-muted-foreground mb-2">AI Response:</p>
                      <p className="text-sm">{useCase.example.insight}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflows Section */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Common Research Workflows
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              See how Finsyt dramatically reduces the time spent on common research tasks.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {workflows.map((workflow) => (
              <Card key={workflow.title} className="border bg-background">
                <CardHeader>
                  <CardTitle className="text-xl">{workflow.title}</CardTitle>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium w-fit">
                    {workflow.time}
                  </div>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3">
                    {workflow.steps.map((step, index) => (
                      <li key={step} className="flex items-start gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            What Our Users Say
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Hear from investors and analysts who have transformed their research workflow.
          </p>
        </div>

        <Testimonials />
      </section>

      {/* Comparison Section */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Before & After Finsyt
              </h2>
              <p className="text-muted-foreground text-lg">
                See the difference Finsyt makes in your research workflow.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="border-red-500/30 bg-red-500/5">
                <CardHeader>
                  <CardTitle className="text-red-600 dark:text-red-400">
                    Without Finsyt
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm">Hours searching multiple data sources</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm">Manual data entry and calculations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm">Reading entire SEC filings for key info</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm">Expensive terminal subscriptions</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm">Steep learning curves</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-500/30 bg-green-500/5">
                <CardHeader>
                  <CardTitle className="text-green-600 dark:text-green-400">
                    With Finsyt
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Instant answers from unified data</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">AI-powered analysis and calculations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Ask specific questions, get precise answers</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Affordable pricing for everyone</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Natural language - no training needed</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/5" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Transform Your Research?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Join thousands of investors and analysts using Finsyt to make better decisions.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild className="text-lg px-8">
                <Link href="/auth/signin?trial=true">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8">
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
