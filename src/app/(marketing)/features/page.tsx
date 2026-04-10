import Link from 'next/link';
import {
  Brain,
  Search,
  BarChart3,
  FileText,
  Mic,
  Briefcase,
  Zap,
  Shield,
  Globe,
  LineChart,
  Clock,
  Lock,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FeatureShowcase } from '@/components/marketing/feature-showcase';
import { VideoDemo } from '@/components/marketing/video-demo';

const mainFeatures = [
  {
    icon: Brain,
    title: 'AI-Powered Research',
    description:
      'Ask complex financial questions in natural language and receive comprehensive, nuanced answers backed by real data and verified sources.',
    highlights: [
      'Natural language understanding',
      'Context-aware responses',
      'Multi-step reasoning',
      'Source attribution',
    ],
  },
  {
    icon: LineChart,
    title: 'Real-Time Market Data',
    description:
      'Access live stock quotes, market indices, forex rates, and cryptocurrency prices with millisecond-level updates.',
    highlights: [
      'Live price streaming',
      'Historical data access',
      'Technical indicators',
      'Custom alerts',
    ],
  },
  {
    icon: Search,
    title: 'Natural Language Queries',
    description:
      'Simply type what you want to know in plain English. No need to learn complex query syntax or navigate multiple databases.',
    highlights: [
      'Conversational interface',
      'Follow-up questions',
      'Query suggestions',
      'Voice input support',
    ],
  },
  {
    icon: FileText,
    title: 'SEC Filing Analysis',
    description:
      'Instantly analyze 10-K, 10-Q, 8-K, and other SEC filings. Extract key metrics, compare filings, and identify important changes.',
    highlights: [
      '10-K and 10-Q analysis',
      '8-K event detection',
      'Risk factor extraction',
      'Comparative analysis',
    ],
  },
  {
    icon: Mic,
    title: 'Earnings Call Transcripts',
    description:
      'Access and analyze earnings call transcripts. Understand management sentiment, extract key themes, and track guidance changes.',
    highlights: [
      'Full transcript access',
      'Sentiment analysis',
      'Key quote extraction',
      'Historical comparisons',
    ],
  },
  {
    icon: Briefcase,
    title: 'Portfolio Tracking',
    description:
      'Build and monitor your portfolio with real-time valuations, performance analytics, and AI-powered insights on your holdings.',
    highlights: [
      'Real-time valuations',
      'Performance attribution',
      'Risk analysis',
      'Rebalancing suggestions',
    ],
  },
];

const additionalFeatures = [
  {
    icon: Globe,
    title: 'Global Coverage',
    description: 'Access data on over 50,000 securities across 100+ global exchanges.',
  },
  {
    icon: Clock,
    title: 'Historical Data',
    description: '30+ years of historical financial data for comprehensive backtesting.',
  },
  {
    icon: Shield,
    title: 'Verified Sources',
    description: 'Every insight includes source citations for verification and compliance.',
  },
  {
    icon: Zap,
    title: 'Instant Answers',
    description: 'Get responses in seconds, not hours. Research at the speed of thought.',
  },
  {
    icon: Lock,
    title: 'Enterprise Security',
    description: 'Bank-level encryption, SOC 2 compliance, and enterprise SSO support.',
  },
  {
    icon: BarChart3,
    title: 'Custom Analytics',
    description: 'Build custom screens, ratios, and analytics tailored to your strategy.',
  },
];

export default function FeaturesPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="container mx-auto px-4 py-24 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Zap className="h-4 w-4" />
              Powerful Features
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Everything You Need for{' '}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Financial Research
              </span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10">
              From AI-powered analysis to real-time market data, Finsyt provides all the tools
              you need to make informed investment decisions.
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

      {/* Video Demo Section */}
      <section className="container mx-auto px-4 py-16">
        <VideoDemo />
      </section>

      {/* Main Features */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Core Capabilities</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Discover the powerful features that make Finsyt the choice of professional
            investors and analysts worldwide.
          </p>
        </div>

        <div className="space-y-24">
          {mainFeatures.map((feature, index) => (
            <div
              key={feature.title}
              className={`flex flex-col ${
                index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
              } gap-12 items-center`}
            >
              <div className="flex-1">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">{feature.title}</h3>
                <p className="text-muted-foreground text-lg mb-6">{feature.description}</p>
                <ul className="space-y-3">
                  {feature.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 w-full">
                <FeatureShowcase
                  title={feature.title}
                  description={feature.description}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">And Much More</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Additional features designed to give you a competitive edge.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {additionalFeatures.map((feature) => (
              <Card
                key={feature.title}
                className="border bg-background/50 backdrop-blur-sm hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/5" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Experience These Features?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Start your free 15-day trial today. No credit card required.
            </p>
            <Button size="lg" asChild className="text-lg px-8">
              <Link href="/auth/signin?trial=true">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
