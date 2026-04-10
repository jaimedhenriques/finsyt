import { NextRequest, NextResponse } from 'next/server';
import { fred, FRED_SERIES } from '@/lib/providers/fred';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const seriesId = searchParams.get('series');
    const limit = parseInt(searchParams.get('limit') || '12');

    switch (action) {
      case 'series': {
        if (!seriesId) {
          return NextResponse.json(
            { error: 'Series ID is required' },
            { status: 400 }
          );
        }
        const data = await fred.getSeriesObservations(seriesId, { limit });
        return NextResponse.json(data);
      }

      case 'latest': {
        if (!seriesId) {
          return NextResponse.json(
            { error: 'Series ID is required' },
            { status: 400 }
          );
        }
        const indicator = await fred.getLatestValue(seriesId);
        return NextResponse.json(indicator);
      }

      case 'dashboard': {
        const dashboard = await fred.getEconomicDashboard();
        return NextResponse.json(dashboard);
      }

      case 'gdp': {
        const gdp = await fred.getGDP();
        return NextResponse.json(gdp);
      }

      case 'unemployment': {
        const unemployment = await fred.getUnemploymentRate();
        return NextResponse.json(unemployment);
      }

      case 'inflation': {
        const inflation = await fred.getInflation();
        return NextResponse.json(inflation);
      }

      case 'fed-rate': {
        const fedRate = await fred.getFedFundsRate();
        return NextResponse.json(fedRate);
      }

      case 'treasury': {
        const treasury = await fred.get10YearTreasury();
        return NextResponse.json(treasury);
      }

      case 'yield-curve': {
        const yieldCurve = await fred.getYieldCurve();
        return NextResponse.json(yieldCurve);
      }

      case 'sentiment': {
        const sentiment = await fred.getConsumerSentiment();
        return NextResponse.json(sentiment);
      }

      case 'search': {
        const query = searchParams.get('q');
        if (!query) {
          return NextResponse.json(
            { error: 'Query is required' },
            { status: 400 }
          );
        }
        const results = await fred.searchSeries(query, limit);
        return NextResponse.json(results);
      }

      case 'available': {
        // Return list of common series
        return NextResponse.json({
          series: FRED_SERIES,
          categories: {
            'GDP & Growth': ['GDP', 'GDPC1', 'A191RL1Q225SBEA'],
            'Employment': ['UNRATE', 'PAYEMS', 'ICSA'],
            'Inflation': ['CPIAUCSL', 'PCEPI', 'CPILFESL'],
            'Interest Rates': ['FEDFUNDS', 'DGS10', 'DGS2', 'T10Y2Y', 'MORTGAGE30US'],
            'Money Supply': ['M2SL', 'WALCL'],
            'Housing': ['HOUST', 'CSUSHPINSA', 'PERMIT'],
            'Consumer': ['UMCSENT', 'RSXFS', 'PCE'],
            'Business': ['INDPRO', 'DGORDER', 'BUSINV'],
          },
        });
      }

      default:
        return NextResponse.json(
          {
            error: 'Invalid action',
            available: [
              'series',
              'latest',
              'dashboard',
              'gdp',
              'unemployment',
              'inflation',
              'fed-rate',
              'treasury',
              'yield-curve',
              'sentiment',
              'search',
              'available',
            ],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Economic API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
