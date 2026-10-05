import { BlurFilter, Container, type Sprite } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { ClockFrame } from '../../core/clock';
import { config } from '../../config/config';
import type { PosterViewport, SceneLayer } from '../types';
import { createObjectSprite, placeObject } from './objectSprite';
import { applyHover } from './shipMotion';

/**
 * The ship's faint shadow and occlusion on the cloud directly beneath it:
 * the hull's silhouette, darkened, blurred and dropped a little. It sits
 * behind the beams so it never dims the light, and hovers with the ship.
 */
export class ShipShadowLayer implements SceneLayer {
  readonly id = 'ship-shadow';
  readonly view = new Container();
  /** The blurred silhouette is rendered once per resize and then only moved. */
  private readonly cached = new Container();
  private silhouette: Sprite | null = null;
  private readonly blur = new BlurFilter({ strength: 8, quality: 4 });
  private viewport: PosterViewport | null = null;

  async load(): Promise<void> {
    this.silhouette = createObjectSprite(await loadTexture('ship'));
    this.silhouette.tint = 0x000000;
    this.cached.addChild(this.silhouette);
    this.cached.filters = [this.blur];
    this.cached.alpha = config.layers.ship.shadow.opacity;
    this.view.addChild(this.cached);
  }

  resize(viewport: PosterViewport): void {
    this.viewport = viewport;
    if (this.silhouette === null) return;
    placeObject(this.silhouette, config.layers.ship.placement, viewport);
    this.blur.strength = Math.max(1, config.layers.ship.shadow.blur * viewport.height);
    this.blur.padding = Math.ceil(this.blur.strength * 3);
    this.cached.cacheAsTexture(false);
    this.cached.cacheAsTexture(true);
  }

  update(frame: ClockFrame): void {
    if (this.viewport !== null) applyHover(this.view, this.viewport, frame.time, config.layers.ship.shadow.offset);
  }

  destroy(): void {
    this.view.destroy({ children: true });
    releaseTexture('ship');
  }
}
