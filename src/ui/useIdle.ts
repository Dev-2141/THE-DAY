import { useEffect, useState } from 'react';
import { config } from '../config/config';

const WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focusin'] as const;

/**
 * True after a few seconds without input, so the interface can fade out and
 * leave the poster alone. Any touch, mouse movement or key brings it back.
 * Never idle while `allowed` is false (a panel or pop-up is open).
 */
export function useIdle(allowed: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!allowed) {
      setIdle(false);
      return undefined;
    }
    let timer = 0;
    const wake = (): void => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), config.ui.idleSeconds * 1000);
    };
    wake();
    for (const name of WAKE_EVENTS) window.addEventListener(name, wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of WAKE_EVENTS) window.removeEventListener(name, wake);
    };
  }, [allowed]);

  return idle;
}
