import {
  StockQuote,
  HistoricalPrice,
  CompanyInfo,
  FinancialMetrics,
  NewsArticle,
} from '@/types';

const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';
const POLYGON_BASE = 'https://api.polygon.io';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Alpha Vantage API
export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('Alpha Vantage API key not configured');
    return getMockQuote(symbol);
  }

  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    );
    const data = await response.json();
    const quote = data['Global Quote'];

    if (!quote || Object.keys(quote).length === 0) {
      return getMockQuote(symbol);
    }

    return {
      symbol: quote['01. symbol'],
      name: symbol, // Alpha Vantage doesn't return name
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      volume: parseInt(quote['06. volume']),
      marketCap: 0, // Need separate API call
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      open: parseFloat(quote['02. open']),
      previousClose: parseFloat(quote['08. previous close']),
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    return getMockQuote(symbol);
  }
}

export async function getHistoricalPrices(
  symbol: string,
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  limit: number = 100
): Promise<HistoricalPrice[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return getMockHistoricalPrices(symbol, limit);
  }

  const functionMap = {
    daily: 'TIME_SERIES_DAILY_ADJUSTED',
    weekly: 'TIME_SERIES_WEEKLY_ADJUSTED',
    monthly: 'TIME_SERIES_MONTHLY_ADJUSTED',
  };

  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_BASE}?function=${functionMap[period]}&symbol=${symbol}&apikey=${apiKey}`
    );
    const data = await response.json();

    const timeSeriesKey = Object.keys(data).find((key) =>
      key.includes('Time Series')
    );

    if (!timeSeriesKey) {
      return getMockHistoricalPrices(symbol, limit);
    }

    const timeSeries = data[timeSeriesKey];
    const prices: HistoricalPrice[] = [];

    for (const [date, values] of Object.entries(timeSeries).slice(0, limit)) {
      const v = values as Record<string, string>;
      prices.push({
        date,
        open: parseFloat(v['1. open']),
        high: parseFloat(v['2. high']),
        low: parseFloat(v['3. low']),
        close: parseFloat(v['4. close']),
        volume: parseInt(v['6. volume'] || v['5. volume']),
        adjustedClose: parseFloat(v['5. adjusted close'] || v['4. close']),
      });
    }

    return prices;
  } catch (error) {
    console.error('Error fetching historical prices:', error);
    return getMockHistoricalPrices(symbol, limit);
  }
}

export async function getCompanyInfo(symbol: string): Promise<CompanyInfo | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return getMockCompanyInfo(symbol);
  }

  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_BASE}?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`
    );
    const data = await response.json();

    if (!data.Symbol) {
      return getMockCompanyInfo(symbol);
    }

    return {
      symbol: data.Symbol,
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      website: data.Website || '',
      employees: parseInt(data.FullTimeEmployees) || 0,
      headquarters: `${data.Address}, ${data.Country}`,
      ceo: data.CEO || '',
      founded: data.Founded || '',
    };
  } catch (error) {
    console.error('Error fetching company info:', error);
    return getMockCompanyInfo(symbol);
  }
}

export async function getFinancialMetrics(
  symbol: string
): Promise<FinancialMetrics | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return getMockFinancialMetrics(symbol);
  }

  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_BASE}?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`
    );
    const data = await response.json();

    if (!data.Symbol) {
      return getMockFinancialMetrics(symbol);
    }

    return {
      symbol: data.Symbol,
      peRatio: parseFloat(data.PERatio) || 0,
      pegRatio: parseFloat(data.PEGRatio) || 0,
      eps: parseFloat(data.EPS) || 0,
      revenue: parseFloat(data.RevenueTTM) || 0,
      revenueGrowth: parseFloat(data.QuarterlyRevenueGrowthYOY) || 0,
      grossMargin: parseFloat(data.GrossProfitTTM) / parseFloat(data.RevenueTTM) || 0,
      operatingMargin: parseFloat(data.OperatingMarginTTM) || 0,
      netMargin: parseFloat(data.ProfitMargin) || 0,
      roe: parseFloat(data.ReturnOnEquityTTM) || 0,
      roa: parseFloat(data.ReturnOnAssetsTTM) || 0,
      debtToEquity: parseFloat(data.DebtToEquity) || 0,
      currentRatio: parseFloat(data.CurrentRatio) || 0,
      quickRatio: parseFloat(data.QuickRatio) || 0,
      dividendYield: parseFloat(data.DividendYield) || 0,
      payoutRatio: parseFloat(data.PayoutRatio) || 0,
      freeCashFlow: parseFloat(data.FreeCashFlow) || 0,
    };
  } catch (error) {
    console.error('Error fetching financial metrics:', error);
    return getMockFinancialMetrics(symbol);
  }
}

// Finnhub API for news
export async function getMarketNews(
  symbol?: string,
  limit: number = 10
): Promise<NewsArticle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return getMockNews(symbol);
  }

  try {
    const endpoint = symbol
      ? `${FINNHUB_BASE}/company-news?symbol=${symbol}&from=${getDateString(-30)}&to=${getDateString(0)}&token=${apiKey}`
      : `${FINNHUB_BASE}/news?category=general&token=${apiKey}`;

    const response = await fetch(endpoint);
    const data = await response.json();

    return data.slice(0, limit).map((article: Record<string, unknown>) => ({
      id: String(article.id),
      title: article.headline as string,
      summary: article.summary as string,
      source: article.source as string,
      url: article.url as string,
      publishedAt: new Date((article.datetime as number) * 1000),
      symbols: symbol ? [symbol] : [],
      sentiment: 'neutral' as const,
    }));
  } catch (error) {
    console.error('Error fetching news:', error);
    return getMockNews(symbol);
  }
}

// Helper functions
function getDateString(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

// Mock data for development
function getMockQuote(symbol: string): StockQuote {
  const basePrice = Math.random() * 500 + 50;
  const change = (Math.random() - 0.5) * 10;

  return {
    symbol,
    name: `${symbol} Inc.`,
    price: basePrice,
    change,
    changePercent: (change / basePrice) * 100,
    volume: Math.floor(Math.random() * 10000000),
    marketCap: basePrice * Math.floor(Math.random() * 1000000000),
    high: basePrice + Math.random() * 5,
    low: basePrice - Math.random() * 5,
    open: basePrice - change / 2,
    previousClose: basePrice - change,
    timestamp: new Date(),
  };
}

function getMockHistoricalPrices(symbol: string, limit: number): HistoricalPrice[] {
  const prices: HistoricalPrice[] = [];
  let price = Math.random() * 200 + 100;

  for (let i = 0; i < limit; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const change = (Math.random() - 0.5) * 5;
    price = Math.max(10, price + change);

    prices.push({
      date: date.toISOString().split('T')[0],
      open: price - Math.random() * 2,
      high: price + Math.random() * 3,
      low: price - Math.random() * 3,
      close: price,
      volume: Math.floor(Math.random() * 10000000),
      adjustedClose: price,
    });
  }

  return prices;
}

function getMockCompanyInfo(symbol: string): CompanyInfo {
  return {
    symbol,
    name: `${symbol} Corporation`,
    description: `${symbol} is a leading company in its sector, providing innovative solutions and services.`,
    sector: 'Technology',
    industry: 'Software',
    website: `https://www.${symbol.toLowerCase()}.com`,
    employees: Math.floor(Math.random() * 100000),
    headquarters: 'San Francisco, CA, USA',
    ceo: 'John Doe',
    founded: '2000',
  };
}

function getMockFinancialMetrics(symbol: string): FinancialMetrics {
  return {
    symbol,
    peRatio: Math.random() * 50 + 10,
    pegRatio: Math.random() * 3 + 0.5,
    eps: Math.random() * 10 + 1,
    revenue: Math.random() * 100000000000,
    revenueGrowth: (Math.random() - 0.3) * 50,
    grossMargin: Math.random() * 0.3 + 0.3,
    operatingMargin: Math.random() * 0.2 + 0.1,
    netMargin: Math.random() * 0.15 + 0.05,
    roe: Math.random() * 0.3 + 0.1,
    roa: Math.random() * 0.15 + 0.05,
    debtToEquity: Math.random() * 2,
    currentRatio: Math.random() * 2 + 1,
    quickRatio: Math.random() * 1.5 + 0.5,
    dividendYield: Math.random() * 0.05,
    payoutRatio: Math.random() * 0.5,
    freeCashFlow: Math.random() * 10000000000,
  };
}

function getMockNews(symbol?: string): NewsArticle[] {
  const headlines = [
    'Markets rally on strong earnings reports',
    'Tech sector leads gains amid optimism',
    'Federal Reserve signals steady approach',
    'Quarterly results exceed expectations',
    'New product launch drives investor interest',
  ];

  return headlines.map((title, i) => ({
    id: `news-${i}`,
    title: symbol ? `${symbol}: ${title}` : title,
    summary: `${title}. Analysts remain cautiously optimistic about the outlook.`,
    source: ['Reuters', 'Bloomberg', 'CNBC', 'WSJ', 'FT'][i % 5],
    url: '#',
    publishedAt: new Date(Date.now() - i * 3600000),
    symbols: symbol ? [symbol] : [],
    sentiment: 'neutral' as const,
  }));
}
