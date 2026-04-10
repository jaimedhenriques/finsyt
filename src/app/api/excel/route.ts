import { NextRequest, NextResponse } from 'next/server';
import { yahooFinance } from '@/lib/providers/yahoo-finance';
import { fmp } from '@/lib/providers/fmp';
import { fred } from '@/lib/providers/fred';

export const runtime = 'nodejs';

// Excel Add-in API endpoint
// Returns data in a format suitable for Excel tables

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const symbol = searchParams.get('symbol');
    const symbols = searchParams.get('symbols')?.split(',') || [];

    // CORS headers for Excel Add-in
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    switch (action) {
      // Get stock quote for Excel cell
      case 'quote': {
        if (!symbol) {
          return NextResponse.json(
            { error: 'Symbol required' },
            { status: 400, headers }
          );
        }
        const quote = await yahooFinance.getQuote(symbol);
        return NextResponse.json(
          {
            symbol: quote.symbol,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            volume: quote.volume,
            marketCap: quote.marketCap,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            previousClose: quote.previousClose,
          },
          { headers }
        );
      }

      // Get multiple quotes for Excel table
      case 'quotes': {
        if (symbols.length === 0) {
          return NextResponse.json(
            { error: 'Symbols required' },
            { status: 400, headers }
          );
        }
        const quotes = await yahooFinance.getQuotes(symbols);
        // Return as array of arrays for Excel table
        const data = quotes.map((q) => [
          q.symbol,
          q.name,
          q.price,
          q.change,
          q.changePercent,
          q.volume,
          q.marketCap,
        ]);
        return NextResponse.json(
          {
            headers: ['Symbol', 'Name', 'Price', 'Change', 'Change %', 'Volume', 'Market Cap'],
            data,
          },
          { headers }
        );
      }

      // Get company financials for Excel
      case 'financials': {
        if (!symbol) {
          return NextResponse.json(
            { error: 'Symbol required' },
            { status: 400, headers }
          );
        }
        const type = (searchParams.get('type') || 'income') as 'income' | 'balance' | 'cashflow';
        const period = (searchParams.get('period') || 'annual') as 'annual' | 'quarter';
        const limit = parseInt(searchParams.get('limit') || '5');

        let financials;
        let tableHeaders: string[];

        switch (type) {
          case 'income':
            financials = await fmp.getIncomeStatements(symbol, period, limit);
            tableHeaders = ['Period', 'Date', 'Revenue', 'Net Income', 'Gross Profit', 'Operating Income', 'EPS', 'EBITDA'];
            break;
          case 'balance':
            financials = await fmp.getBalanceSheets(symbol, period, limit);
            tableHeaders = ['Period', 'Date', 'Total Assets', 'Total Liabilities', 'Total Equity', 'Cash'];
            break;
          case 'cashflow':
            financials = await fmp.getCashFlowStatements(symbol, period, limit);
            tableHeaders = ['Period', 'Date', 'Operating Cash Flow', 'Free Cash Flow'];
            break;
        }

        const data = financials.map((f) => {
          const row: (string | number | undefined)[] = [f.period, f.date.toISOString().split('T')[0]];
          if (type === 'income') {
            row.push(f.revenue, f.netIncome, f.grossProfit, f.operatingIncome, f.eps, f.ebitda);
          } else if (type === 'balance') {
            row.push(f.totalAssets, f.totalLiabilities, f.totalEquity, f.cashAndEquivalents);
          } else {
            row.push(f.operatingCashFlow, f.freeCashFlow);
          }
          return row;
        });

        return NextResponse.json({ headers: tableHeaders, data }, { headers });
      }

      // Get economic indicator for Excel
      case 'economic': {
        const indicator = searchParams.get('indicator');
        if (!indicator) {
          return NextResponse.json(
            { error: 'Indicator required' },
            { status: 400, headers }
          );
        }
        const limit = parseInt(searchParams.get('limit') || '12');
        const observations = await fred.getSeriesObservations(indicator, { limit });

        const data = observations.map((o) => [
          o.date.toISOString().split('T')[0],
          o.value,
        ]);

        return NextResponse.json(
          {
            headers: ['Date', observations[0]?.name || indicator],
            data,
          },
          { headers }
        );
      }

      // Get market movers for Excel
      case 'movers': {
        const type = (searchParams.get('type') || 'gainers') as 'gainers' | 'losers' | 'actives';
        const movers = await fmp.getMarketMovers(type);

        const data = movers.slice(0, 20).map((m) => [
          m.symbol,
          m.name,
          m.price,
          m.change,
          m.changePercent,
          m.volume,
        ]);

        return NextResponse.json(
          {
            headers: ['Symbol', 'Name', 'Price', 'Change', 'Change %', 'Volume'],
            data,
          },
          { headers }
        );
      }

      default:
        return NextResponse.json(
          {
            error: 'Invalid action',
            available: ['quote', 'quotes', 'financials', 'economic', 'movers'],
          },
          { status: 400, headers }
        );
    }
  } catch (error) {
    console.error('Excel API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
