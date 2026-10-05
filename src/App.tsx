import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from './config/config';
import { installFullscreenKeys } from './core/fullscreen';
import type { HubSurface } from './hub/runActions';
import { createScene, type Scene } from './scene/composition';
import { Stage } from './scene/Stage';
import { DevPanel } from './ui/DevPanel';
import { FpsCounter } from './ui/FpsCounter';
import { HubTestButton } from './ui/HubTestButton';
import { Toasts, useToasts } from './ui/Toasts';

interface Running {
  readonly stage: Stage;
  readonly scene: Scene;
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const toasts = useToasts();
  const surface = useMemo<HubSurface>(() => ({ toast: toasts.show }), [toasts.show]);

  useEffect(installFullscreenKeys, []);

  useEffect(() => {
    const element = host.current;
    if (element === null) return undefined;
    const scene = createScene();
    const stage = new Stage(scene.layers, { overlays: scene.overlays, focus: scene.focus });
    // React may unmount before loading finishes (StrictMode does so on purpose);
    // a stage that finishes after its cleanup must not become the running one.
    let cancelled = false;
    stage
      .mount(element)
      .then(() => {
        if (cancelled) return;
        setRunning({ stage, scene });
        // Development only: lets tools inspect any moment, e.g.
        // __theDay.stage.clock.seek(600); __theDay.stage.renderNow();
        if (import.meta.env.DEV) window.__theDay = { stage, scene };
      })
      .catch((error: unknown) => {
        console.error('[stage] failed to start', error);
      });
    return () => {
      cancelled = true;
      stage.destroy();
      setRunning(null);
    };
  }, []);

  return (
    <main className="app">
      <div ref={host} className="scene" />
      {config.debug.showFps && running !== null && <FpsCounter clock={running.stage.clock} />}
      {running !== null && <DevPanel stage={running.stage} scene={running.scene} />}
      {config.debug.showHubTest && <HubTestButton surface={surface} />}
      <Toasts items={toasts.items} />
    </main>
  );
}
