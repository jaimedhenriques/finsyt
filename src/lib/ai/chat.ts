import Anthropic from '@anthropic-ai/sdk';
import { claudeTools, toolExecutors, ToolResult } from './tools';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{
    type: string;
    title: string;
    url?: string;
    content?: string;
  }>;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result: ToolResult;
  }>;
}

export interface ChatOptions {
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are Finsyt, an AI-powered financial research assistant. You help users with:

1. **Market Research**: Stock quotes, company profiles, historical prices, and market movers
2. **SEC Filings**: 10-K, 10-Q, 8-K filings and other SEC documents
3. **Financial Analysis**: Income statements, balance sheets, cash flow statements
4. **Economic Data**: GDP, unemployment, inflation, interest rates, and other FRED indicators
5. **News & Sentiment**: Latest financial news for stocks and sectors

Key principles:
- Always cite your sources when providing data
- Use tools to fetch real-time data rather than relying on training data
- Provide clear, professional analysis suitable for finance professionals
- When comparing companies, present data in structured tables
- For complex questions, break down the analysis into clear sections
- If data is unavailable, acknowledge this and suggest alternatives

You have access to real-time financial data from Yahoo Finance, Financial Modeling Prep, SEC EDGAR, and FRED. Always use these tools to provide accurate, current information.`;

export async function* streamChat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): AsyncGenerator<{
  type: 'text' | 'tool_use' | 'tool_result' | 'citations' | 'done';
  content?: string;
  toolCall?: { name: string; input: Record<string, unknown> };
  toolResult?: ToolResult;
  citations?: ChatMessage['citations'];
}> {
  const {
    model = 'claude-sonnet-4-20250514',
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  // Convert our messages to Anthropic format
  const anthropicMessages = messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  let continueLoop = true;
  const allCitations: ChatMessage['citations'] = [];

  while (continueLoop) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      tools: claudeTools as Anthropic.Tool[],
      messages: anthropicMessages,
    });

    // Process response content
    for (const block of response.content) {
      if (block.type === 'text') {
        yield { type: 'text', content: block.text };
      } else if (block.type === 'tool_use') {
        yield {
          type: 'tool_use',
          toolCall: {
            name: block.name,
            input: block.input as Record<string, unknown>,
          },
        };

        // Execute the tool
        const executor = toolExecutors[block.name];
        if (executor) {
          const result = await executor(block.input as Record<string, unknown>);

          yield {
            type: 'tool_result',
            toolResult: result,
          };

          // Collect citations
          if (result.citations) {
            allCitations.push(...result.citations);
          }

          // Add tool use and result to messages for continuation
          anthropicMessages.push({
            role: 'assistant',
            content: response.content as unknown as string,
          });
          anthropicMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              },
            ] as unknown as string,
          });
        }
      }
    }

    // Check if we need to continue (tool use case)
    if (response.stop_reason === 'tool_use') {
      continueLoop = true;
    } else {
      continueLoop = false;

      // Yield citations at the end
      if (allCitations.length > 0) {
        yield { type: 'citations', citations: allCitations };
      }

      yield { type: 'done' };
    }
  }
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatMessage> {
  let fullContent = '';
  let allCitations: ChatMessage['citations'] = [];
  const toolCalls: ChatMessage['toolCalls'] = [];

  for await (const chunk of streamChat(messages, options)) {
    if (chunk.type === 'text' && chunk.content) {
      fullContent += chunk.content;
    } else if (chunk.type === 'tool_use' && chunk.toolCall) {
      toolCalls.push({
        name: chunk.toolCall.name,
        input: chunk.toolCall.input,
        result: { success: false },
      });
    } else if (chunk.type === 'tool_result' && chunk.toolResult) {
      if (toolCalls.length > 0) {
        toolCalls[toolCalls.length - 1].result = chunk.toolResult;
      }
    } else if (chunk.type === 'citations' && chunk.citations) {
      allCitations = chunk.citations;
    }
  }

  return {
    role: 'assistant',
    content: fullContent,
    citations: allCitations,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// Generate a title for a chat based on the first message
export async function generateChatTitle(firstMessage: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: `Generate a short (3-6 word) title for a financial research chat that starts with this message. Only respond with the title, no quotes or punctuation:\n\n"${firstMessage}"`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text || 'New Research Chat';
}
