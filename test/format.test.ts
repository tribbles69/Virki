import { describe, expect, it } from 'vitest';
import { countdown, duration, shortNum } from '../src/ui/format';

describe('UI formatting', () => {
  it('shortens big numbers to fit the resource bar', () => {
    expect(shortNum(999.9)).toBe('999');
    expect(shortNum(12_345)).toBe('12,345');
    expect(shortNum(395_371)).toBe('395k');
    expect(shortNum(2_270_809)).toBe('2.27M');
    expect(shortNum(4_000_000)).toBe('4M');
    expect(shortNum(71_000_000)).toBe('71M');
    expect(shortNum(250_000_000)).toBe('250M');
  });

  it('counts down like a timer', () => {
    expect(countdown(0)).toBe('0s');
    expect(countdown(44_100)).toBe('45s');
    expect(countdown(5 * 60_000 + 5_000)).toBe('5:05');
    expect(countdown(3_723_000)).toBe('1:02:03');
    expect(countdown(52 * 3_600_000)).toBe('2d 4h');
  });

  it('describes build lengths', () => {
    expect(duration(6 * 60_000)).toBe('6 min');
    expect(duration(65 * 60_000)).toBe('1 h 5 min');
    expect(duration(4 * 3_600_000)).toBe('4 h');
    expect(duration(74 * 3_600_000)).toBe('3 days 2 h');
  });
});

describe('compactNum (resource bar)', () => {
  it('fits a phone-width box', async () => {
    const { compactNum } = await import('../src/ui/format');
    expect(compactNum(9_999)).toBe('9,999');
    expect(compactNum(19_999)).toBe('19.9k');
    expect(compactNum(20_000)).toBe('20k');
    expect(compactNum(395_371)).toBe('395k');
    expect(compactNum(2_270_809)).toBe('2.27M');
    expect(compactNum(71_000_000)).toBe('71M');
  });
});
