import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ResearchQuery, ResearchResponse, Source } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const FINANCIAL_SYSTEM_PROMPT = `You are Finsyt, an expert AI financial research assistant. You provide accurate, well-sourced answers about stocks, markets, and financial data.

Guidelines:
- Always cite your sources when making claims about financial data
- Provide specific numbers, dates, and metrics when available
- Explain financial concepts clearly for non-experts
- When comparing companies, use consistent metrics
- Include relevant context about market conditions
- Flag any uncertainty or limitations in the data
- Suggest related questions the user might want to explore

Format your responses with:
- Clear structure using headers when appropriate
- Bullet points for lists of data
- Bold for key figures and important conclusions
- Tables for comparative data when helpful`;

export async function performResearch(
  query: ResearchQuery,
  provider: 'anthropic' | 'openai' = 'anthropic'
): Promise<ResearchResponse> {
  const userMessage = buildUserMessage(query);

  if (provider === 'anthropic') {
    return performAnthropicResearch(userMessage);
  } else {
    return performOpenAIResearch(userMessage);
  }
}

function buildUserMessage(query: ResearchQuery): string {
  let message = query.query;

  if (query.symbols && query.symbols.length > 0) {
    message += `\n\nFocus on these symbols: ${query.symbols.join(', ')}`;
  }

  if (query.context) {
    message += `\n\nAdditional context: ${query.context}`;
  }

  const dataTypes: string[] = [];
  if (query.includeNews) dataTypes.push('recent news');
  if (query.includeSECFilings) dataTypes.push('SEC filings');
  if (query.includeAnalystReports) dataTypes.push('analyst reports');

  if (dataTypes.length > 0) {
    message += `\n\nInclude information from: ${dataTypes.join(', ')}`;
  }

  return message;
}

async function performAnthropicResearch(userMessage: string): Promise<ResearchResponse> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: FINANCIAL_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const content = response.content[0];
  const answer = content.type === 'text' ? content.text : '';

  // Extract sources mentioned in the response
  const sources = extractSources(answer);

  // Generate related questions
  const relatedQuestions = generateRelatedQuestions(userMessage);

  return {
    answer,
    sources,
    relatedQuestions,
    tokens: response.usage.input_tokens + response.usage.output_tokens,
  };
}

async function performOpenAIResearch(userMessage: string): Promise<ResearchResponse> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: FINANCIAL_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const answer = response.choices[0]?.message?.content || '';
  const sources = extractSources(answer);
  const relatedQuestions = generateRelatedQuestions(userMessage);

  return {
    answer,
    sources,
    relatedQuestions,
    tokens: response.usage?.total_tokens || 0,
  };
}

function extractSources(text: string): Source[] {
  const sources: Source[] = [];

  // Look for SEC filing references
  const secPatterns = [
    /10-K/gi,
    /10-Q/gi,
    /8-K/gi,
    /S-1/gi,
    /DEF 14A/gi,
  ];

  secPatterns.forEach((pattern) => {
    if (pattern.test(text)) {
      sources.push({
        title: `SEC Filing (${pattern.source})`,
        type: 'sec_filing',
      });
    }
  });

  // Look for earnings call mentions
  if (/earnings call|quarterly call|investor call/i.test(text)) {
    sources.push({
      title: 'Earnings Call Transcript',
      type: 'earnings_call',
    });
  }

  // If no specific sources found, add general data source
  if (sources.length === 0) {
    sources.push({
      title: 'Financial Data Analysis',
      type: 'data',
    });
  }

  return sources;
}

function generateRelatedQuestions(originalQuery: string): string[] {
  // Generate contextually relevant follow-up questions
  const questions: string[] = [];

  if (/revenue|growth|sales/i.test(originalQuery)) {
    questions.push('What are the main revenue drivers?');
    questions.push('How does this compare to industry peers?');
  }

  if (/stock|price|valuation/i.test(originalQuery)) {
    questions.push('What do analysts think about the current valuation?');
    questions.push('What are the key risks to watch?');
  }

  if (/dividend/i.test(originalQuery)) {
    questions.push('Is the dividend sustainable?');
    questions.push('How does the payout ratio compare historically?');
  }

  // Add generic questions if none specific
  if (questions.length === 0) {
    questions.push('What are the key financial metrics?');
    questions.push('What are the main risks and opportunities?');
    questions.push('How does this compare to competitors?');
  }

  return questions.slice(0, 3);
}

export async function streamResearch(
  query: ResearchQuery,
  onChunk: (text: string) => void
): Promise<void> {
  const userMessage = buildUserMessage(query);

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: FINANCIAL_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      onChunk(event.delta.text);
    }
  }
}
