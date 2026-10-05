import { useEffect, useRef, type RefObject } from 'react';
import { DEFAULT_OPTICS, removeFilter, supportsRefraction, writeFilter, type GlassOptics } from './refraction';

let nextId = 0;

/** Wait this long after the last size change before redrawing the refraction map. */
const SETTLE_MS = 140;

/**
 * Gives an element live refraction: the scene behind it is blurred and bent
 * at the rim by an SVG filter drawn for its exact size. While the element is
 * changing size (a button morphing into a panel), the plain blur stands in,
 * and the refraction returns once the shape has settled.
 *
 * `radius` is the corner radius in px, or 'round' for a pill or circle.
 */
export function useGlass(
  ref: RefObject<HTMLElement | null>,
  radius: number | 'round',
  optics: GlassOptics = DEFAULT_OPTICS,
): void {
  const id = useRef(`the-day-glass-${nextId++}`);
  const opticsRef = useRef(optics);
  opticsRef.current = optics;

  useEffect(() => {
    const element = ref.current;
    if (element === null || !supportsRefraction) return undefined;
    const filterId = id.current;
    let timer = 0;
    let lastSize = '';

    const draw = (): void => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width < 2 || height < 2) return;
      const r = radius === 'round' ? Math.min(width, height) / 2 : radius;
      const value = writeFilter(filterId, { width, height, radius: r }, opticsRef.current);
      element.style.setProperty('backdrop-filter', value);
      element.style.setProperty('-webkit-backdrop-filter', value);
    };

    const observer = new ResizeObserver(() => {
      const size = `${element.offsetWidth}x${element.offsetHeight}`;
      if (size === lastSize) return;
      const first = lastSize === '';
      lastSize = size;
      window.clearTimeout(timer);
      if (first) {
        draw();
        return;
      }
      // The stylesheet's plain blur shows while the shape changes.
      element.style.removeProperty('backdrop-filter');
      element.style.removeProperty('-webkit-backdrop-filter');
      timer = window.setTimeout(draw, SETTLE_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      removeFilter(filterId);
      element.style.removeProperty('backdrop-filter');
      element.style.removeProperty('-webkit-backdrop-filter');
    };
  }, [ref, radius]);
}
