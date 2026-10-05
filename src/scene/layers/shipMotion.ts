import type { Container } from 'pixi.js';
import { config } from '../../config/config';
import type { PosterViewport } from '../types';
import { posterPoint } from '../viewport';

const TAU = Math.PI * 2;

/**
 * The ship's hover at a scene time: a few pixels of slow vertical drift built
 * from two unrelated periods, and a roll of a fraction of a degree. Small and
 * slow enough to read as enormous mass; noticeable only if you look for it.
 */
export function shipHover(time: number): { readonly dy: number; readonly roll: number } {
  const { amplitude, periods, roll, rollPeriod } = config.layers.ship.hover;
  const drift = 0.65 * Math.sin((TAU * time) / periods[0]) + 0.35 * Math.sin((TAU * time) / periods[1] + 1.7);
  const tilt = Math.sin((TAU * time) / rollPeriod + 0.9);
  return { dy: amplitude * drift, roll: ((roll * Math.PI) / 180) * tilt };
}

/**
 * Move a container whose children are laid out in screen pixels at rest, so
 * that it hovers around the ship's pivot. `extraDown` shifts it further down
 * (used by the shadow), as a fraction of the poster height.
 */
export function applyHover(view: Container, viewport: PosterViewport, time: number, extraDown = 0): void {
  const [px, py] = posterPoint(viewport, config.layers.ship.pivot[0], config.layers.ship.pivot[1]);
  const { dy, roll } = shipHover(time);
  view.pivot.set(px, py);
  view.position.set(px, py + (dy + extraDown) * viewport.height);
  view.rotation = roll;
}
