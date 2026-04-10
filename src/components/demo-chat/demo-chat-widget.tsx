'use client';

import { useState, useRef, useEffect } from 'react';
import { useDemoChat, SUGGESTED_QUESTIONS, DemoMessage } from '@/hooks/use-demo-chat';
import { DemoChatMessage, SuggestedQuestions } from './demo-message';
import { DemoInput } from './demo-input';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageCircle, X, Sparkles, TrendingUp } from 'lucide-react';

export function DemoChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    remainingQueries,
    isLimitReached,
    sendMessage,
  } = useDemoChat();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSendMessage = (content: string) => {
    setShowSuggestions(false);
    sendMessage(content);
  };

  const handleSuggestedQuestion = (question: string) => {
    setShowSuggestions(false);
    sendMessage(question);
  };

  return (
    <>
      {/* Chat Window */}
      <div
        className={cn(
          'fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px]',
          'transition-all duration-500 ease-out',
          isOpen
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        )}
      >
        <Card className="overflow-hidden shadow-2xl shadow-violet-500/10 border-violet-200/50 dark:border-violet-800/50">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-[length:200%_100%] animate-gradient p-4">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Finsyt AI</h3>
                  <p className="text-xs text-white/70 flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                    Ready to help
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="h-[380px] overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-background to-muted/20">
            {messages.map((message: DemoMessage) => (
              <div key={message.id}>
                <DemoChatMessage message={message} />
                {/* Show suggested questions after welcome message */}
                {message.id === 'welcome' && showSuggestions && (
                  <div className="ml-11">
                    <SuggestedQuestions
                      questions={SUGGESTED_QUESTIONS}
                      onSelect={handleSuggestedQuestion}
                      disabled={isLoading || isLimitReached}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Typing Indicator */}
            {isLoading && (
              <DemoChatMessage
                message={{
                  id: 'typing',
                  role: 'assistant',
                  content: '',
                  timestamp: new Date(),
                }}
                isTyping
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <DemoInput
            onSend={handleSendMessage}
            isLoading={isLoading}
            remainingQueries={remainingQueries}
            isLimitReached={isLimitReached}
          />
        </Card>
      </div>

      {/* Floating Chat Bubble */}
      <button
        onClick={() => setIsOpen((prev: boolean) => !prev)}
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'flex items-center justify-center',
          'h-14 w-14 rounded-full',
          'bg-gradient-to-br from-violet-600 to-indigo-600',
          'shadow-lg shadow-violet-500/30',
          'hover:shadow-xl hover:shadow-violet-500/40',
          'hover:scale-110',
          'transition-all duration-300 ease-out',
          'group'
        )}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {/* Pulse ring animation */}
        {!isOpen && (
          <>
            <span className="absolute inset-0 rounded-full bg-violet-500/50 animate-ping opacity-75" />
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600" />
          </>
        )}

        {/* Icon */}
        <div className="relative transition-transform duration-300">
          {isOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <MessageCircle className="h-6 w-6 text-white" />
          )}
        </div>

        {/* Tooltip */}
        {!isOpen && (
          <div
            className={cn(
              'absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg',
              'bg-foreground text-background text-sm font-medium whitespace-nowrap',
              'opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0',
              'transition-all duration-200 pointer-events-none'
            )}
          >
            Try Finsyt AI
            <span className="absolute top-full right-4 border-4 border-transparent border-t-foreground" />
          </div>
        )}
      </button>

      {/* Add gradient animation keyframes via style tag */}
      <style jsx global>{`
        @keyframes gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </>
  );
}
