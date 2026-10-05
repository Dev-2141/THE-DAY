import { Sprite, type Texture } from 'pixi.js';
import type { Placement } from '../../config/config';
import type { PosterViewport } from '../types';

/** A cut-out image placed by its top-left corner and width; height keeps the image's aspect. */
export function createObjectSprite(texture: Texture): Sprite {
  texture.source.autoGenerateMipmaps = true;
  texture.source.scaleMode = 'linear';
  return new Sprite(texture);
}

export function placeObject(sprite: Sprite, placement: Placement, viewport: PosterViewport): void {
  const width = placement.width * viewport.width;
  const aspect = sprite.texture.height / sprite.texture.width;
  sprite.position.set(viewport.x + placement.x * viewport.width, viewport.y + placement.y * viewport.height);
  sprite.setSize(width, width * aspect);
}
