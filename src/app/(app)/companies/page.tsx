'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Building,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Plus,
  Globe,
  Users,
  Calendar,
} from 'lucide-react';
import { cn, formatMarketCap, formatPercent } from '@/lib/utils';

interface Company {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  price: number;
  change: number;
  changePercent: number;
  employees?: number;
  website?: string;
  description?: string;
  logo?: string;
}

// Mock data
const MOCK_COMPANIES: Company[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    marketCap: 3020000000000,
    price: 189.45,
    change: 2.34,
    changePercent: 1.25,
    employees: 164000,
    website: 'https://apple.com',
    description: 'Apple designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories.',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    sector: 'Technology',
    industry: 'Software - Infrastructure',
    marketCap: 2890000000000,
    price: 378.92,
    change: -1.23,
    changePercent: -0.32,
    employees: 221000,
    website: 'https://microsoft.com',
    description: 'Microsoft develops and supports software, services, devices, and solutions worldwide.',
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    sector: 'Technology',
    industry: 'Internet Content & Information',
    marketCap: 1750000000000,
    price: 141.56,
    change: 0.89,
    changePercent: 0.63,
    employees: 182000,
    website: 'https://abc.xyz',
    description: 'Alphabet Inc. operates through Google, which includes Search, YouTube, Cloud, and other services.',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    marketCap: 1540000000000,
    price: 147.23,
    change: 3.45,
    changePercent: 2.40,
    employees: 1525000,
    website: 'https://amazon.com',
    description: 'Amazon.com engages in e-commerce, cloud computing, digital streaming, and artificial intelligence.',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    sector: 'Technology',
    industry: 'Semiconductors',
    marketCap: 2150000000000,
    price: 875.32,
    change: 45.67,
    changePercent: 5.51,
    employees: 26000,
    website: 'https://nvidia.com',
    description: 'NVIDIA designs and sells graphics processing units and system-on-chip units.',
  },
];

const SECTORS = [
  'All Sectors',
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Industrials',
  'Energy',
  'Materials',
  'Real Estate',
  'Utilities',
  'Communication Services',
];

export default function CompaniesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('All Sectors');
  const [companies, setCompanies] = useState<Company[]>(MOCK_COMPANIES);

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch =
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSector =
      selectedSector === 'All Sectors' || company.sector === selectedSector;
    return matchesSearch && matchesSector;
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="container-responsive py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Companies</h1>
            <p className="text-muted-foreground">
              Browse and research public companies
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add to Watchlist
          </Button>
        </div>

        {/* Search & Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies by name or symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Sector Pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              {SECTORS.map((sector) => (
                <button
                  key={sector}
                  onClick={() => setSelectedSector(sector)}
                  className={cn(
                    'px-3 py-1 rounded-full text-sm font-medium transition',
                    selectedSector === sector
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {sector}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Company List */}
        <div className="grid gap-4">
          {filteredCompanies.map((company) => (
            <Card key={company.symbol} className="hover:shadow-md transition">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Building className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/company/${company.symbol}`}
                            className="font-semibold text-lg hover:underline"
                          >
                            {company.name}
                          </Link>
                          <span className="font-mono text-sm text-muted-foreground">
                            {company.symbol}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{company.sector}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {company.industry}
                          </span>
                        </div>
                      </div>
                    </div>

                    {company.description && (
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                        {company.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        {formatMarketCap(company.marketCap)}
                      </span>
                      {company.employees && (
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {company.employees.toLocaleString()} employees
                        </span>
                      )}
                      {company.website && (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          <Globe className="w-4 h-4" />
                          Website
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        ${company.price.toFixed(2)}
                      </p>
                      <div
                        className={cn(
                          'flex items-center gap-1 text-sm font-medium',
                          company.change >= 0 ? 'text-bull' : 'text-bear'
                        )}
                      >
                        {company.change >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        ${Math.abs(company.change).toFixed(2)} (
                        {formatPercent(company.changePercent)})
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/company/${company.symbol}`}>
                          View Details
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/research?q=${company.symbol}`}>
                          Research
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredCompanies.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Building className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No companies found</p>
                <Button
                  variant="link"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSector('All Sectors');
                  }}
                >
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
