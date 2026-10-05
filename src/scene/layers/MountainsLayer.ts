import { Container } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { AssetKey } from '../../assets/manifest';
import { CanvasPlane } from '../gl/planes';
import type { PosterViewport, SceneLayer } from '../types';
import { canvasRect, overscan } from '../viewport';

export type MountainDepth = 'far' | 'mid' | 'near';

const ASSET: Record<MountainDepth, AssetKey> = {
  far: 'mountainsFar',
  mid: 'mountainsMid',
  near: 'mountainsNear',
};

/**
 * Layer 9: one distance plane of ridges. The far plane sits behind the beam,
 * which tints it; the mid and near planes sit in front. The haze between
 * the planes is drawn by HazeLayer, placed between them in the composition.
 */
export class MountainsLayer implements SceneLayer {
  readonly id: string;
  readonly view = new Container();
  private readonly asset: AssetKey;
  private plane: CanvasPlane | null = null;

  constructor(depth: MountainDepth) {
    this.id = `mountains-${depth}`;
    this.asset = ASSET[depth];
  }

  async load(): Promise<void> {
    this.plane = new CanvasPlane(await loadTexture(this.asset));
    this.view.addChild(this.plane.view);
  }

  resize(viewport: PosterViewport): void {
    this.plane?.place(canvasRect(viewport), viewport.screenWidth, viewport.screenHeight, overscan(viewport));
  }

  update(): void {
    // Static image; the drifting haze over it is HazeLayer.
  }

  destroy(): void {
    this.plane?.destroy();
    this.view.destroy({ children: true });
    releaseTexture(this.asset);
  }
}
