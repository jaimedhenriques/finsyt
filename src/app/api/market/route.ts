import { NextRequest, NextResponse } from 'next/server';
import { yahooFinance } from '@/lib/providers/yahoo-finance';
import { fmp } from '@/lib/providers/fmp';
import { cache, CacheTTL, cacheKey } from '@/lib/cache/redis';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const symbols = searchParams.get('symbols')?.split(',') || [];
    const symbol = searchParams.get('symbol');

    switch (action) {
      case 'quote': {
        if (!symbol) {
          return NextResponse.json(
            { error: 'Symbol is required' },
            { status: 400 }
          );
        }
        const quote = await cache.getOrFetch(
          cacheKey('quote', symbol),
          () => yahooFinance.getQuote(symbol),
          { ttl: CacheTTL.QUOTE }
        );
        return NextResponse.json(quote);
      }

      case 'quotes': {
        if (symbols.length === 0) {
          return NextResponse.json(
            { error: 'Symbols are required' },
            { status: 400 }
          );
        }
        const quotes = await cache.getOrFetch(
          cacheKey('quotes', symbols.sort().join(',')),
          () => yahooFinance.getQuotes(symbols),
          { ttl: CacheTTL.QUOTE }
        );
        return NextResponse.json(quotes);
      }

      case 'gainers': {
        const gainers = await cache.getOrFetch(
          cacheKey('movers', 'gainers'),
          () => fmp.getMarketMovers('gainers'),
          { ttl: CacheTTL.MOVERS }
        );
        return NextResponse.json(gainers);
      }

      case 'losers': {
        const losers = await cache.getOrFetch(
          cacheKey('movers', 'losers'),
          () => fmp.getMarketMovers('losers'),
          { ttl: CacheTTL.MOVERS }
        );
        return NextResponse.json(losers);
      }

      case 'actives': {
        const actives = await cache.getOrFetch(
          cacheKey('movers', 'actives'),
          () => fmp.getMarketMovers('actives'),
          { ttl: CacheTTL.MOVERS }
        );
        return NextResponse.json(actives);
      }

      case 'sectors': {
        const sectors = await cache.getOrFetch(
          cacheKey('sectors'),
          () => fmp.getSectorPerformance(),
          { ttl: CacheTTL.SECTORS }
        );
        return NextResponse.json(sectors);
      }

      case 'search': {
        const query = searchParams.get('q');
        if (!query) {
          return NextResponse.json(
            { error: 'Query is required' },
            { status: 400 }
          );
        }
        // Search results cached briefly
        const results = await cache.getOrFetch(
          cacheKey('search', query.toLowerCase()),
          () => yahooFinance.searchSymbols(query),
          { ttl: 300 }
        );
        return NextResponse.json(results);
      }

      case 'profile': {
        if (!symbol) {
          return NextResponse.json(
            { error: 'Symbol is required' },
            { status: 400 }
          );
        }
        const profile = await cache.getOrFetch(
          cacheKey('profile', symbol),
          () => fmp.getCompanyProfile(symbol),
          { ttl: CacheTTL.PROFILE }
        );
        return NextResponse.json(profile);
      }

      case 'historical': {
        if (!symbol) {
          return NextResponse.json(
            { error: 'Symbol is required' },
            { status: 400 }
          );
        }
        const timeframe = (searchParams.get('timeframe') || '1Y') as '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX';
        const prices = await cache.getOrFetch(
          cacheKey('historical', symbol, timeframe),
          () => yahooFinance.getHistoricalPrices(symbol, timeframe),
          { ttl: CacheTTL.HISTORICAL }
        );
        return NextResponse.json(prices);
      }

      case 'news': {
        const newsSymbols = symbols.length > 0 ? symbols : ['AAPL', 'MSFT', 'GOOGL'];
        const news = await cache.getOrFetch(
          cacheKey('news', newsSymbols.sort().join(',')),
          () => fmp.getStockNews(newsSymbols, 20),
          { ttl: CacheTTL.NEWS }
        );
        return NextResponse.json(news);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Market API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
