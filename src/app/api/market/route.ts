import { NextRequest, NextResponse } from 'next/server';
import { yahooFinance } from '@/lib/providers/yahoo-finance';
import { fmp } from '@/lib/providers/fmp';

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
        const quote = await yahooFinance.getQuote(symbol);
        return NextResponse.json(quote);
      }

      case 'quotes': {
        if (symbols.length === 0) {
          return NextResponse.json(
            { error: 'Symbols are required' },
            { status: 400 }
          );
        }
        const quotes = await yahooFinance.getQuotes(symbols);
        return NextResponse.json(quotes);
      }

      case 'gainers': {
        const gainers = await fmp.getMarketMovers('gainers');
        return NextResponse.json(gainers);
      }

      case 'losers': {
        const losers = await fmp.getMarketMovers('losers');
        return NextResponse.json(losers);
      }

      case 'actives': {
        const actives = await fmp.getMarketMovers('actives');
        return NextResponse.json(actives);
      }

      case 'sectors': {
        const sectors = await fmp.getSectorPerformance();
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
        const results = await yahooFinance.searchSymbols(query);
        return NextResponse.json(results);
      }

      case 'profile': {
        if (!symbol) {
          return NextResponse.json(
            { error: 'Symbol is required' },
            { status: 400 }
          );
        }
        const profile = await fmp.getCompanyProfile(symbol);
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
        const prices = await yahooFinance.getHistoricalPrices(symbol, timeframe);
        return NextResponse.json(prices);
      }

      case 'news': {
        const newsSymbols = symbols.length > 0 ? symbols : ['AAPL', 'MSFT', 'GOOGL'];
        const news = await fmp.getStockNews(newsSymbols, 20);
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
