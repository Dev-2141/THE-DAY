import type { Container } from 'pixi.js';
import type { ClockFrame } from '../core/clock';

/** Where the poster sits inside the window, in CSS pixels. */
export interface PosterViewport {
  /** Window size. */
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Top-left of the poster area and its scale relative to design space. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** Size of the poster area on screen. */
  readonly width: number;
  readonly height: number;
}

/**
 * The interface every scene layer implements. One module per layer.
 * The stage calls these in order: load once, resize on every viewport
 * change, update every frame, destroy when the scene is torn down.
 */
export interface SceneLayer {
  readonly id: string;
  readonly view: Container;
  load(): Promise<void>;
  resize(viewport: PosterViewport): void;
  update(frame: ClockFrame): void;
  destroy(): void;
}
