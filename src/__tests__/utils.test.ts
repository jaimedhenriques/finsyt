import { describe, it, expect } from 'vitest';
import {
  cn,
  formatCurrency,
  formatPercent,
  formatVolume,
  formatMarketCap,
} from '../lib/utils';

describe('utils', () => {
  describe('cn (class names)', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'active', false && 'disabled')).toBe(
        'base active'
      );
    });

    it('should handle tailwind merge', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });
  });

  describe('formatCurrency', () => {
    it('should format positive numbers', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format negative numbers', () => {
      expect(formatCurrency(-500)).toBe('-$500.00');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });
  });

  describe('formatPercent', () => {
    it('should format positive percent with + sign', () => {
      expect(formatPercent(5.5)).toBe('+5.50%');
    });

    it('should format negative percent', () => {
      expect(formatPercent(-3.2)).toBe('-3.20%');
    });

    it('should format zero', () => {
      expect(formatPercent(0)).toBe('+0.00%');
    });
  });

  describe('formatVolume', () => {
    it('should format millions', () => {
      expect(formatVolume(5000000)).toBe('5.00M');
    });

    it('should format billions', () => {
      expect(formatVolume(2500000000)).toBe('2.50B');
    });

    it('should format thousands', () => {
      expect(formatVolume(50000)).toBe('50.00K');
    });

    it('should format small numbers', () => {
      expect(formatVolume(500)).toBe('500');
    });
  });

  describe('formatMarketCap', () => {
    it('should format trillions', () => {
      expect(formatMarketCap(3000000000000)).toBe('$3.00T');
    });

    it('should format billions', () => {
      expect(formatMarketCap(250000000000)).toBe('$250.00B');
    });

    it('should format millions', () => {
      expect(formatMarketCap(500000000)).toBe('$500.00M');
    });
  });
});
