import { Container } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import { CanvasPlane } from '../gl/planes';
import type { PosterViewport, SceneLayer } from '../types';
import { canvasRect, overscan } from '../viewport';

/** Layer 1: the warm sky gradient with its built-in cloud texture. */
export class SkyLayer implements SceneLayer {
  readonly id = 'sky';
  readonly view = new Container();
  private plane: CanvasPlane | null = null;

  async load(): Promise<void> {
    this.plane = new CanvasPlane(await loadTexture('skyBase'));
    this.view.addChild(this.plane.view);
  }

  resize(viewport: PosterViewport): void {
    this.plane?.place(canvasRect(viewport), viewport.screenWidth, viewport.screenHeight, overscan(viewport));
  }

  update(): void {
    // Static: the light on it comes from the post-processing pass.
  }

  destroy(): void {
    this.plane?.destroy();
    this.view.destroy({ children: true });
    releaseTexture('skyBase');
  }
}
