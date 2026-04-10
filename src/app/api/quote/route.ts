import { NextRequest, NextResponse } from 'next/server';
import { getStockQuote, getCompanyInfo, getFinancialMetrics } from '@/services/market-data';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const includeCompanyInfo = searchParams.get('company') === 'true';
  const includeMetrics = searchParams.get('metrics') === 'true';

  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol is required' },
      { status: 400 }
    );
  }

  try {
    const quote = await getStockQuote(symbol.toUpperCase());

    if (!quote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    const response: Record<string, unknown> = { quote };

    if (includeCompanyInfo) {
      const company = await getCompanyInfo(symbol.toUpperCase());
      response.company = company;
    }

    if (includeMetrics) {
      const metrics = await getFinancialMetrics(symbol.toUpperCase());
      response.metrics = metrics;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}
