import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** A damped spring: stiff enough to feel quick, loose enough to overshoot once. */
const STIFFNESS = 520;
const DAMPING = 17;

interface SpringAxis {
  value: number;
  velocity: number;
  target: number;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The glass's fluid response to touch: on press it squashes (wider and
 * flatter, like a soft drop) and a ripple of light spreads from the touch
 * point; on release it springs back with a small overshoot. Writes the
 * `--sx`/`--sy` custom properties that the stylesheet's transform reads.
 */
export function usePressFeedback(ref: RefObject<HTMLElement | null>): {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly release: () => void;
} {
  const axes = useRef<{ x: SpringAxis; y: SpringAxis }>({
    x: { value: 1, velocity: 0, target: 1 },
    y: { value: 1, velocity: 0, target: 1 },
  });
  const frame = useRef(0);
  const last = useRef(0);

  const step = useCallback(
    (now: number): void => {
      const element = ref.current;
      if (element === null) return;
      const dt = Math.min(0.032, (now - (last.current || now)) / 1000 || 0.016);
      last.current = now;
      let moving = false;
      for (const axis of [axes.current.x, axes.current.y]) {
        const force = -STIFFNESS * (axis.value - axis.target) - DAMPING * axis.velocity;
        axis.velocity += force * dt;
        axis.value += axis.velocity * dt;
        if (Math.abs(axis.value - axis.target) > 0.0005 || Math.abs(axis.velocity) > 0.005) moving = true;
      }
      element.style.setProperty('--sx', axes.current.x.value.toFixed(4));
      element.style.setProperty('--sy', axes.current.y.value.toFixed(4));
      if (moving) {
        frame.current = requestAnimationFrame(step);
      } else {
        frame.current = 0;
        last.current = 0;
      }
    },
    [ref],
  );

  const aim = useCallback(
    (x: number, y: number): void => {
      axes.current.x.target = x;
      axes.current.y.target = y;
      if (frame.current === 0) frame.current = requestAnimationFrame(step);
    },
    [step],
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const element = ref.current;
      if (element === null || event.button > 0) return;
      const rect = element.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'glass__ripple';
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      ripple.style.setProperty('--ripple-size', `${Math.max(rect.width, rect.height) * 2.2}px`);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      element.appendChild(ripple);
      if (reducedMotion()) return;
      // Squash in proportion: a small round button gives more than a long pill.
      const give = rect.width > rect.height * 1.6 ? 0.05 : 0.09;
      aim(1 + give, 1 - give * 1.1);
    },
    [aim, ref],
  );

  const release = useCallback((): void => aim(1, 1), [aim]);

  return { onPointerDown, release };
}
