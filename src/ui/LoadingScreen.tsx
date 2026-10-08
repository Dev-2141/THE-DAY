import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  /** 0..1 */
  readonly progress: number;
  readonly done: boolean;
  readonly message: string;
}

/**
 * The on-brand loading screen: THE, the hairline rule (which fills as the
 * layers load) and DAY, in the poster's ink on its warm cream. index.html
 * shows the same markup before any script runs, so there is no flash; this
 * component takes over from it and fades away when the scene is ready.
 */
export function LoadingScreen({ progress, done, message }: LoadingScreenProps) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    document.getElementById('splash')?.remove();
  }, []);

  useEffect(() => {
    if (!done) {
      setGone(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setGone(true), 900);
    return () => window.clearTimeout(timer);
  }, [done]);

  if (gone) return null;
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <div
      className={`loading${done ? ' loading--done' : ''}`}
      role="progressbar"
      aria-label="Loading THE DAY"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={message}
    >
      <div className="loading__title">THE</div>
      <div className="loading__rule">
        <span style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} />
      </div>
      <div className="loading__day">DAY</div>
      <div className="loading__note">{message}</div>
    </div>
  );
}
