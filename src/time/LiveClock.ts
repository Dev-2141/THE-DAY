import { formatClock, msToNextBoundary, type ClockFormat, type ClockText } from './clockText';

/**
 * Calls back with fresh time and date text exactly on each minute (or second)
 * boundary. Each tick schedules the next one from the real clock, so it never
 * drifts, and it re-syncs when the app comes back from the background.
 */
export class LiveClock {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private format: ClockFormat,
    private readonly onTick: (text: ClockText) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.resync);
    this.tick();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.resync);
  }

  setFormat(format: ClockFormat): void {
    this.format = format;
    if (this.running) this.resync();
  }

  private readonly resync = (): void => {
    clearTimeout(this.timer);
    this.tick();
  };

  private readonly tick = (): void => {
    this.onTick(formatClock(new Date(), this.format));
    // A couple of milliseconds past the boundary, so the new value is in.
    this.timer = setTimeout(this.tick, msToNextBoundary(Date.now(), this.format.showSeconds) + 2);
  };
}
