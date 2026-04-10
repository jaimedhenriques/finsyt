import { BaseProvider } from './base';
import { EconomicIndicator, ProviderConfig } from './types';

interface FREDSeriesObservation {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string;
}

interface FREDSeriesInfo {
  id: string;
  realtime_start: string;
  realtime_end: string;
  title: string;
  observation_start: string;
  observation_end: string;
  frequency: string;
  frequency_short: string;
  units: string;
  units_short: string;
  seasonal_adjustment: string;
  seasonal_adjustment_short: string;
  last_updated: string;
}

// Common economic indicator series IDs
export const FRED_SERIES = {
  // GDP & Growth
  GDP: 'GDP', // Gross Domestic Product
  GDPC1: 'GDPC1', // Real GDP
  A191RL1Q225SBEA: 'A191RL1Q225SBEA', // Real GDP Growth Rate

  // Employment
  UNRATE: 'UNRATE', // Unemployment Rate
  PAYEMS: 'PAYEMS', // Total Nonfarm Payrolls
  ICSA: 'ICSA', // Initial Claims

  // Inflation
  CPIAUCSL: 'CPIAUCSL', // Consumer Price Index
  PCEPI: 'PCEPI', // PCE Price Index
  CPILFESL: 'CPILFESL', // Core CPI

  // Interest Rates
  FEDFUNDS: 'FEDFUNDS', // Federal Funds Rate
  DGS10: 'DGS10', // 10-Year Treasury
  DGS2: 'DGS2', // 2-Year Treasury
  T10Y2Y: 'T10Y2Y', // 10Y-2Y Spread (Yield Curve)
  MORTGAGE30US: 'MORTGAGE30US', // 30-Year Mortgage Rate

  // Money Supply
  M2SL: 'M2SL', // M2 Money Stock
  WALCL: 'WALCL', // Fed Balance Sheet

  // Housing
  HOUST: 'HOUST', // Housing Starts
  CSUSHPINSA: 'CSUSHPINSA', // Case-Shiller Home Price Index
  PERMIT: 'PERMIT', // Building Permits

  // Consumer
  UMCSENT: 'UMCSENT', // Consumer Sentiment
  RSXFS: 'RSXFS', // Retail Sales
  PCE: 'PCE', // Personal Consumption Expenditures

  // Business
  INDPRO: 'INDPRO', // Industrial Production
  DGORDER: 'DGORDER', // Durable Goods Orders
  BUSINV: 'BUSINV', // Business Inventories

  // Trade
  BOPGSTB: 'BOPGSTB', // Trade Balance
  DTWEXBGS: 'DTWEXBGS', // Trade Weighted Dollar Index

  // Financial Conditions
  BAMLH0A0HYM2: 'BAMLH0A0HYM2', // High Yield Spread
  VIXCLS: 'VIXCLS', // VIX
} as const;

export class FREDProvider extends BaseProvider {
  private readonly BASE_URL = 'https://api.stlouisfed.org/fred';
  private apiKey: string;

  constructor(config: ProviderConfig = {}) {
    super('FRED', config);
    this.apiKey = config.apiKey || process.env.FRED_API_KEY || '';
  }

  private getUrl(endpoint: string, params: Record<string, string> = {}): string {
    const searchParams = new URLSearchParams({
      api_key: this.apiKey,
      file_type: 'json',
      ...params,
    });
    return `${this.BASE_URL}${endpoint}?${searchParams.toString()}`;
  }

  async getSeriesObservations(
    seriesId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      sort?: 'asc' | 'desc';
    } = {}
  ): Promise<EconomicIndicator[]> {
    const params: Record<string, string> = {
      series_id: seriesId,
      sort_order: options.sort || 'desc',
    };

    if (options.startDate) {
      params.observation_start = this.formatDate(options.startDate);
    }
    if (options.endDate) {
      params.observation_end = this.formatDate(options.endDate);
    }
    if (options.limit) {
      params.limit = options.limit.toString();
    }

    const url = this.getUrl('/series/observations', params);
    const data = await this.fetchWithRetry<{
      observations: FREDSeriesObservation[];
    }>(url);

    // Get series info for name and units
    const seriesInfo = await this.getSeriesInfo(seriesId);

    return data.observations
      .filter((obs) => obs.value !== '.')
      .map((obs) => ({
        id: seriesId,
        name: seriesInfo.title,
        value: parseFloat(obs.value),
        date: new Date(obs.date),
        unit: seriesInfo.units,
        frequency: seriesInfo.frequency,
      }));
  }

  async getSeriesInfo(seriesId: string): Promise<FREDSeriesInfo> {
    const url = this.getUrl('/series', { series_id: seriesId });
    const data = await this.fetchWithRetry<{ seriess: FREDSeriesInfo[] }>(url);

    if (!data.seriess.length) {
      throw this.createError('NOT_FOUND', `Series not found: ${seriesId}`, false);
    }

    return data.seriess[0];
  }

  async getLatestValue(seriesId: string): Promise<EconomicIndicator> {
    const observations = await this.getSeriesObservations(seriesId, {
      limit: 1,
      sort: 'desc',
    });

    if (!observations.length) {
      throw this.createError(
        'NO_DATA',
        `No data available for series: ${seriesId}`,
        false
      );
    }

    return observations[0];
  }

  async getMultipleLatest(
    seriesIds: string[]
  ): Promise<Record<string, EconomicIndicator>> {
    const results = await Promise.all(
      seriesIds.map(async (id) => {
        try {
          const indicator = await this.getLatestValue(id);
          return { id, indicator };
        } catch {
          return { id, indicator: null };
        }
      })
    );

    return results.reduce(
      (acc, { id, indicator }) => {
        if (indicator) acc[id] = indicator;
        return acc;
      },
      {} as Record<string, EconomicIndicator>
    );
  }

  async searchSeries(
    query: string,
    limit: number = 20
  ): Promise<
    Array<{
      id: string;
      title: string;
      frequency: string;
      units: string;
      popularity: number;
    }>
  > {
    const url = this.getUrl('/series/search', {
      search_text: query,
      limit: limit.toString(),
      order_by: 'popularity',
      sort_order: 'desc',
    });

    const data = await this.fetchWithRetry<{ seriess: FREDSeriesInfo[] }>(url);

    return data.seriess.map((s) => ({
      id: s.id,
      title: s.title,
      frequency: s.frequency,
      units: s.units,
      popularity: 0,
    }));
  }

  // Convenience methods for common indicators
  async getGDP(): Promise<EconomicIndicator> {
    return this.getLatestValue(FRED_SERIES.GDPC1);
  }

  async getUnemploymentRate(): Promise<EconomicIndicator> {
    return this.getLatestValue(FRED_SERIES.UNRATE);
  }

  async getInflation(): Promise<EconomicIndicator> {
    return this.getLatestValue(FRED_SERIES.CPIAUCSL);
  }

  async getFedFundsRate(): Promise<EconomicIndicator> {
    return this.getLatestValue(FRED_SERIES.FEDFUNDS);
  }

  async get10YearTreasury(): Promise<EconomicIndicator> {
    return this.getLatestValue(FRED_SERIES.DGS10);
  }

  async getYieldCurve(): Promise<EconomicIndicator> {
    return this.getLatestValue(FRED_SERIES.T10Y2Y);
  }

  async getConsumerSentiment(): Promise<EconomicIndicator> {
    return this.getLatestValue(FRED_SERIES.UMCSENT);
  }

  async getEconomicDashboard(): Promise<Record<string, EconomicIndicator>> {
    const dashboardSeries = [
      FRED_SERIES.GDPC1,
      FRED_SERIES.UNRATE,
      FRED_SERIES.CPIAUCSL,
      FRED_SERIES.FEDFUNDS,
      FRED_SERIES.DGS10,
      FRED_SERIES.T10Y2Y,
      FRED_SERIES.UMCSENT,
      FRED_SERIES.INDPRO,
    ];

    return this.getMultipleLatest(dashboardSeries);
  }
}

export const fred = new FREDProvider();
