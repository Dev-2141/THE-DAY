import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { WindAmbience } from './audio/WindAmbience';
import { currentTextureSet, onLoadProgress, setTextureSet } from './assets/loader';
import { config, type QualityLevel } from './config/config';
import { installFullscreenKeys } from './core/fullscreen';
import {
  effectiveMotion,
  effectiveQuality,
  prefersReducedMotion,
  settingsStore,
  type Settings,
} from './core/settings';
import { runBenchmark } from './dev/benchmark';
import { hubClient } from './hub/client';
import type { ExportedHub } from './hub/protocol';
import { runActions } from './hub/runActions';
import { createScene, type Scene } from './scene/composition';
import { initialTextureGuess, pickQuality, QUALITY_LEVELS } from './scene/quality';
import { Stage } from './scene/Stage';
import { windAt } from './scene/wind';
import { DevPanel } from './ui/DevPanel';
import { FpsCounter } from './ui/FpsCounter';
import { HubContext, type HubApi } from './ui/HubContext';
import { HubTestButton } from './ui/HubTestButton';
import { Interface } from './ui/Interface';
import { interfaceStore, useInterface } from './ui/interfaceStore';
import { LoadingScreen } from './ui/LoadingScreen';
import { Popups } from './ui/Popups';
import { createSurface } from './ui/surface';
import { Toasts, useToasts } from './ui/Toasts';
import { useSceneInput } from './ui/useSceneInput';

interface Running {
  readonly stage: Stage;
  readonly scene: Scene;
  /** The quality level whose texture set was loaded. */
  readonly textures: QualityLevel;
}

interface Loading {
  readonly progress: number;
  readonly done: boolean;
  readonly message: string;
}

const mix = (range: readonly [number, number], t: number): number => range[0] + (range[1] - range[0]) * t;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Where to start loading: the level the user chose, the measured one, or a guess for this kind of device. */
function textureLevel(settings: Settings): QualityLevel {
  if (settings.quality !== 'auto') return settings.quality;
  return settings.measuredQuality ?? initialTextureGuess();
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
  const reduced = useReducedMotion();
  const ui = useInterface();
  const toasts = useToasts();
  const [running, setRunning] = useState<Running | null>(null);
  const runningRef = useRef<Running | null>(null);
  runningRef.current = running;
  /** Bumped to build a fresh stage: a new texture set, or a lost graphics context. */
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState<Loading>({ progress: 0, done: false, message: 'Loading the scene' });
  const [manifest, setManifest] = useState<ExportedHub | null>(null);
  const ambience = useMemo(() => new WindAmbience(), []);
  const motion = effectiveMotion(settings, reduced);

  useEffect(installFullscreenKeys, []);
  useEffect(() => () => ambience.destroy(), [ambience]);

  // ------------------------------------------------------------ the stage

  useEffect(() => {
    const element = host.current;
    if (element === null) return undefined;
    const level = textureLevel(settingsStore.get());
    const quality = config.quality.levels[effectiveQuality(settingsStore.get())];
    setTextureSet(config.quality.levels[level].textures);
    const scene = createScene();
    let cancelled = false;
    const stage = new Stage(scene.layers, {
      overlays: scene.overlays,
      focus: scene.focus,
      tuning: scene.tuning,
      quality,
      onContextLost: () => {
        // Rebuild everything on a fresh canvas and context.
        console.warn('[stage] graphics context lost; rebuilding the scene');
        setRunning(null);
        setLoading({ progress: 0, done: false, message: 'Restoring the scene' });
        window.setTimeout(() => setGeneration((g) => g + 1), 250);
      },
    });
    setLoading((current) => ({ ...current, progress: 0, done: false }));
    const stopProgress = onLoadProgress((loaded, total) => {
      if (!cancelled && total > 0) setLoading((current) => ({ ...current, progress: loaded / total }));
    });

    const start = async (): Promise<void> => {
      await stage.mount(element);
      if (cancelled) return;
      const now = settingsStore.get();
      if (now.quality === 'auto' && now.measuredQuality === null) {
        setLoading({ progress: 1, done: false, message: 'Tuning for this device' });
        const timings = await stage.measure(QUALITY_LEVELS);
        if (cancelled) return;
        const picked = timings.length > 0 ? pickQuality(timings) : config.quality.fallback;
        console.info('[quality] frame cost per level', timings, '→', picked);
        settingsStore.set({ measuredQuality: picked });
        if (config.quality.levels[picked].textures !== config.quality.levels[level].textures) {
          // The chosen level uses another texture set: load it before showing anything.
          setLoading({ progress: 0, done: false, message: 'Loading the scene' });
          setGeneration((g) => g + 1);
          return;
        }
      }
      setRunning({ stage, scene, textures: level });
      setLoading({ progress: 1, done: true, message: 'Ready' });
      // Development only: lets tools inspect any moment, e.g.
      // __theDay.stage.clock.seek(600); __theDay.stage.renderNow();
      if (import.meta.env.DEV) window.__theDay = { stage, scene };
      const benchmark = new URLSearchParams(window.location.search).get('benchmark');
      if (benchmark !== null) {
        // ?benchmark measures every level; ?benchmark=medium only that one, with its own textures.
        const only = QUALITY_LEVELS.find((l) => l === benchmark);
        const report = await runBenchmark(stage, only === undefined ? QUALITY_LEVELS : [only]);
        toasts.show(
          report.rows.map((r) => `${r.level}: ${r.medianMs.toFixed(1)} ms (${Math.round(r.displayFps)} fps)`).join(' · '),
        );
      }
    };
    // React may unmount before loading finishes (StrictMode does so on purpose);
    // a stage that finishes after its cleanup must not become the running one.
    start().catch((error: unknown) => console.error('[stage] failed to start', error));

    return () => {
      cancelled = true;
      stopProgress();
      stage.destroy();
      setRunning(null);
    };
    // Only a new generation builds a new stage; settings are applied to the running one below.
  }, [generation]);

  // ------------------------------------------------------- settings applied

  const quality = effectiveQuality(settings);
  useEffect(() => {
    if (running === null) return;
    // A different texture set needs the layers loaded again; anything else applies live.
    if (config.quality.levels[quality].textures !== config.quality.levels[running.textures].textures) {
      setGeneration((g) => g + 1);
      return;
    }
    running.stage.setQuality(config.quality.levels[quality]);
  }, [running, quality]);

  useEffect(() => {
    running?.scene.text.setClockFormat({
      timeZone: settings.timeZone,
      hour12: settings.hour12,
      showSeconds: settings.showSeconds,
      locale: config.time.locale,
    });
  }, [running, settings.timeZone, settings.hour12, settings.showSeconds]);

  useEffect(() => {
    running?.stage.setMotion(mix(config.motion.speed, motion), mix(config.motion.wind, motion), reduced ? 0 : motion);
  }, [running, motion, reduced]);

  useEffect(() => ambience.setEnabled(settings.sound), [ambience, settings.sound]);

  // The glass follows the light, and the sound follows the wind.
  useEffect(() => {
    if (running === null) return undefined;
    const root = document.documentElement.style;
    let lx = NaN;
    let ly = NaN;
    return running.stage.onFrame((frame) => {
      const p = reduced ? { x: 0, y: 0 } : running.stage.parallax.pointer;
      if (Math.abs(p.x - lx) > 0.003 || Math.abs(p.y - ly) > 0.003) {
        lx = p.x;
        ly = p.y;
        root.setProperty('--lx', lx.toFixed(3));
        root.setProperty('--ly', ly.toFixed(3));
      }
      if (settings.sound) ambience.update(windAt(frame.time), Math.max(motion, 0.2), performance.now() / 1000);
    });
  }, [running, reduced, ambience, settings.sound, motion]);

  // ---------------------------------------------------------------- the hub

  const surface = useMemo(
    () =>
      createSurface({
        toast: toasts.show,
        stage: () => runningRef.current?.stage ?? null,
        scene: () => runningRef.current?.scene ?? null,
        settings: settingsStore,
        store: interfaceStore,
      }),
    [toasts.show],
  );

  const hub = useMemo<HubApi>(
    () => ({
      trigger: async (id, event, payload = {}) => {
        const result = await hubClient.dispatch(id, event, payload);
        await runActions(result.actions, surface);
        return result;
      },
      run: (actions) => void runActions(actions, surface),
      isConnected: (id, event) => {
        // Before the connections are known, try everything.
        if (manifest === null) return true;
        const bindings = manifest.bindings[id];
        if (bindings === undefined) return false;
        if (event === undefined) return Object.values(bindings).some((actions) => actions.length > 0);
        return (bindings[event]?.length ?? 0) > 0;
      },
    }),
    [surface, manifest],
  );

  // Learn which elements are connected; refresh when the app comes back to the front.
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void hubClient.manifest().then((next) => {
        if (alive && next !== null) setManifest(next);
      });
    };
    load();
    const onVisible = (): void => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // app_start once, then every "timer" connection on its own interval.
  const started = useRef(false);
  useEffect(() => {
    if (running === null || started.current) return;
    started.current = true;
    void hub.trigger('app', 'app_start');
  }, [running, hub]);
  useEffect(() => {
    if (running === null || manifest === null) return undefined;
    const timers = (manifest.timers ?? []).map((timer) =>
      window.setInterval(() => void hub.trigger(timer.id, 'timer'), timer.every * 1000),
    );
    return () => timers.forEach((timer) => window.clearInterval(timer));
  }, [running, manifest, hub]);

  // ------------------------------------------------------ input and keys

  const onEmptyTap = useCallback(() => {
    if (interfaceStore.get().uiHidden) interfaceStore.setUiHidden(false);
  }, []);
  useSceneInput(host, running, hub, onEmptyTap);

  // The clean view explains, once, how to come back.
  const hintShown = useRef(false);
  useEffect(() => {
    if (!ui.uiHidden || hintShown.current) return;
    hintShown.current = true;
    toasts.show('Tap the sky, or press H, to bring the interface back.');
  }, [ui.uiHidden, toasts]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
      if (event.key === 'Escape') {
        if (!interfaceStore.closeTop() && interfaceStore.get().uiHidden) interfaceStore.setUiHidden(false);
      } else if ((event.key === 'h' || event.key === 'H') && !typing && !event.ctrlKey && !event.metaKey) {
        interfaceStore.setUiHidden('toggle');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Back (Android's back button, the browser's back) closes the topmost layer.
  const depth = interfaceStore.depth();
  const historyDepth = useRef(0);
  const ignorePops = useRef(0);
  useEffect(() => {
    if (depth > historyDepth.current) {
      for (let i = historyDepth.current; i < depth; i++) window.history.pushState({ theDay: i + 1 }, '');
    } else if (depth < historyDepth.current) {
      ignorePops.current += historyDepth.current - depth;
      window.history.go(depth - historyDepth.current);
    }
    historyDepth.current = depth;
  }, [depth]);
  useEffect(() => {
    const onPop = (): void => {
      if (ignorePops.current > 0) {
        ignorePops.current--;
        return;
      }
      historyDepth.current = Math.max(0, historyDepth.current - 1);
      interfaceStore.closeTop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // A quiet description of the live poster for screen readers.
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    if (running === null) return undefined;
    const say = (text: { time: string; date: string }): void => setSpoken(`${text.date}, ${text.time}`);
    say(running.scene.text.clockText);
    return running.scene.text.onClock(say);
  }, [running]);

  return (
    <HubContext.Provider value={hub}>
      <main className="app">
        <div ref={host} className="scene" />
        <h1 className="sr-only">THE DAY · FOR DEV BY DEV</h1>
        <p className="sr-only" role="timer">
          {spoken}
        </p>
        {running !== null && <Interface settings={settings} reducedMotion={reduced} />}
        <Popups />
        {config.debug.showFps && running !== null && <FpsCounter clock={running.stage.clock} />}
        {config.debug.showDevPanel && running !== null && (
          <DevPanel stage={running.stage} scene={running.scene} textureSet={currentTextureSet()} />
        )}
        {config.debug.showHubTest && running !== null && <HubTestButton surface={surface} />}
        <Toasts items={toasts.items} />
        <LoadingScreen progress={loading.progress} done={loading.done} message={loading.message} />
      </main>
    </HubContext.Provider>
  );
}
