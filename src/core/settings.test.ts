import { describe, expect, it } from 'vitest';
import { defaultSettings, effectiveMotion, effectiveQuality, sanitizeSettings, SettingsStore } from './settings';

describe('settings', () => {
  it('keeps only well-formed saved values', () => {
    const defaults = defaultSettings();
    expect(sanitizeSettings('garbage')).toEqual(defaults);
    expect(
      sanitizeSettings({ timeZone: 'Asia/Tokyo', hour12: 'yes', motion: 7, quality: 'insane', measuredQuality: 'low', sound: true }),
    ).toEqual({ ...defaults, timeZone: 'Asia/Tokyo', measuredQuality: 'low', sound: true });
  });

  it('picks the measured level under auto, the chosen one otherwise', () => {
    const base = defaultSettings();
    expect(effectiveQuality({ ...base, quality: 'auto', measuredQuality: 'medium' })).toBe('medium');
    expect(effectiveQuality({ ...base, quality: 'low', measuredQuality: 'ultra' })).toBe('low');
  });

  it('caps motion in the calm mode', () => {
    const base = { ...defaultSettings(), motion: 1 };
    expect(effectiveMotion(base, false)).toBe(1);
    expect(effectiveMotion(base, true)).toBeLessThan(0.2);
  });

  it('notifies listeners only on real changes', () => {
    const store = new SettingsStore(defaultSettings());
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ hour12: !store.get().hour12 });
    store.set({ hour12: store.get().hour12 });
    expect(calls).toBe(1);
  });
});
