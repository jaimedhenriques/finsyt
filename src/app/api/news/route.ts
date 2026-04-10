import { NextRequest, NextResponse } from 'next/server';
import { getMarketNews } from '@/services/market-data';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const limit = parseInt(searchParams.get('limit') || '10');

  try {
    const news = await getMarketNews(symbol || undefined, limit);
    return NextResponse.json({ news });
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
