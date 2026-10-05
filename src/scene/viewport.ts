import { SCENE_CANVAS } from '../assets/manifest';
import { config, type PosterConfig } from '../config/config';
import type { PosterViewport } from './types';

/**
 * Fit the design-space poster into a window without distorting it. The whole
 * poster is always visible; in 'extend' layout the layers fill the rest.
 */
export function computeViewport(
  screenWidth: number,
  screenHeight: number,
  poster: PosterConfig,
): PosterViewport {
  const scale = Math.min(screenWidth / poster.width, screenHeight / poster.height);
  const width = poster.width * scale;
  const height = poster.height * scale;
  return {
    screenWidth,
    screenHeight,
    x: (screenWidth - width) / 2,
    y: (screenHeight - height) / 2,
    scale,
    width,
    height,
  };
}

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Screen pixels per 4K canvas pixel. */
export function canvasUnit(viewport: PosterViewport): number {
  return viewport.width / SCENE_CANVAS.posterWidth;
}

/** Where the shared 3840 x 4000 scene canvas lands on screen. */
export function canvasRect(viewport: PosterViewport): ScreenRect {
  const unit = canvasUnit(viewport);
  return {
    x: viewport.x - SCENE_CANVAS.posterX * unit,
    y: viewport.y - SCENE_CANVAS.posterY * unit,
    width: SCENE_CANVAS.width * unit,
    height: SCENE_CANVAS.height * unit,
  };
}

/** The deepest layer's share of the largest depth shift (seeds move a little more than the grass). */
const MAX_DEPTH = Math.max(1, ...Object.values(config.parallax.depths));

/**
 * How far full-window layers reach past the window's edges, in pixels, so
 * that the depth response can shift them without ever showing an edge.
 */
export function overscan(viewport: PosterViewport): number {
  return Math.ceil(config.parallax.maxShift * MAX_DEPTH * viewport.width * 1.1) + 2;
}

/** A poster-fraction point in screen pixels. */
export function posterPoint(viewport: PosterViewport, x: number, y: number): [number, number] {
  return [viewport.x + x * viewport.width, viewport.y + y * viewport.height];
}
