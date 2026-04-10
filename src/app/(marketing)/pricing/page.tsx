import Link from 'next/link';
import { Check, Zap, Building2, ArrowRight, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Free Trial',
    description: 'Perfect for exploring Finsyt capabilities',
    price: '$0',
    period: '15 days',
    features: [
      '50 queries per month',
      'Basic market data',
      'SEC filing summaries',
      'Email support',
      'Single user',
      'Basic portfolio tracking',
    ],
    limitations: [
      'Limited to 15 days',
      'No API access',
      'No custom analytics',
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'outline' as const,
    href: '/auth/signin?trial=true',
    highlighted: false,
  },
  {
    name: 'Pro',
    description: 'For serious investors and analysts',
    price: '$29',
    period: '/month',
    features: [
      'Unlimited queries',
      'Real-time market data',
      'Full SEC filing analysis',
      'Earnings call transcripts',
      'Priority support',
      'Advanced portfolio analytics',
      'Custom watchlists',
      'Export to Excel/PDF',
      'Historical data (10 years)',
      'API access (1,000 calls/day)',
    ],
    limitations: [],
    cta: 'Get Started',
    ctaVariant: 'default' as const,
    href: '/auth/signin?plan=pro',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    description: 'For teams and institutions',
    price: 'Custom',
    period: 'pricing',
    features: [
      'Everything in Pro',
      'Unlimited users',
      'Unlimited API access',
      'Historical data (30+ years)',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantees',
      'SSO & SAML',
      'Compliance reporting',
      'On-premise deployment option',
      'Custom model training',
    ],
    limitations: [],
    cta: 'Contact Sales',
    ctaVariant: 'outline' as const,
    href: '/contact?type=enterprise',
    highlighted: false,
  },
];

const faqs = [
  {
    question: 'What happens after my free trial ends?',
    answer:
      'After your 15-day free trial, you can choose to upgrade to a paid plan or your account will be converted to a limited free tier with restricted features. Your data will be preserved for 30 days.',
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer:
      'Yes, you can cancel your subscription at any time. Your access will continue until the end of your current billing period, and you will not be charged again.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards (Visa, Mastercard, American Express), PayPal, and wire transfers for annual Enterprise plans.',
  },
  {
    question: 'Is there a discount for annual billing?',
    answer:
      'Yes! Annual billing gives you 2 months free, effectively a 17% discount. The Pro plan is $290/year (vs $348 monthly).',
  },
  {
    question: 'Do you offer educational or non-profit discounts?',
    answer:
      'Yes, we offer special pricing for educational institutions, non-profits, and students. Contact our sales team for more information.',
  },
  {
    question: 'What does "unlimited queries" mean?',
    answer:
      'Pro users can make as many research queries as they need without any monthly caps. Fair use policies apply to prevent abuse.',
  },
];

export default function PricingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />

        <div className="container mx-auto px-4 py-24 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Zap className="h-4 w-4" />
              Simple, Transparent Pricing
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Choose the Plan That{' '}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Fits Your Needs
              </span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10">
              Start with a free trial, upgrade when you're ready. No hidden fees, no surprises.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="container mx-auto px-4 pb-24 -mt-8">
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                'relative flex flex-col border-2 transition-all',
                plan.highlighted
                  ? 'border-primary shadow-xl shadow-primary/10 scale-105 z-10'
                  : 'border-border hover:border-primary/50 hover:shadow-lg'
              )}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-medium px-4 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}
              <CardHeader className="text-center pt-8">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription className="text-base">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-center mb-8">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.limitations.length > 0 && (
                  <div className="mt-6 pt-6 border-t">
                    <p className="text-sm text-muted-foreground mb-3">Limitations:</p>
                    <ul className="space-y-2">
                      {plan.limitations.map((limitation) => (
                        <li key={limitation} className="flex items-start gap-3 text-sm text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0 mt-2" />
                          {limitation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  asChild
                  variant={plan.ctaVariant}
                  className={cn(
                    'w-full',
                    plan.highlighted && 'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70'
                  )}
                  size="lg"
                >
                  <Link href={plan.href}>
                    {plan.cta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* Enterprise Section */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="flex-1">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-6">
                  <Building2 className="w-7 h-7 text-primary-foreground" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Need a Custom Solution?
                </h2>
                <p className="text-muted-foreground text-lg mb-6">
                  Our Enterprise plan is designed for hedge funds, asset managers, and
                  financial institutions that need advanced features, custom integrations,
                  and dedicated support.
                </p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>Volume discounts for large teams</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>Custom API integrations</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>Dedicated customer success manager</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>99.99% uptime SLA</span>
                  </li>
                </ul>
                <Button size="lg" asChild>
                  <Link href="/contact?type=enterprise">
                    Talk to Sales <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
              <div className="flex-1 w-full">
                <div className="rounded-2xl border bg-background p-8 shadow-lg">
                  <h3 className="font-semibold text-lg mb-4">Enterprise customers include:</h3>
                  <div className="grid grid-cols-2 gap-6">
                    {['Top 10 Hedge Funds', 'Major Investment Banks', 'Global Asset Managers', 'Research Firms'].map(
                      (customer) => (
                        <div
                          key={customer}
                          className="h-16 rounded-lg bg-muted/50 flex items-center justify-center text-sm text-muted-foreground text-center px-4"
                        >
                          {customer}
                        </div>
                      )
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-6 text-center">
                    Join 500+ financial institutions using Finsyt
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <HelpCircle className="h-4 w-4" />
              FAQs
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground text-lg">
              Have questions? We've got answers.
            </p>
          </div>

          <div className="space-y-6">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">Still have questions?</p>
            <Button variant="outline" asChild>
              <Link href="/contact">Contact Support</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 pb-24">
        <div className="rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/5" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Start Your Free Trial Today
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              No credit card required. Get full access to all Pro features for 15 days.
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
