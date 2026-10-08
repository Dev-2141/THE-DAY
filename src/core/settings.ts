/**
 * The user's settings: what the glass settings panel changes, remembered
 * between launches. Defaults come from the configuration file; the store
 * only keeps what the user changed.
 *
 * Saved in localStorage, which persists in the browser, in the Windows app
 * (WebView2) and in the Android app (WebView). If storage is unavailable
 * the settings still work for the session.
 */
import { config, type QualityLevel } from '../config/config';

export type QualityChoice = QualityLevel | 'auto';

export interface Settings {
  /** IANA zone; empty uses the device's zone. */
  readonly timeZone: string;
  readonly hour12: boolean;
  readonly showSeconds: boolean;
  /** How lively the scene is, 0 (nearly still) .. 1 (as designed). */
  readonly motion: number;
  readonly quality: QualityChoice;
  /** The level picked by measuring this device, once, on first launch. */
  readonly measuredQuality: QualityLevel | null;
  readonly sound: boolean;
}

const STORAGE_KEY = 'the-day.settings.v1';
const QUALITY_CHOICES: readonly QualityChoice[] = ['auto', 'low', 'medium', 'high', 'ultra'];

export function defaultSettings(): Settings {
  return {
    timeZone: config.time.timeZone,
    hour12: config.time.hour12,
    showSeconds: config.time.showSeconds,
    motion: config.motion.default,
    quality: config.quality.initial,
    measuredQuality: null,
    sound: config.sound.enabled,
  };
}

function isQuality(value: unknown): value is QualityLevel {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'ultra';
}

/** Keep only well-formed saved values, so an old or edited save can never break the app. */
export function sanitizeSettings(saved: unknown, defaults: Settings = defaultSettings()): Settings {
  if (typeof saved !== 'object' || saved === null) return defaults;
  const s = saved as Record<string, unknown>;
  const pick = <T>(key: keyof Settings, ok: (v: unknown) => v is T, fallback: T): T => {
    const value = s[key];
    return ok(value) ? value : fallback;
  };
  const isString = (v: unknown): v is string => typeof v === 'string';
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
  const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  const isChoice = (v: unknown): v is QualityChoice => QUALITY_CHOICES.includes(v as QualityChoice);
  const isMeasured = (v: unknown): v is QualityLevel | null => v === null || isQuality(v);
  return {
    timeZone: pick('timeZone', isString, defaults.timeZone),
    hour12: pick('hour12', isBool, defaults.hour12),
    showSeconds: pick('showSeconds', isBool, defaults.showSeconds),
    motion: pick('motion', isUnit, defaults.motion),
    quality: pick('quality', isChoice, defaults.quality),
    measuredQuality: pick('measuredQuality', isMeasured, defaults.measuredQuality),
    sound: pick('sound', isBool, defaults.sound),
  };
}

function readStored(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? defaultSettings() : sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

function writeStored(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the settings still apply for this session.
  }
}

type Listener = () => void;

export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<Listener>();

  constructor(initial: Settings = readStored()) {
    this.current = initial;
  }

  // Arrow properties, so React's useSyncExternalStore can take them unbound.
  readonly get = (): Settings => this.current;

  set(change: Partial<Settings>): void {
    const next = sanitizeSettings({ ...this.current, ...change }, this.current);
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.current = next;
    writeStored(next);
    for (const listener of this.listeners) listener();
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const settingsStore = new SettingsStore();

/** The quality level in effect: the user's choice, or the measured one under 'auto'. */
export function effectiveQuality(settings: Settings): QualityLevel {
  if (settings.quality !== 'auto') return settings.quality;
  return settings.measuredQuality ?? config.quality.fallback;
}

/**
 * The system's reduce-motion setting. While it is on, the scene runs in the
 * calm mode: very slow clouds and beam, grass that barely moves, no parallax.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The motion intensity in effect, capped by the calm mode when the system asks for less motion. */
export function effectiveMotion(settings: Settings, reduced: boolean): number {
  return reduced ? Math.min(settings.motion, config.motion.calm) : settings.motion;
}
