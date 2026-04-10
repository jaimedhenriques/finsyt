import { NextRequest, NextResponse } from 'next/server';
import { secEdgar } from '@/lib/providers/sec-edgar';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const cik = searchParams.get('cik');
    const ticker = searchParams.get('ticker');
    const query = searchParams.get('q');
    const formTypes = searchParams.get('formTypes')?.split(',');
    const limit = parseInt(searchParams.get('limit') || '20');

    const identifier = cik || ticker;

    switch (action) {
      case 'company': {
        if (!identifier) {
          return NextResponse.json(
            { error: 'CIK or ticker is required' },
            { status: 400 }
          );
        }
        const filings = await secEdgar.getCompanyFilings(identifier, formTypes, limit);
        return NextResponse.json(filings);
      }

      case '10k': {
        if (!identifier) {
          return NextResponse.json(
            { error: 'CIK or ticker is required' },
            { status: 400 }
          );
        }
        const filings = await secEdgar.get10KFilings(identifier, limit);
        return NextResponse.json(filings);
      }

      case '10q': {
        if (!identifier) {
          return NextResponse.json(
            { error: 'CIK or ticker is required' },
            { status: 400 }
          );
        }
        const filings = await secEdgar.get10QFilings(identifier, limit);
        return NextResponse.json(filings);
      }

      case '8k': {
        if (!identifier) {
          return NextResponse.json(
            { error: 'CIK or ticker is required' },
            { status: 400 }
          );
        }
        const filings = await secEdgar.get8KFilings(identifier, limit);
        return NextResponse.json(filings);
      }

      case 'insider': {
        if (!identifier) {
          return NextResponse.json(
            { error: 'CIK or ticker is required' },
            { status: 400 }
          );
        }
        const filings = await secEdgar.getInsiderFilings(identifier, limit);
        return NextResponse.json(filings);
      }

      case 'search': {
        if (!query) {
          return NextResponse.json(
            { error: 'Query is required' },
            { status: 400 }
          );
        }
        const filings = await secEdgar.searchFilings(query, {
          formTypes,
          limit,
        });
        return NextResponse.json(filings);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: company, 10k, 10q, 8k, insider, search' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Filings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
