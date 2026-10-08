import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { QualityLevel } from '../config/config';
import { settingsStore, type QualityChoice, type Settings } from '../core/settings';
import type { ElementId } from '../hub/elementIds';
import { CloseIcon, SettingsIcon } from './glass/icons';
import { useGlass } from './glass/useGlass';
import { usePressFeedback } from './glass/usePressFeedback';
import { useHub, useHubGestures } from './HubContext';
import { interfaceStore } from './interfaceStore';

/** The closed button's size, and the open panel's widest size, in px. */
const BUTTON = 48;
const PANEL_WIDTH = 344;

const QUALITY: readonly { readonly value: QualityChoice; readonly label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
];

const QUALITY_NAMES: Readonly<Record<QualityLevel, string>> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function allZones(): readonly string[] {
  const supported = (Intl as { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf;
  const zones = supported?.('timeZone') ?? [];
  return zones.length > 0 ? zones : ['UTC', 'Europe/London', 'Asia/Kolkata', 'America/New_York', 'Asia/Tokyo'];
}

function motionWord(value: number): string {
  if (value <= 0.05) return 'Still';
  if (value <= 0.3) return 'Calm';
  if (value <= 0.7) return 'Gentle';
  return 'Full';
}

interface SettingsMorphProps {
  readonly open: boolean;
  readonly settings: Settings;
  /** The system asks for reduced motion: the calm mode caps the motion setting. */
  readonly reducedMotion: boolean;
}

function Row({
  label,
  htmlFor,
  stack = false,
  children,
}: {
  readonly label: string;
  readonly htmlFor?: string;
  /** The control goes on its own full-width line under the label. */
  readonly stack?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={`settings__row${stack ? ' settings__row--stack' : ''}`}>
      {htmlFor === undefined ? <span className="settings__label">{label}</span> : <label className="settings__label" htmlFor={htmlFor}>{label}</label>}
      <div className="settings__control">{children}</div>
    </div>
  );
}

/**
 * The settings button, which morphs into the glass settings panel: the
 * round glass grows into a rounded panel and the controls fade in. Opening
 * and closing go through the hub (btn.settings), so hub.py decides what the
 * button does. Every control applies at once, is remembered between
 * launches, and is also reported to the hub under its element ID.
 */
export function SettingsMorph({ open, settings, reducedMotion }: SettingsMorphProps) {
  const hub = useHub();
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const zones = useMemo(allZones, []);
  const device = useMemo(deviceZone, []);
  const press = usePressFeedback(surface);
  const gestures = useHubGestures('btn.settings');
  useGlass(surface, open ? 26 : 'round');

  useLayoutEffect(() => {
    const element = content.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(() => setContentHeight(element.scrollHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onResize = (): void => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Focus moves into the panel when it opens, and back to the button when it closes.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      window.setTimeout(() => content.current?.querySelector<HTMLElement>('select, input, button')?.focus(), 80);
    } else if (!open && wasOpen.current && surface.current?.contains(document.activeElement)) {
      toggle.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // A press anywhere outside the open panel closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && surface.current?.contains(event.target)) return;
      interfaceStore.setSettingsOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const report = (id: ElementId, value: string | number | boolean): void => {
    void hub.trigger(id, 'tap', { value });
  };

  const width = open ? Math.min(PANEL_WIDTH, viewportWidth - 24) : BUTTON;
  const height = open ? Math.min(contentHeight, window.innerHeight - 32) : BUTTON;
  const motionPercent = Math.round(settings.motion * 100);
  const measured = settings.measuredQuality;

  return (
    <div
      ref={surface}
      className={`glass settings-morph${open ? ' settings-morph--open' : ''}`}
      style={{ width, height }}
      onPointerDown={open ? undefined : press.onPointerDown}
      onPointerUp={press.release}
      onPointerCancel={press.release}
      onPointerLeave={press.release}
    >
      <button
        ref={toggle}
        type="button"
        className="settings-morph__toggle"
        aria-label={open ? 'Close settings' : 'Settings'}
        title={open ? 'Close settings' : 'Settings'}
        aria-expanded={open}
        aria-controls="settings-panel"
        data-hub-id="btn.settings"
        {...gestures}
      >
        <span className={`settings-morph__icon${open ? ' settings-morph__icon--open' : ''}`}>
          {open ? <CloseIcon /> : <SettingsIcon />}
        </span>
      </button>

      <div
        ref={content}
        id="settings-panel"
        className="settings"
        role="group"
        aria-label="Settings"
        inert={!open}
        style={{ width: Math.min(PANEL_WIDTH, viewportWidth - 24) }}
      >
        <h2 className="settings__title">Settings</h2>

        <Row label="Time zone" htmlFor="settings-zone">
          <select
            id="settings-zone"
            className="settings__select"
            value={settings.timeZone}
            onChange={(event) => {
              settingsStore.set({ timeZone: event.target.value });
              report('settings.time_zone', event.target.value);
            }}
          >
            <option value="">Device ({device})</option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Clock">
          <div className="segmented" role="radiogroup" aria-label="Clock format">
            {[
              { value: true, label: '12-hour' },
              { value: false, label: '24-hour' },
            ].map((option) => (
              <label key={option.label} className="segmented__option">
                <input
                  type="radio"
                  name="settings-hour"
                  checked={settings.hour12 === option.value}
                  onChange={() => {
                    settingsStore.set({ hour12: option.value });
                    report('settings.hour_format', option.value ? '12' : '24');
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Seconds" htmlFor="settings-seconds">
          <input
            id="settings-seconds"
            className="switch"
            type="checkbox"
            role="switch"
            checked={settings.showSeconds}
            onChange={(event) => {
              settingsStore.set({ showSeconds: event.target.checked });
              report('settings.show_seconds', event.target.checked);
            }}
          />
        </Row>

        <Row label="Motion" htmlFor="settings-motion">
          <div className="settings__range">
            <input
              id="settings-motion"
              type="range"
              min={0}
              max={100}
              step={5}
              value={motionPercent}
              aria-valuetext={`${motionPercent}% · ${motionWord(settings.motion)}`}
              onChange={(event) => {
                const motion = Number(event.target.value) / 100;
                settingsStore.set({ motion });
                report('settings.motion_intensity', motion);
              }}
            />
            <output htmlFor="settings-motion">{motionWord(settings.motion)}</output>
          </div>
        </Row>
        {reducedMotion && (
          <p className="settings__note">Calm mode is on because your system asks for reduced motion.</p>
        )}

        <Row label="Quality" stack>
          <div className="segmented" role="radiogroup" aria-label="Quality">
            {QUALITY.map((option) => (
              <label key={option.value} className="segmented__option">
                <input
                  type="radio"
                  name="settings-quality"
                  checked={settings.quality === option.value}
                  onChange={() => {
                    settingsStore.set({ quality: option.value });
                    report('settings.quality', option.value);
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </Row>
        {settings.quality === 'auto' && (
          <p className="settings__note">
            {measured === null ? 'Measuring this device…' : `Auto chose ${QUALITY_NAMES[measured]} for this device.`}
          </p>
        )}

        <Row label="Wind sound" htmlFor="settings-sound">
          <input
            id="settings-sound"
            className="switch"
            type="checkbox"
            role="switch"
            checked={settings.sound}
            onChange={(event) => {
              settingsStore.set({ sound: event.target.checked });
              report('settings.sound', event.target.checked);
            }}
          />
        </Row>
      </div>
    </div>
  );
}
