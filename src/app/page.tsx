import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  MessageSquare,
  TrendingUp,
  FileText,
  Zap,
  Shield,
  BarChart3,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container-responsive flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">Finsyt</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/research"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Research
            </Link>
            <Link
              href="/market"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Market Monitor
            </Link>
            <Link
              href="/filings"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              SEC Filings
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth/signin">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/signin">
              <Button size="sm">
                Get Started <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container-responsive pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm mb-6">
          <Zap className="w-4 h-4" />
          AI-Powered Financial Intelligence
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 max-w-4xl mx-auto">
          Professional Financial Research,{' '}
          <span className="text-primary">Supercharged by AI</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Get instant, source-cited answers to complex financial questions.
          Research companies, analyze SEC filings, and monitor markets - all in
          one platform.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/research">
            <Button size="lg" className="w-full sm:w-auto">
              Start Researching <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <Link href="/demo">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              Watch Demo
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Free tier available. No credit card required.
        </p>
      </section>

      {/* Features */}
      <section className="container-responsive py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">
            Everything You Need for Financial Research
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            From real-time market data to deep SEC filing analysis, Finsyt gives
            you the tools to make informed investment decisions.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6" />}
            title="AI Research Chat"
            description="Ask complex financial questions in natural language. Get detailed, source-cited answers backed by real data."
          />
          <FeatureCard
            icon={<TrendingUp className="w-6 h-6" />}
            title="Market Monitor"
            description="Track stocks, indices, and sectors in real-time. Set alerts and build custom watchlists."
          />
          <FeatureCard
            icon={<FileText className="w-6 h-6" />}
            title="SEC Filings"
            description="Search and analyze 10-K, 10-Q, 8-K filings. AI extracts key insights from complex documents."
          />
          <FeatureCard
            icon={<BarChart3 className="w-6 h-6" />}
            title="Financial Data"
            description="Access income statements, balance sheets, cash flows. Compare companies side by side."
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="AI Agents"
            description="Automate research tasks. Monitor earnings, track filings, get daily market digests."
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="Source Verification"
            description="Every answer includes citations. Verify data directly from primary sources."
          />
        </div>
      </section>

      {/* Data Sources */}
      <section className="border-y bg-muted/30 py-16">
        <div className="container-responsive">
          <h3 className="text-center text-sm font-medium text-muted-foreground mb-8">
            POWERED BY TRUSTED DATA SOURCES
          </h3>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            {[
              'SEC EDGAR',
              'Yahoo Finance',
              'Financial Modeling Prep',
              'FRED',
              'Finnhub',
              'Alpha Vantage',
            ].map((source) => (
              <span
                key={source}
                className="text-muted-foreground font-medium text-sm"
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-responsive py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ready to Supercharge Your Research?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Join thousands of analysts, investors, and researchers who use Finsyt
          to make better financial decisions.
        </p>
        <Link href="/auth/signin">
          <Button size="lg">
            Get Started Free <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-muted/30">
        <div className="container-responsive">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-xl">Finsyt</span>
              </div>
              <p className="text-sm text-muted-foreground">
                AI-powered financial research for professionals.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/research" className="hover:text-foreground">
                    Research Chat
                  </Link>
                </li>
                <li>
                  <Link href="/market" className="hover:text-foreground">
                    Market Monitor
                  </Link>
                </li>
                <li>
                  <Link href="/filings" className="hover:text-foreground">
                    SEC Filings
                  </Link>
                </li>
                <li>
                  <Link href="/agents" className="hover:text-foreground">
                    AI Agents
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Integrations</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/excel" className="hover:text-foreground">
                    Excel Plugin
                  </Link>
                </li>
                <li>
                  <Link href="/api" className="hover:text-foreground">
                    API Access
                  </Link>
                </li>
                <li>
                  <Link href="/mcp" className="hover:text-foreground">
                    MCP Server
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/about" className="hover:text-foreground">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-foreground">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-foreground">
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Finsyt. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-lg border bg-card hover:shadow-md transition">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
