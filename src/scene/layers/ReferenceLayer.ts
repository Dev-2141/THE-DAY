import { Container, Sprite } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import { config } from '../../config/config';
import type { PosterViewport, SceneLayer } from '../types';

/**
 * Development overlay: the reference poster on top of everything, at an
 * adjustable opacity, to check that every layer lines up.
 */
export class ReferenceLayer implements SceneLayer {
  readonly id = 'reference';
  readonly view = new Container();
  private sprite: Sprite | null = null;

  async load(): Promise<void> {
    const texture = await loadTexture('reference');
    texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(texture);
    this.view.addChild(this.sprite);
    this.view.visible = config.debug.overlay.visible;
    this.view.alpha = config.debug.overlay.opacity;
  }

  get visible(): boolean {
    return this.view.visible;
  }

  set visible(value: boolean) {
    this.view.visible = value;
  }

  get opacity(): number {
    return this.view.alpha;
  }

  set opacity(value: number) {
    this.view.alpha = Math.min(1, Math.max(0, value));
  }

  resize(viewport: PosterViewport): void {
    if (this.sprite === null) return;
    this.sprite.position.set(viewport.x, viewport.y);
    this.sprite.setSize(viewport.width, viewport.height);
  }

  update(): void {
    // The reference is a still image; nothing to animate.
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.sprite = null;
    releaseTexture('reference');
  }
}
