import { BaseProvider } from './base';
import { SECFiling, ProviderConfig } from './types';

interface EdgarSubmission {
  cik: string;
  entityType: string;
  name: string;
  tickers: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

interface EdgarSearchResult {
  hits: {
    hits: Array<{
      _source: {
        cik: string;
        company: string;
        form: string;
        filed: string;
        period_of_report?: string;
        file_num: string;
        adsh: string;
      };
    }>;
    total: { value: number };
  };
}

export class SECEdgarProvider extends BaseProvider {
  private readonly BASE_URL = 'https://data.sec.gov';
  private readonly SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index';

  constructor(config: ProviderConfig = {}) {
    super('SEC EDGAR', config);
  }

  async getCompanyFilings(
    cikOrTicker: string,
    formTypes?: string[],
    limit: number = 20
  ): Promise<SECFiling[]> {
    // Normalize CIK (pad with leading zeros)
    const cik = this.normalizeCik(cikOrTicker);

    const url = `${this.BASE_URL}/submissions/CIK${cik}.json`;

    const data = await this.fetchWithRetry<EdgarSubmission>(url, {
      headers: {
        'User-Agent': 'Finsyt Research Platform contact@finsyt.com',
      },
    });

    const filings = this.parseFilings(data, formTypes);
    return filings.slice(0, limit);
  }

  async searchFilings(
    query: string,
    options: {
      formTypes?: string[];
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
    } = {}
  ): Promise<SECFiling[]> {
    const params = new URLSearchParams({
      q: query,
      dateRange: 'custom',
      startdt: options.dateFrom
        ? this.formatDate(options.dateFrom)
        : this.formatDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)),
      enddt: options.dateTo
        ? this.formatDate(options.dateTo)
        : this.formatDate(new Date()),
    });

    if (options.formTypes?.length) {
      params.append('forms', options.formTypes.join(','));
    }

    const url = `${this.SEARCH_URL}?${params.toString()}`;

    const data = await this.fetchWithRetry<EdgarSearchResult>(url, {
      headers: {
        'User-Agent': 'Finsyt Research Platform contact@finsyt.com',
      },
    });

    return this.parseSearchResults(data, options.limit);
  }

  async getFilingDocument(
    cik: string,
    accessionNumber: string,
    document: string
  ): Promise<string> {
    const normalizedCik = this.normalizeCik(cik);
    const normalizedAccession = accessionNumber.replace(/-/g, '');

    const url = `${this.BASE_URL}/Archives/edgar/data/${normalizedCik}/${normalizedAccession}/${document}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Finsyt Research Platform contact@finsyt.com',
      },
    });

    if (!response.ok) {
      throw this.createError(
        'DOCUMENT_NOT_FOUND',
        `Filing document not found: ${document}`,
        false
      );
    }

    return await response.text();
  }

  async get10KFilings(cikOrTicker: string, limit: number = 5): Promise<SECFiling[]> {
    return this.getCompanyFilings(cikOrTicker, ['10-K', '10-K/A'], limit);
  }

  async get10QFilings(cikOrTicker: string, limit: number = 8): Promise<SECFiling[]> {
    return this.getCompanyFilings(cikOrTicker, ['10-Q', '10-Q/A'], limit);
  }

  async get8KFilings(cikOrTicker: string, limit: number = 10): Promise<SECFiling[]> {
    return this.getCompanyFilings(cikOrTicker, ['8-K', '8-K/A'], limit);
  }

  async getInsiderFilings(cikOrTicker: string, limit: number = 20): Promise<SECFiling[]> {
    return this.getCompanyFilings(cikOrTicker, ['4', '4/A', '3', '5'], limit);
  }

  private normalizeCik(cikOrTicker: string): string {
    // If it looks like a ticker (contains letters), we'd need to look it up
    // For now, assume it's a CIK and pad to 10 digits
    const cleaned = cikOrTicker.replace(/\D/g, '');
    return cleaned.padStart(10, '0');
  }

  private parseFilings(data: EdgarSubmission, formTypes?: string[]): SECFiling[] {
    const { recent } = data.filings;
    const filings: SECFiling[] = [];

    for (let i = 0; i < recent.accessionNumber.length; i++) {
      const formType = recent.form[i];

      if (formTypes && formTypes.length > 0 && !formTypes.includes(formType)) {
        continue;
      }

      const accessionNumber = recent.accessionNumber[i];
      const normalizedAccession = accessionNumber.replace(/-/g, '');

      filings.push({
        cik: data.cik,
        accessionNumber,
        formType,
        filedAt: new Date(recent.filingDate[i]),
        reportDate: recent.reportDate[i]
          ? new Date(recent.reportDate[i])
          : undefined,
        documentUrl: `${this.BASE_URL}/Archives/edgar/data/${data.cik}/${normalizedAccession}/${recent.primaryDocument[i]}`,
        description: recent.primaryDocDescription[i],
        companyName: data.name,
        ticker: data.tickers?.[0],
      });
    }

    return filings;
  }

  private parseSearchResults(
    data: EdgarSearchResult,
    limit: number = 20
  ): SECFiling[] {
    return data.hits.hits.slice(0, limit).map((hit) => {
      const source = hit._source;
      const normalizedAccession = source.adsh.replace(/-/g, '');

      return {
        cik: source.cik,
        accessionNumber: source.adsh,
        formType: source.form,
        filedAt: new Date(source.filed),
        reportDate: source.period_of_report
          ? new Date(source.period_of_report)
          : undefined,
        documentUrl: `${this.BASE_URL}/cgi-bin/browse-edgar?action=getcompany&CIK=${source.cik}&type=${source.form}&dateb=&owner=exclude&count=40`,
        companyName: source.company,
      };
    });
  }
}

export const secEdgar = new SECEdgarProvider();
