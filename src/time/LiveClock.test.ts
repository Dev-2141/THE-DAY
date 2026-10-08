import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClockText } from './clockText';
import { LiveClock } from './LiveClock';

describe('LiveClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('updates exactly on the minute and rolls the date over at midnight', () => {
    vi.setSystemTime(Date.UTC(2026, 9, 2, 18, 29, 58, 500)); // 23:59:58.5 in Kolkata
    const ticks: ClockText[] = [];
    const clock = new LiveClock({ timeZone: 'Asia/Kolkata', hour12: true, showSeconds: false, locale: 'en-GB' }, (t) =>
      ticks.push(t),
    );
    clock.start();
    expect(ticks).toEqual([{ time: '11:59 PM', date: 'FRIDAY · 02 OCTOBER 2026' }]);

    vi.advanceTimersByTime(1_400); // 23:59:59.9: not yet
    expect(ticks).toHaveLength(1);

    vi.advanceTimersByTime(200); // just past midnight
    expect(ticks).toHaveLength(2);
    expect(ticks[1]).toEqual({ time: '12:00 AM', date: 'SATURDAY · 03 OCTOBER 2026' });

    vi.advanceTimersByTime(60_000);
    expect(ticks).toHaveLength(3);
    expect(ticks[2]?.time).toBe('12:01 AM');
    clock.stop();
  });

  it('ticks every second when seconds are shown, without drifting', () => {
    vi.setSystemTime(Date.UTC(2026, 9, 2, 12, 0, 0, 700));
    const ticks: string[] = [];
    const clock = new LiveClock({ timeZone: 'UTC', hour12: false, showSeconds: true, locale: 'en-GB' }, (t) =>
      ticks.push(t.time),
    );
    clock.start();
    vi.advanceTimersByTime(10_000);
    expect(ticks.slice(0, 4)).toEqual(['12:00:00', '12:00:01', '12:00:02', '12:00:03']);
    expect(ticks.at(-1)).toBe('12:00:10');
    clock.stop();
    const count = ticks.length;
    vi.advanceTimersByTime(5_000);
    expect(ticks).toHaveLength(count);
  });

  it('applies a new zone at once', () => {
    vi.setSystemTime(Date.UTC(2026, 9, 2, 10, 0, 0));
    const ticks: string[] = [];
    const clock = new LiveClock({ timeZone: 'UTC', hour12: false, showSeconds: false, locale: 'en-GB' }, (t) =>
      ticks.push(t.time),
    );
    clock.start();
    clock.setFormat({ timeZone: 'Asia/Tokyo', hour12: false, showSeconds: false, locale: 'en-GB' });
    expect(ticks).toEqual(['10:00', '19:00']);
    clock.stop();
  });
});
