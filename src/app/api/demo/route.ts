import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const MAX_QUERIES_PER_SESSION = 3;

// Simple in-memory rate limiting (in production, use Redis or similar)
const sessionQueries = new Map<string, { count: number; timestamp: number }>();

// Clean up old sessions every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessionQueries.entries()) {
    if (now - value.timestamp > SESSION_TTL) {
      sessionQueries.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

const SYSTEM_PROMPT = `You are Finsyt AI, an expert financial research assistant. Your role is to provide impressive, insightful, and actionable financial analysis to potential users trying a demo of the platform.

IMPORTANT GUIDELINES:
- Keep responses concise but impactful (150-250 words max)
- Lead with the most compelling insight or conclusion
- Use specific numbers, metrics, and data points when discussing stocks
- Include both bullish and bearish perspectives for balance
- Mention relevant technical indicators or fundamental metrics
- End with a clear, actionable takeaway

RESPONSE STYLE:
- Professional yet accessible tone
- Use bullet points for key metrics
- Bold important numbers or conclusions (using **markdown**)
- Structure responses clearly with a hook, analysis, and conclusion

TOPICS YOU EXCEL AT:
- Stock analysis and valuations
- Market trends and sector analysis
- Technical analysis patterns
- Fundamental analysis (P/E, revenue growth, margins)
- Macroeconomic factors (interest rates, inflation, GDP)
- Investment strategy recommendations
- Risk assessment and portfolio considerations

Remember: You're demonstrating the power of Finsyt AI to convert visitors into paying users. Make every response showcase your analytical capabilities and financial expertise.`;

function getSessionId(request: NextRequest): string {
  // Use a combination of IP and user-agent for session identification
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Create a simple hash
  const sessionString = `${ip}-${userAgent}`;
  let hash = 0;
  for (let i = 0; i < sessionString.length; i++) {
    const char = sessionString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    if (query.length > 500) {
      return NextResponse.json(
        { error: 'Query too long. Please keep it under 500 characters.' },
        { status: 400 }
      );
    }

    // Rate limiting
    const sessionId = getSessionId(request);
    const sessionData = sessionQueries.get(sessionId) || { count: 0, timestamp: Date.now() };

    // Reset if session is old
    if (Date.now() - sessionData.timestamp > SESSION_TTL) {
      sessionData.count = 0;
      sessionData.timestamp = Date.now();
    }

    if (sessionData.count >= MAX_QUERIES_PER_SESSION) {
      return NextResponse.json(
        {
          error: 'Demo limit reached',
          message: 'You have used all 3 free demo queries. Sign up for unlimited access.',
          limitReached: true
        },
        { status: 429 }
      );
    }

    // Increment query count
    sessionData.count += 1;
    sessionData.timestamp = Date.now();
    sessionQueries.set(sessionId, sessionData);

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
    });

    // Extract text content from response
    const textContent = message.content.find((block: { type: string }) => block.type === 'text');
    const responseText = textContent && 'text' in textContent ? textContent.text : 'I apologize, but I could not generate a response.';

    return NextResponse.json({
      response: responseText,
      queriesRemaining: MAX_QUERIES_PER_SESSION - sessionData.count,
    });
  } catch (error) {
    console.error('Demo API error:', error);

    // Handle specific Anthropic errors
    if (error instanceof Anthropic.APIError) {
      if ((error as Anthropic.APIError).status === 429) {
        return NextResponse.json(
          { error: 'Service is temporarily busy. Please try again in a moment.' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to process your request. Please try again.' },
      { status: 500 }
    );
  }
}
