'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Send, Sparkles } from 'lucide-react';

interface DemoInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  remainingQueries: number;
  isLimitReached: boolean;
}

export function DemoInput({
  onSend,
  disabled,
  isLoading,
  remainingQueries,
  isLimitReached,
}: DemoInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled && !isLoading && !isLimitReached) {
      onSend(value.trim());
      setValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (isLimitReached) {
    return (
      <div className="border-t border-border/50 bg-gradient-to-r from-violet-50/80 to-indigo-50/80 dark:from-violet-950/40 dark:to-indigo-950/40 p-4">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-5 w-5" />
            <span className="font-semibold">Demo Limit Reached</span>
          </div>
          <p className="text-sm text-muted-foreground">
            You've used all 3 free demo queries. Sign up for unlimited access to Finsyt AI.
          </p>
          <Button
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/30"
            size="lg"
          >
            Get Unlimited Access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border/50 bg-background/95 backdrop-blur-sm p-3"
    >
      {/* Remaining queries indicator */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-muted-foreground">
          {remainingQueries} free {remainingQueries === 1 ? 'query' : 'queries'} remaining
        </span>
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 w-6 rounded-full transition-colors duration-300',
                i <= remainingQueries
                  ? 'bg-gradient-to-r from-violet-500 to-indigo-500'
                  : 'bg-muted'
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about any stock, market, or financial topic..."
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-12',
              'text-sm ring-offset-background placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:border-violet-400',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200',
              'max-h-[120px]'
            )}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!value.trim() || disabled || isLoading}
          className={cn(
            'h-11 w-11 rounded-xl shrink-0',
            'bg-gradient-to-r from-violet-600 to-indigo-600',
            'hover:from-violet-700 hover:to-indigo-700',
            'shadow-lg shadow-violet-500/25',
            'transition-all duration-300',
            'disabled:opacity-50 disabled:shadow-none',
            value.trim() && !disabled && !isLoading && 'hover:scale-105 hover:shadow-xl hover:shadow-violet-500/30'
          )}
        >
          <Send className={cn('h-4 w-4', isLoading && 'animate-pulse')} />
        </Button>
      </div>
    </form>
  );
}
