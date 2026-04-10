import Link from 'next/link';
import { ArrowRight, BarChart3, Brain, Search, Shield, Zap, TrendingUp, Play, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Navigation */}
      <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <TrendingUp className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Finsyt</span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link href="/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Features
              </Link>
              <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/use-cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Use Cases
              </Link>
              <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                About
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/signin" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              Sign In
            </Link>
            <Button asChild>
              <Link href="/auth/signup">
                Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <Zap className="h-4 w-4" />
            AI-Powered Financial Intelligence
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Financial Research,{' '}
            <span className="gradient-text">Reimagined</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Ask questions in plain English. Get instant, accurate insights on stocks,
            markets, and financial data powered by advanced AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="text-lg px-8">
              <Link href="/auth/signup">
                Start 15-Day Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8">
              <Link href="#demo">
                <Play className="mr-2 h-5 w-5" /> Watch Demo
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            No credit card required. Cancel anytime.
          </p>
        </div>

        {/* Hero Visual */}
        <div className="mt-16 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-10 h-32 bottom-0 top-auto" />
          <div className="rounded-xl border bg-card shadow-2xl overflow-hidden max-w-5xl mx-auto">
            <div className="bg-muted/50 px-4 py-3 border-b flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 text-center text-sm text-muted-foreground">
                Finsyt Research Assistant
              </div>
            </div>
            <div className="p-8 bg-gradient-to-br from-card to-muted/20">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 p-4 rounded-lg bg-background/50 border">
                  <p className="text-sm text-muted-foreground mb-2">You asked:</p>
                  <p className="font-medium">"What's Apple's revenue growth over the last 5 years and how does it compare to Microsoft?"</p>
                </div>
              </div>
              <div className="pl-14 space-y-4">
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm leading-relaxed">
                    <strong>Apple (AAPL)</strong> has shown steady revenue growth over the past 5 years:
                    FY2020: $274.5B → FY2024: $383.3B (+39.6% cumulative, 8.7% CAGR).
                    <br /><br />
                    <strong>Microsoft (MSFT)</strong> outpaced with stronger growth:
                    FY2020: $143.0B → FY2024: $245.1B (+71.4% cumulative, 14.4% CAGR).
                    <br /><br />
                    Microsoft's cloud-driven transformation has delivered nearly double Apple's growth rate...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything You Need for Financial Research
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Powerful AI capabilities combined with comprehensive financial data
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: Brain,
              title: 'AI-Powered Analysis',
              description: 'Ask complex financial questions in natural language and get comprehensive, sourced answers instantly.',
            },
            {
              icon: Search,
              title: 'Deep Research',
              description: 'Dive deep into SEC filings, earnings calls, analyst reports, and financial statements.',
            },
            {
              icon: BarChart3,
              title: 'Real-Time Data',
              description: 'Access live market data, stock quotes, and financial metrics updated in real-time.',
            },
            {
              icon: TrendingUp,
              title: 'Market Insights',
              description: 'Get AI-generated insights on market trends, sector analysis, and investment opportunities.',
            },
            {
              icon: Shield,
              title: 'Verified Sources',
              description: 'Every insight is backed by verifiable sources and official financial documents.',
            },
            {
              icon: Zap,
              title: 'Lightning Fast',
              description: 'Get answers in seconds, not hours. Research at the speed of thought.',
            },
          ].map((feature, index) => (
            <div
              key={index}
              className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Demo Video Section */}
      <section id="demo" className="container mx-auto px-4 py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            See Finsyt in Action
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Watch how Finsyt transforms financial research with AI
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="aspect-video rounded-xl border bg-card shadow-lg overflow-hidden relative group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <Play className="w-8 h-8 text-primary-foreground ml-1" />
              </div>
            </div>
            <div className="absolute bottom-4 left-4 right-4">
              <p className="text-sm text-muted-foreground">
                2:30 - Product Demo
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '10K+', label: 'Active Users' },
              { value: '1M+', label: 'Queries Processed' },
              { value: '5000+', label: 'Stocks Covered' },
              { value: '99.9%', label: 'Uptime' },
            ].map((stat, index) => (
              <div key={index}>
                <p className="text-4xl md:text-5xl font-bold gradient-text">{stat.value}</p>
                <p className="text-muted-foreground mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Trusted by Financial Professionals
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            {
              quote: "Finsyt has completely transformed how I do research. What used to take hours now takes minutes.",
              author: "Sarah Chen",
              role: "Portfolio Manager, Citadel",
            },
            {
              quote: "The AI understands financial context better than any tool I've used. It's like having a senior analyst on call 24/7.",
              author: "Michael Ross",
              role: "Equity Analyst, Goldman Sachs",
            },
            {
              quote: "We've integrated Finsyt across our entire research team. The productivity gains have been remarkable.",
              author: "Jennifer Walsh",
              role: "Head of Research, Bridgewater",
            },
          ].map((testimonial, index) => (
            <div key={index} className="p-6 rounded-xl border bg-card">
              <p className="text-muted-foreground mb-4">"{testimonial.quote}"</p>
              <div>
                <p className="font-semibold">{testimonial.author}</p>
                <p className="text-sm text-muted-foreground">{testimonial.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your Research?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
            Join thousands of analysts, investors, and researchers using Finsyt for smarter financial insights.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="text-lg px-8">
              <Link href="/auth/signup">
                Start 15-Day Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8">
              <Link href="/pricing">
                View Pricing
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            No credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-16 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
                <span className="font-bold">Finsyt</span>
              </div>
              <p className="text-sm text-muted-foreground">
                AI-powered financial research for smarter investment decisions.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/features" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="/use-cases" className="hover:text-foreground transition-colors">Use Cases</Link></li>
                <li><Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about" className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-foreground transition-colors">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
                <li><Link href="/security" className="hover:text-foreground transition-colors">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Finsyt. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="https://twitter.com/finsyt" className="hover:text-foreground transition-colors">Twitter</Link>
              <Link href="https://linkedin.com/company/finsyt" className="hover:text-foreground transition-colors">LinkedIn</Link>
              <Link href="https://github.com/finsyt" className="hover:text-foreground transition-colors">GitHub</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
