import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { streamChat, generateChatTitle, ChatMessage } from '@/lib/ai/chat';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Check if database is configured
async function isDatabaseConfigured(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    let session = null;
    try {
      session = await auth();
    } catch {
      // Auth not configured - allow anonymous usage
    }

    const body = await request.json();
    const { messages, chatId } = body as {
      messages: ChatMessage[];
      chatId?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    // Only use database if configured
    const useDatabase = await isDatabaseConfigured();
    let chat: { id: string } | null = null;

    if (useDatabase && session?.user?.id) {
      // Create or get chat
      if (chatId) {
        chat = await db.chat.findUnique({
          where: { id: chatId, userId: session.user.id },
        });
      } else {
        // Generate title from first user message
        const firstUserMessage = messages.find((m) => m.role === 'user');
        const title = firstUserMessage
          ? await generateChatTitle(firstUserMessage.content)
          : 'New Chat';

        chat = await db.chat.create({
          data: {
            userId: session.user.id,
            title,
          },
        });
      }

      // Save user message
      if (chat) {
        const lastUserMessage = messages[messages.length - 1];
        if (lastUserMessage.role === 'user') {
          await db.message.create({
            data: {
              chatId: chat.id,
              role: 'USER',
              content: lastUserMessage.content,
            },
          });
        }

        // Record usage
        await db.usageRecord.create({
          data: {
            userId: session.user.id,
            type: 'CHAT_MESSAGE',
            quantity: 1,
          },
        });
      }
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        const citations: Array<{
          type: string;
          title: string;
          url?: string;
          content?: string;
        }> = [];

        try {
          for await (const chunk of streamChat(messages)) {
            if (chunk.type === 'text' && chunk.content) {
              fullContent += chunk.content;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`
                )
              );
            } else if (chunk.type === 'tool_use') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_use', ...chunk.toolCall })}\n\n`
                )
              );
            } else if (chunk.type === 'tool_result') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_result', result: chunk.toolResult })}\n\n`
                )
              );
            } else if (chunk.type === 'citations' && chunk.citations) {
              citations.push(...chunk.citations);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'citations', citations: chunk.citations })}\n\n`
                )
              );
            } else if (chunk.type === 'done') {
              // Save assistant message if using database
              if (useDatabase && chat) {
                const message = await db.message.create({
                  data: {
                    chatId: chat.id,
                    role: 'ASSISTANT',
                    content: fullContent,
                    metadata: { citations },
                  },
                });

                // Save citations
                if (citations.length > 0) {
                  await db.citation.createMany({
                    data: citations.map((c) => ({
                      messageId: message.id,
                      type: c.type as 'SEC_FILING' | 'NEWS_ARTICLE' | 'FINANCIAL_DATA' | 'RESEARCH_REPORT' | 'WEBSITE' | 'OTHER',
                      title: c.title,
                      url: c.url,
                      content: c.content,
                    })),
                  });
                }
              }

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'done', chatId: chat?.id || null })}\n\n`
                )
              );
            }
          }
        } catch (error) {
          console.error('Chat stream error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: 'An error occurred' })}\n\n`
            )
          );
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET chat history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (chatId) {
      // Get specific chat with messages
      const chat = await db.chat.findUnique({
        where: { id: chatId, userId: session.user.id },
        include: {
          messages: {
            include: {
              citations: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      return NextResponse.json(chat);
    } else {
      // Get all chats
      const chats = await db.chat.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });

      return NextResponse.json(chats);
    }
  } catch (error) {
    console.error('Get chats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
