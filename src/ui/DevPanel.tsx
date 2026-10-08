import { useEffect, useState, useSyncExternalStore } from 'react';
import { loadedTextureUrl, type TextureSet } from '../assets/loader';
import { config, type DisplayFont, type StageLayout } from '../config/config';
import { effectiveQuality, settingsStore } from '../core/settings';
import { runBenchmark, type BenchmarkReport } from '../dev/benchmark';
import type { Scene } from '../scene/composition';
import { POST_PASSES, type PostPassName } from '../scene/post/PostProcessor';
import type { Stage } from '../scene/Stage';

const ZONES: readonly { readonly label: string; readonly zone: string }[] = [
  { label: 'Device', zone: '' },
  { label: 'Kolkata', zone: 'Asia/Kolkata' },
  { label: 'London', zone: 'Europe/London' },
  { label: 'New York', zone: 'America/New_York' },
  { label: 'Tokyo', zone: 'Asia/Tokyo' },
  { label: 'Kiritimati', zone: 'Pacific/Kiritimati' },
];

const SPEEDS: readonly number[] = [0, 1, 10, 60];

const PASS_LABELS: Readonly<Record<PostPassName, string>> = {
  bloom: 'Bloom',
  shafts: 'Sun shafts',
  light: 'Key and fill light',
  tone: 'Tone curve',
  grade: 'Colour grade',
  atmosphere: 'Atmosphere',
  dof: 'Depth of field',
  grain: 'Grain',
  vignette: 'Vignette',
  dither: 'Dither',
};

const FONTS: readonly { readonly id: DisplayFont; readonly label: string }[] = [
  { id: 'bodoni', label: 'Bodoni Moda' },
  { id: 'italiana', label: 'Italiana' },
  { id: 'playfair', label: 'Playfair Display' },
];

interface DevPanelProps {
  readonly stage: Stage;
  readonly scene: Scene;
  readonly textureSet: TextureSet;
}

/**
 * Development tools, not part of the final interface: the alignment overlay,
 * the layout switch, the display-font choice, time-zone testing and the
 * scene clock's speed (to fast-forward the motion), and every
 * post-processing pass, to compare with and without.
 * R toggles the overlay, P the whole post-processing, D this panel.
 */
export function DevPanel({ stage, scene, textureSet }: DevPanelProps) {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [open, setOpen] = useState(config.debug.showDevPanel);
  const [overlay, setOverlay] = useState(scene.reference.visible);
  const [opacity, setOpacity] = useState(scene.reference.opacity);
  const [layout, setLayout] = useState<StageLayout>(stage.currentLayout);
  const [font, setFont] = useState<DisplayFont>(scene.text.font);
  const [zoneInput, setZoneInput] = useState(settings.timeZone);
  const [speed, setSpeed] = useState(stage.clock.timeScale);
  const [postOn, setPostOn] = useState(stage.post?.masterEnabled ?? true);
  const [passes, setPasses] = useState<Readonly<Record<PostPassName, boolean>>>(() =>
    Object.fromEntries(POST_PASSES.map((name) => [name, stage.post?.isEnabled(name) ?? true])) as Record<
      PostPassName,
      boolean
    >,
  );

  useEffect(() => {
    scene.reference.visible = overlay;
  }, [scene, overlay]);
  useEffect(() => {
    scene.reference.opacity = opacity;
  }, [scene, opacity]);
  useEffect(() => stage.setLayout(layout), [stage, layout]);
  useEffect(() => scene.text.setDisplayFont(font), [scene, font]);
  useEffect(() => {
    stage.clock.timeScale = speed;
  }, [stage, speed]);
  useEffect(() => stage.post?.setMaster(postOn), [stage, postOn]);
  useEffect(() => {
    for (const name of POST_PASSES) stage.post?.setEnabled(name, passes[name]);
  }, [stage, passes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'r' || event.key === 'R') setOverlay((v) => !v);
      if (event.key === 'd' || event.key === 'D') setOpen((v) => !v);
      if (event.key === 'p' || event.key === 'P') setPostOn((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <aside className="dev-panel" aria-label="Development panel">
      <h2>Dev</h2>

      <fieldset>
        <legend>Motion (scene clock)</legend>
        <div className="dev-segment">
          {SPEEDS.map((value) => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>
              {value === 0 ? 'Pause' : `${value}×`}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Reference overlay (R)</legend>
        <label className="dev-row">
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
          Show reference
        </label>
        <label className="dev-row">
          Opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
          <output>{Math.round(opacity * 100)}%</output>
        </label>
      </fieldset>

      <fieldset>
        <legend>Layout</legend>
        <div className="dev-segment">
          {(['extend', 'letterbox'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={layout === mode} onClick={() => setLayout(mode)}>
              {mode}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Post-processing (P)</legend>
        <label className="dev-row">
          <input type="checkbox" checked={postOn} onChange={(e) => setPostOn(e.target.checked)} />
          Finished image
        </label>
        <div className="dev-segment dev-segment--wrap">
          {POST_PASSES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={passes[name]}
              disabled={!postOn}
              onClick={() => setPasses({ ...passes, [name]: !passes[name] })}
            >
              {PASS_LABELS[name]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Display font (THE, D, Y)</legend>
        <div className="dev-segment dev-segment--stack">
          {FONTS.map((f) => (
            <button key={f.id} type="button" aria-pressed={font === f.id} onClick={() => setFont(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Clock (shared with the settings panel)</legend>
        <div className="dev-segment dev-segment--wrap">
          {ZONES.map((z) => (
            <button
              key={z.label}
              type="button"
              aria-pressed={settings.timeZone === z.zone}
              onClick={() => {
                setZoneInput(z.zone);
                settingsStore.set({ timeZone: z.zone });
              }}
            >
              {z.label}
            </button>
          ))}
        </div>
        <form
          className="dev-row"
          onSubmit={(e) => {
            e.preventDefault();
            settingsStore.set({ timeZone: zoneInput.trim() });
          }}
        >
          <input
            aria-label="IANA time zone"
            placeholder="e.g. Asia/Kolkata"
            value={zoneInput}
            onChange={(e) => setZoneInput(e.target.value)}
          />
          <button type="submit">Set</button>
        </form>
        <label className="dev-row">
          <input
            type="checkbox"
            checked={settings.hour12}
            onChange={(e) => settingsStore.set({ hour12: e.target.checked })}
          />
          12-hour
        </label>
        <label className="dev-row">
          <input
            type="checkbox"
            checked={settings.showSeconds}
            onChange={(e) => settingsStore.set({ showSeconds: e.target.checked })}
          />
          Seconds
        </label>
      </fieldset>

      <fieldset>
        <legend>Quality and robustness</legend>
        <p className="dev-note">
          Level {effectiveQuality(settings)} ({settings.quality}) · textures {textureSet}
          <br />
          sky from {loadedTextureUrl('skyBase')?.split('/assets/')[1] ?? 'not loaded'}
        </p>
        <div className="dev-segment dev-segment--wrap">
          <button
            type="button"
            disabled={measuring}
            onClick={() => {
              setMeasuring(true);
              void runBenchmark(stage, undefined, 3).then((result) => {
                setReport(result);
                setMeasuring(false);
              });
            }}
          >
            {measuring ? 'Measuring…' : 'Measure every level'}
          </button>
          <button type="button" onClick={() => settingsStore.set({ measuredQuality: null })}>
            Forget auto choice
          </button>
          <button type="button" onClick={() => stage.loseContext()}>
            Lose GPU context
          </button>
        </div>
        {report !== null && (
          <table className="dev-table">
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.level}>
                  <th scope="row">{row.level}</th>
                  <td>{row.medianMs.toFixed(1)} ms</td>
                  <td>{Math.round(row.displayFps)} fps</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>
    </aside>
  );
}
