'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  Bot,
  User,
  Loader2,
  ExternalLink,
  Sparkles,
  TrendingUp,
  FileText,
  BarChart3,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{
    type: string;
    title: string;
    url?: string;
    content?: string;
  }>;
  isStreaming?: boolean;
}

interface ToolCall {
  name: string;
  status: 'running' | 'complete';
}

const EXAMPLE_PROMPTS = [
  {
    icon: <TrendingUp className="w-4 h-4" />,
    title: 'Compare Apple and Microsoft',
    prompt: "Compare Apple and Microsoft's financials and recent performance",
  },
  {
    icon: <FileText className="w-4 h-4" />,
    title: "Tesla's Latest 10-K",
    prompt: "What are the key risks mentioned in Tesla's most recent 10-K filing?",
  },
  {
    icon: <BarChart3 className="w-4 h-4" />,
    title: 'Economic Outlook',
    prompt: 'What is the current state of the US economy? Show key indicators.',
  },
  {
    icon: <Sparkles className="w-4 h-4" />,
    title: 'Market Movers',
    prompt: "What are today's top gaining and losing stocks?",
  },
];

export default function ResearchPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setActiveToolCalls([]);

    // Add streaming assistant message
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', isStreaming: true },
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          chatId,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let citations: Message['citations'] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'text') {
                assistantContent += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: assistantContent,
                    isStreaming: true,
                  };
                  return updated;
                });
              } else if (data.type === 'tool_use') {
                setActiveToolCalls((prev) => [
                  ...prev,
                  { name: data.name, status: 'running' },
                ]);
              } else if (data.type === 'tool_result') {
                setActiveToolCalls((prev) =>
                  prev.map((tc) =>
                    tc.status === 'running'
                      ? { ...tc, status: 'complete' }
                      : tc
                  )
                );
              } else if (data.type === 'citations') {
                citations = data.citations;
              } else if (data.type === 'done') {
                if (data.chatId) setChatId(data.chatId);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: assistantContent,
                    citations,
                    isStreaming: false,
                  };
                  return updated;
                });
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Sorry, an error occurred. Please try again.',
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      setActiveToolCalls([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Research Chat</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions about markets, companies, and financial data
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto py-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">
                Welcome to Finsyt Research
              </h2>
              <p className="text-muted-foreground">
                I can help you research companies, analyze SEC filings, get
                market data, and answer complex financial questions.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example.title}
                  onClick={() => sendMessage(example.prompt)}
                  className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-muted text-left transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    {example.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{example.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {example.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-4',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}

                <div
                  className={cn(
                    'rounded-lg p-4 max-w-[85%]',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  {message.role === 'assistant' ? (
                    <>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content || '...'}
                        </ReactMarkdown>
                      </div>
                      {message.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                      )}
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Sources
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {message.citations.map((citation, j) => (
                              <a
                                key={j}
                                href={citation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs bg-background px-2 py-1 rounded border hover:bg-muted transition"
                              >
                                <Badge variant="outline" className="text-xs">
                                  {citation.type}
                                </Badge>
                                <span className="truncate max-w-[150px]">
                                  {citation.title}
                                </span>
                                {citation.url && (
                                  <ExternalLink className="w-3 h-3" />
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Tool calls indicator */}
            {activeToolCalls.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pl-12">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  Fetching data:{' '}
                  {activeToolCalls.map((tc) => tc.name).join(', ')}
                </span>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4 bg-background">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about companies, markets, filings..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Finsyt may produce inaccurate information. Always verify with
            primary sources.
          </p>
        </form>
      </div>
    </div>
  );
}
