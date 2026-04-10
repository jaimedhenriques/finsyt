import { NextRequest, NextResponse } from 'next/server';
import { performResearch } from '@/services/ai';
import { ResearchQuery } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, context, symbols, includeNews, includeSECFilings, includeAnalystReports } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const researchQuery: ResearchQuery = {
      query,
      context,
      symbols,
      includeNews,
      includeSECFilings,
      includeAnalystReports,
    };

    const result = await performResearch(researchQuery);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Research API error:', error);
    return NextResponse.json(
      { error: 'Failed to process research query' },
      { status: 500 }
    );
  }
}
