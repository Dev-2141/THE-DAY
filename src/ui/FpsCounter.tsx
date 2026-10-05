import { useEffect, useState } from 'react';
import { config } from '../config/config';
import type { AnimationClock } from '../core/clock';

export function FpsCounter({ clock }: { readonly clock: AnimationClock }) {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setFps(clock.fps),
      config.debug.fpsRefreshSeconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [clock]);

  return (
    <div className="fps" aria-hidden="true">
      {fps.toFixed(0).padStart(3, ' ')} FPS
    </div>
  );
}
