'use client';

import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  FileText,
  ExternalLink,
  Filter,
  Calendar,
  Building,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Filing {
  cik: string;
  accessionNumber: string;
  formType: string;
  filedAt: Date;
  documentUrl: string;
  companyName?: string;
  ticker?: string;
  description?: string;
}

// Mock data - in production would fetch from API
const MOCK_FILINGS: Filing[] = [
  {
    cik: '0000320193',
    accessionNumber: '0000320193-24-000081',
    formType: '10-K',
    filedAt: new Date('2024-11-01'),
    documentUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    description: 'Annual report for fiscal year ended September 28, 2024',
  },
  {
    cik: '0001318605',
    accessionNumber: '0001318605-24-000090',
    formType: '10-Q',
    filedAt: new Date('2024-10-23'),
    documentUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
    companyName: 'Tesla Inc.',
    ticker: 'TSLA',
    description: 'Quarterly report for Q3 2024',
  },
  {
    cik: '0001652044',
    accessionNumber: '0001652044-24-000067',
    formType: '8-K',
    filedAt: new Date('2024-10-29'),
    documentUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
    companyName: 'Alphabet Inc.',
    ticker: 'GOOGL',
    description: 'Current report - Results of Operations and Financial Condition',
  },
  {
    cik: '0000789019',
    accessionNumber: '0000789019-24-000085',
    formType: '10-K',
    filedAt: new Date('2024-07-30'),
    documentUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
    companyName: 'Microsoft Corporation',
    ticker: 'MSFT',
    description: 'Annual report for fiscal year ended June 30, 2024',
  },
  {
    cik: '0001018724',
    accessionNumber: '0001018724-24-000092',
    formType: 'DEF 14A',
    filedAt: new Date('2024-04-11'),
    documentUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
    companyName: 'Amazon.com Inc.',
    ticker: 'AMZN',
    description: 'Definitive Proxy Statement',
  },
];

const FORM_TYPES = [
  { value: 'all', label: 'All Forms' },
  { value: '10-K', label: '10-K (Annual Report)' },
  { value: '10-Q', label: '10-Q (Quarterly Report)' },
  { value: '8-K', label: '8-K (Current Report)' },
  { value: 'DEF 14A', label: 'DEF 14A (Proxy Statement)' },
  { value: '4', label: 'Form 4 (Insider Trading)' },
  { value: 'S-1', label: 'S-1 (IPO Registration)' },
];

export default function FilingsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [formType, setFormType] = useState('all');
  const [filings, setFilings] = useState<Filing[]>(MOCK_FILINGS);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    setIsLoading(true);
    // In production, this would call the API
    await new Promise((r) => setTimeout(r, 500));

    let filtered = MOCK_FILINGS;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.companyName?.toLowerCase().includes(query) ||
          f.ticker?.toLowerCase().includes(query) ||
          f.description?.toLowerCase().includes(query)
      );
    }

    if (formType !== 'all') {
      filtered = filtered.filter((f) => f.formType === formType);
    }

    setFilings(filtered);
    setIsLoading(false);
  };

  const getFormBadgeColor = (form: string) => {
    if (form.startsWith('10-K')) return 'bg-blue-100 text-blue-800';
    if (form.startsWith('10-Q')) return 'bg-green-100 text-green-800';
    if (form.startsWith('8-K')) return 'bg-orange-100 text-orange-800';
    if (form.startsWith('DEF')) return 'bg-purple-100 text-purple-800';
    if (form === '4') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="container-responsive py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">SEC Filings</h1>
          <p className="text-muted-foreground">
            Search and analyze SEC filings from public companies
          </p>
        </div>

        {/* Search */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by company name, ticker, or keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Form Type" />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} disabled={isLoading}>
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: '10-K Reports', count: 156, form: '10-K' },
            { label: '10-Q Reports', count: 892, form: '10-Q' },
            { label: '8-K Filings', count: 2341, form: '8-K' },
            { label: 'Insider Trades', count: 4521, form: '4' },
          ].map((item) => (
            <button
              key={item.form}
              onClick={() => {
                setFormType(item.form);
                handleSearch();
              }}
              className="p-4 rounded-lg border bg-card hover:bg-muted transition text-left"
            >
              <p className="font-semibold">{item.label}</p>
              <p className="text-sm text-muted-foreground">
                {item.count.toLocaleString()} recent filings
              </p>
            </button>
          ))}
        </div>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Filings</CardTitle>
            <CardDescription>
              {filings.length} filings found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filings.map((filing) => (
                <div
                  key={filing.accessionNumber}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition gap-4"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge className={getFormBadgeColor(filing.formType)}>
                        {filing.formType}
                      </Badge>
                      {filing.ticker && (
                        <span className="font-mono text-sm font-medium">
                          {filing.ticker}
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(filing.filedAt)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Building className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{filing.companyName}</p>
                        {filing.description && (
                          <p className="text-sm text-muted-foreground">
                            {filing.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={filing.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        View Filing
                      </a>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={`/research?q=${encodeURIComponent(`Analyze ${filing.formType} for ${filing.ticker}`)}`}
                      >
                        Analyze with AI
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
