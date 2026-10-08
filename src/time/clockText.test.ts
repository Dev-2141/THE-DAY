import { describe, expect, it } from 'vitest';
import { formatClock, msToNextBoundary, resolveTimeZone, timeSamples, type ClockFormat } from './clockText';

const at = (iso: string): Date => new Date(iso);
const fmt = (timeZone: string, hour12 = true, showSeconds = false): ClockFormat => ({
  timeZone,
  hour12,
  showSeconds,
  locale: 'en-GB',
});

describe('formatClock', () => {
  it('matches the default formats of the brief', () => {
    expect(formatClock(at('2026-10-02T16:11:00Z'), fmt('Asia/Kolkata'))).toEqual({
      time: '09:41 PM',
      date: 'FRIDAY · 02 OCTOBER 2026',
    });
  });

  it('shows 24-hour time and seconds when asked', () => {
    expect(formatClock(at('2026-10-02T16:11:07Z'), fmt('Asia/Kolkata', false, true)).time).toBe('21:41:07');
    expect(formatClock(at('2026-10-02T16:11:07Z'), fmt('Asia/Kolkata', true, true)).time).toBe('09:41:07 PM');
  });

  it('follows the configured zone, including half-hour and +14 offsets', () => {
    const moment = at('2026-10-02T10:00:00Z');
    expect(formatClock(moment, fmt('Europe/London', false)).time).toBe('11:00');
    expect(formatClock(moment, fmt('Asia/Kolkata', false)).time).toBe('15:30');
    expect(formatClock(moment, fmt('America/New_York', false)).time).toBe('06:00');
    expect(formatClock(moment, fmt('Pacific/Kiritimati', false))).toEqual({
      time: '00:00',
      date: 'SATURDAY · 03 OCTOBER 2026',
    });
  });

  it('jumps forward an hour when daylight saving starts (New York, 8 March 2026)', () => {
    expect(formatClock(at('2026-03-08T06:59:00Z'), fmt('America/New_York')).time).toBe('01:59 AM');
    expect(formatClock(at('2026-03-08T07:00:00Z'), fmt('America/New_York')).time).toBe('03:00 AM');
  });

  it('repeats an hour when daylight saving ends (New York, 1 November 2026)', () => {
    expect(formatClock(at('2026-11-01T05:30:00Z'), fmt('America/New_York')).time).toBe('01:30 AM');
    expect(formatClock(at('2026-11-01T06:30:00Z'), fmt('America/New_York')).time).toBe('01:30 AM');
    expect(formatClock(at('2026-11-01T07:30:00Z'), fmt('America/New_York')).time).toBe('02:30 AM');
  });

  it('handles the European change (London, 29 March 2026)', () => {
    expect(formatClock(at('2026-03-29T00:59:00Z'), fmt('Europe/London', false)).time).toBe('00:59');
    expect(formatClock(at('2026-03-29T01:00:00Z'), fmt('Europe/London', false)).time).toBe('02:00');
  });

  it('rolls the date over at midnight in the chosen zone, not in UTC', () => {
    const before = formatClock(at('2026-10-02T18:29:59.999Z'), fmt('Asia/Kolkata'));
    const after = formatClock(at('2026-10-02T18:30:00.000Z'), fmt('Asia/Kolkata'));
    expect(before).toEqual({ time: '11:59 PM', date: 'FRIDAY · 02 OCTOBER 2026' });
    expect(after).toEqual({ time: '12:00 AM', date: 'SATURDAY · 03 OCTOBER 2026' });
  });

  it('rolls over months and years', () => {
    expect(formatClock(at('2026-12-31T23:00:00Z'), fmt('Europe/Berlin', false))).toEqual({
      time: '00:00',
      date: 'FRIDAY · 01 JANUARY 2027',
    });
  });

  it('falls back to the device zone for an unknown zone instead of failing', () => {
    expect(resolveTimeZone('Mars/Olympus_Mons')).toBeUndefined();
    expect(resolveTimeZone('')).toBeUndefined();
    expect(resolveTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(() => formatClock(new Date(), fmt('Mars/Olympus_Mons'))).not.toThrow();
  });
});

describe('boundaries', () => {
  it('waits exactly until the next minute or second', () => {
    const now = Date.UTC(2026, 9, 2, 12, 0, 30, 500);
    expect(msToNextBoundary(now, false)).toBe(29_500);
    expect(msToNextBoundary(now, true)).toBe(500);
    expect(msToNextBoundary(Date.UTC(2026, 9, 2, 12, 1, 0, 0), false)).toBe(60_000);
  });

  it('keeps the time line a fixed length all day, so it never jitters', () => {
    for (const format of [fmt('Asia/Kolkata'), fmt('Asia/Kolkata', false), fmt('Asia/Kolkata', true, true)]) {
      const lengths = new Set(timeSamples(format).map((s) => s.length));
      expect(lengths.size).toBe(1);
    }
  });
});
