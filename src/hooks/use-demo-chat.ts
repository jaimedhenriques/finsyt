'use client';

import { useState, useCallback, useEffect } from 'react';
import { generateId } from '@/lib/utils';

export interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface DemoChatState {
  messages: DemoMessage[];
  isLoading: boolean;
  queryCount: number;
  isLimitReached: boolean;
}

const MAX_QUERIES = 3;
const SESSION_KEY = 'finsyt_demo_queries';

const WELCOME_MESSAGE: DemoMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `Welcome to Finsyt AI! I'm your intelligent financial research assistant. I can analyze stocks, explain market trends, evaluate investment opportunities, and provide data-driven insights.

Try asking me about any stock, market sector, or financial concept. Here are some questions to get started:`,
  timestamp: new Date(),
};

export const SUGGESTED_QUESTIONS = [
  'What makes NVIDIA a strong investment right now?',
  'How do rising interest rates affect tech stocks?',
  'Compare Apple and Microsoft as investments',
];

export function useDemoChat() {
  const [state, setState] = useState<DemoChatState>({
    messages: [WELCOME_MESSAGE],
    isLoading: false,
    queryCount: 0,
    isLimitReached: false,
  });

  // Load query count from session storage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        const count = parseInt(stored, 10);
        setState((prev: DemoChatState) => ({
          ...prev,
          queryCount: count,
          isLimitReached: count >= MAX_QUERIES,
        }));
      }
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (state.isLimitReached || state.isLoading) return;

    const userMessage: DemoMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setState((prev: DemoChatState) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
    }));

    try {
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: content }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      const newQueryCount = state.queryCount + 1;

      // Save to session storage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_KEY, String(newQueryCount));
      }

      const assistantMessage: DemoMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setState((prev: DemoChatState) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false,
        queryCount: newQueryCount,
        isLimitReached: newQueryCount >= MAX_QUERIES,
      }));
    } catch (error) {
      console.error('Demo chat error:', error);

      const errorMessage: DemoMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'I apologize, but I encountered an issue processing your request. Please try again.',
        timestamp: new Date(),
      };

      setState((prev: DemoChatState) => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        isLoading: false,
      }));
    }
  }, [state.isLimitReached, state.isLoading, state.queryCount]);

  const remainingQueries = MAX_QUERIES - state.queryCount;

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    queryCount: state.queryCount,
    isLimitReached: state.isLimitReached,
    remainingQueries,
    sendMessage,
  };
}
