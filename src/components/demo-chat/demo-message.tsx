'use client';

import { cn } from '@/lib/utils';
import { DemoMessage } from '@/hooks/use-demo-chat';
import { Bot, User } from 'lucide-react';

interface DemoMessageProps {
  message: DemoMessage;
  isTyping?: boolean;
}

export function DemoChatMessage({ message, isTyping }: DemoMessageProps) {
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={cn(
        'flex gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
        isAssistant ? 'flex-row' : 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isAssistant
            ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25'
            : 'bg-gradient-to-br from-slate-600 to-slate-700 text-white'
        )}
      >
        {isAssistant ? (
          <Bot className="h-4 w-4" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>

      {/* Message Bubble */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isAssistant
            ? 'bg-muted/50 text-foreground rounded-tl-sm'
            : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-tr-sm shadow-lg shadow-violet-500/20'
        )}
      >
        {isTyping ? (
          <TypingIndicator />
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-2 w-2 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-2 w-2 rounded-full bg-current opacity-60 animate-bounce" />
    </div>
  );
}

interface SuggestedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export function SuggestedQuestions({
  questions,
  onSelect,
  disabled,
}: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      {questions.map((question, index) => (
        <button
          key={index}
          onClick={() => onSelect(question)}
          disabled={disabled}
          className={cn(
            'text-left text-sm px-3 py-2 rounded-lg border border-violet-200/50 dark:border-violet-800/50',
            'bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30',
            'text-violet-700 dark:text-violet-300',
            'hover:from-violet-100 hover:to-indigo-100 dark:hover:from-violet-900/40 dark:hover:to-indigo-900/40',
            'hover:border-violet-300 dark:hover:border-violet-700',
            'transition-all duration-200 hover:shadow-sm hover:shadow-violet-200/50 dark:hover:shadow-violet-900/50',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-violet-50 disabled:hover:to-indigo-50',
            'animate-in fade-in-0 slide-in-from-left-2 duration-300',
            index === 1 && '[animation-delay:100ms]',
            index === 2 && '[animation-delay:200ms]'
          )}
          style={{ animationFillMode: 'backwards' }}
        >
          {question}
        </button>
      ))}
    </div>
  );
}
