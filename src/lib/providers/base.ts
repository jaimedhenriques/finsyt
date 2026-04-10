import { ProviderConfig, ProviderError } from './types';

export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected name: string;

  constructor(name: string, config: ProviderConfig = {}) {
    this.name = name;
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      ...config,
    };
  }

  protected async fetch<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw this.createError(
          `HTTP ${response.status}`,
          `Request failed with status ${response.status}`,
          response.status >= 500
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError('TIMEOUT', 'Request timed out', true);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    let lastError: Error | null = null;
    const maxAttempts = this.config.retryAttempts ?? 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.fetch<T>(url, options);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on non-retryable errors
        if ((error as ProviderError).retryable === false) {
          throw error;
        }

        // Exponential backoff
        if (attempt < maxAttempts) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }

  protected createError(
    code: string,
    message: string,
    retryable: boolean = false
  ): ProviderError {
    return {
      code,
      message,
      provider: this.name,
      retryable,
    };
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
