import Link from 'next/link';
import { TrendingUp, Users, Target, Heart, Globe, Award, ArrowRight, Linkedin, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const stats = [
  { value: '50,000+', label: 'Active Users' },
  { value: '10M+', label: 'Queries Answered' },
  { value: '100+', label: 'Countries' },
  { value: '99.9%', label: 'Uptime' },
];

const values = [
  {
    icon: Target,
    title: 'Accuracy First',
    description:
      'We believe financial decisions should be based on accurate, verifiable data. Every insight we provide is backed by primary sources.',
  },
  {
    icon: Users,
    title: 'Democratize Finance',
    description:
      'Professional-grade research tools should be accessible to everyone, not just Wall Street. We are leveling the playing field.',
  },
  {
    icon: Heart,
    title: 'User-Centric Design',
    description:
      'Complex financial data should be easy to understand. We obsess over making our platform intuitive and delightful to use.',
  },
  {
    icon: Globe,
    title: 'Global Perspective',
    description:
      'Markets are global, and so is our coverage. We provide insights across borders, currencies, and asset classes.',
  },
];

const team = [
  {
    name: 'Alexandra Chen',
    role: 'CEO & Co-founder',
    bio: 'Former portfolio manager at Bridgewater Associates. Stanford MBA.',
    image: null,
  },
  {
    name: 'Marcus Williams',
    role: 'CTO & Co-founder',
    bio: 'Ex-Google AI research. PhD in Machine Learning from MIT.',
    image: null,
  },
  {
    name: 'Sarah Johnson',
    role: 'Head of Product',
    bio: 'Previously led product at Bloomberg Terminal. Harvard MBA.',
    image: null,
  },
  {
    name: 'David Park',
    role: 'Head of Engineering',
    bio: 'Former engineering lead at Stripe. CS degree from Carnegie Mellon.',
    image: null,
  },
  {
    name: 'Emily Rodriguez',
    role: 'Head of Research',
    bio: 'Ex-Goldman Sachs equity research. CFA charterholder.',
    image: null,
  },
  {
    name: 'James Thompson',
    role: 'Head of Data',
    bio: 'Previously at Two Sigma. PhD in Financial Engineering from Columbia.',
    image: null,
  },
];

const milestones = [
  { year: '2022', event: 'Finsyt founded in San Francisco' },
  { year: '2022', event: 'Raised $5M seed round led by Sequoia' },
  { year: '2023', event: 'Launched public beta, 10,000 users in first month' },
  { year: '2023', event: 'Series A: $25M from Andreessen Horowitz' },
  { year: '2024', event: 'Reached 50,000 active users' },
  { year: '2024', event: 'Expanded to cover 100+ global exchanges' },
  { year: '2025', event: 'Launched Enterprise tier for institutions' },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="absolute top-0 left-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

        <div className="container mx-auto px-4 py-24 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <TrendingUp className="h-4 w-4" />
              About Finsyt
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Making Financial Research{' '}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Accessible to All
              </span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10">
              We believe everyone deserves access to the same quality financial research
              tools that were once exclusive to Wall Street.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-4 pb-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="text-center p-6 rounded-xl border bg-card"
            >
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-2">
                {stat.value}
              </div>
              <div className="text-muted-foreground text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Story Section */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">Our Story</h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    Finsyt was born from a simple frustration: why is professional-grade
                    financial research so expensive and inaccessible? Our founders
                    experienced this firsthand while working at leading investment firms.
                  </p>
                  <p>
                    The tools that power Wall Street's best decisions cost tens of
                    thousands of dollars per year and require extensive training to use.
                    Meanwhile, retail investors and smaller firms were left with fragmented
                    data and outdated interfaces.
                  </p>
                  <p>
                    We founded Finsyt to change that. By combining cutting-edge AI with
                    comprehensive financial data, we've created a platform that makes
                    professional research accessible through simple, natural conversations.
                  </p>
                  <p>
                    Today, Finsyt serves over 50,000 users across 100 countries, from
                    individual investors to hedge funds. And we're just getting started.
                  </p>
                </div>
              </div>
              <div className="relative">
                <div className="rounded-2xl border bg-background p-8 shadow-lg">
                  <h3 className="font-semibold text-lg mb-4">Our Journey</h3>
                  <div className="space-y-4">
                    {milestones.map((milestone, index) => (
                      <div key={index} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          {index < milestones.length - 1 && (
                            <div className="w-0.5 h-full bg-primary/20" />
                          )}
                        </div>
                        <div className="pb-4">
                          <div className="text-sm font-medium text-primary">{milestone.year}</div>
                          <div className="text-sm text-muted-foreground">{milestone.event}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Values</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            The principles that guide everything we do at Finsyt.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {values.map((value) => (
            <Card key={value.title} className="border bg-card hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <value.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{value.title}</h3>
                <p className="text-muted-foreground">{value.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Team Section */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Meet the Team</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              We're a team of finance professionals, engineers, and researchers
              passionate about democratizing financial intelligence.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {team.map((member) => (
              <Card key={member.name} className="border bg-background hover:shadow-lg transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 mx-auto mb-4 flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{member.name}</h3>
                  <p className="text-primary text-sm font-medium mb-2">{member.role}</p>
                  <p className="text-muted-foreground text-sm mb-4">{member.bio}</p>
                  <div className="flex justify-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Linkedin className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Twitter className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">Want to join our team?</p>
            <Button variant="outline" asChild>
              <Link href="/careers">
                View Open Positions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Awards Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Award className="h-4 w-4" />
            Recognition
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Awards & Recognition</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {[
            'TechCrunch Disrupt Finalist 2023',
            'Forbes Fintech 50 2024',
            'Y Combinator Top Company',
            'Product Hunt #1 Product',
          ].map((award) => (
            <div
              key={award}
              className="text-center p-6 rounded-xl border bg-card hover:shadow-md transition-shadow"
            >
              <Award className="w-8 h-8 text-primary mx-auto mb-3" />
              <p className="text-sm font-medium">{award}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 pb-24">
        <div className="rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/5" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Join the Finsyt Community
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Be part of the future of financial research. Start your free trial today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild className="text-lg px-8">
                <Link href="/auth/signin?trial=true">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8">
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
