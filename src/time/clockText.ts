/**
 * Live time and date text. Pure functions, so they can be tested without a
 * screen (step 11 adds the tests).
 */

export interface ClockFormat {
  /** IANA zone such as 'Asia/Kolkata'. Empty uses the device's zone. */
  readonly timeZone: string;
  readonly hour12: boolean;
  readonly showSeconds: boolean;
  readonly locale: string;
}

export interface ClockText {
  /** e.g. '09:41 PM' */
  readonly time: string;
  /** e.g. 'FRIDAY · 02 OCTOBER 2026' */
  readonly date: string;
}

/** The zone to format in, or undefined for the device's own zone. */
export function resolveTimeZone(timeZone: string): string | undefined {
  if (timeZone === '') return undefined;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return timeZone;
  } catch {
    console.warn(`[clock] Unknown time zone "${timeZone}"; using the device's zone.`);
    return undefined;
  }
}

interface Formatters {
  readonly time: Intl.DateTimeFormat;
  readonly date: Intl.DateTimeFormat;
}

const cache = new Map<string, Formatters>();

function formatters(format: ClockFormat): Formatters {
  const key = `${format.timeZone}|${format.hour12}|${format.showSeconds}|${format.locale}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const timeZone = resolveTimeZone(format.timeZone);
  const zone: Intl.DateTimeFormatOptions = timeZone === undefined ? {} : { timeZone };
  const created: Formatters = {
    time: new Intl.DateTimeFormat(format.locale, {
      ...zone,
      hour: '2-digit',
      minute: '2-digit',
      ...(format.showSeconds ? { second: '2-digit' } : {}),
      hourCycle: format.hour12 ? 'h12' : 'h23',
      numberingSystem: 'latn',
    }),
    date: new Intl.DateTimeFormat(format.locale, {
      ...zone,
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      numberingSystem: 'latn',
    }),
  };
  cache.set(key, created);
  return created;
}

function part(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

export function formatClock(date: Date, format: ClockFormat): ClockText {
  const f = formatters(format);
  const t = f.time.formatToParts(date);
  const clock = [part(t, 'hour').padStart(2, '0'), part(t, 'minute').padStart(2, '0')];
  if (format.showSeconds) clock.push(part(t, 'second').padStart(2, '0'));
  const period = format.hour12 ? ` ${part(t, 'dayPeriod')}` : '';

  const d = f.date.formatToParts(date);
  const dateText = `${part(d, 'weekday')} · ${part(d, 'day').padStart(2, '0')} ${part(d, 'month')} ${part(d, 'year')}`;

  return {
    time: `${clock.join(':')}${period}`.toLocaleUpperCase(format.locale),
    date: dateText.toLocaleUpperCase(format.locale),
  };
}

/**
 * Milliseconds until the next second or minute boundary. All current time
 * zones are offset from UTC by whole minutes, so UTC boundaries are local
 * boundaries too.
 */
export function msToNextBoundary(nowMs: number, showSeconds: boolean): number {
  const unit = showSeconds ? 1000 : 60_000;
  return unit - (nowMs % unit);
}

/**
 * Every time string the format can produce over a day, at one minute of each
 * hour. Used to size fixed-width cells so the time line never changes width.
 */
export function timeSamples(format: ClockFormat): readonly string[] {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: 48 }, (_, i) => formatClock(new Date(start + i * 30 * 60_000), format).time);
}
