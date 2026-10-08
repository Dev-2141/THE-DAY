import { UniformGroup, type Mesh, type MeshGeometry, type Shader, type Texture } from 'pixi.js';
import { SCENE_CANVAS } from '../../assets/manifest';
import type { ScreenRect } from '../viewport';
import { createQuad, type QuadResource } from './quad';

/**
 * A full-window plane that draws one image of the shared 3840 x 4000 scene
 * canvas. Past its left and right edges it keeps reflecting its own side
 * margins back and forth, so a very wide window never shows a seam and never
 * repeats the poster itself; above and below it continues the outermost row
 * of pixels, so a tall phone gets more sky on top and more grass below
 * instead of a stretched scene.
 */

/**
 * The canvas mapping as a function, so a shading pass can sample the image
 * at a displaced position. Declares uTexture and the plane's uniforms.
 */
export const CANVAS_SAMPLING_GLSL = /* glsl */ `
uniform sampler2D uTexture;
uniform vec4 uRect;       // canvas position and size on screen
uniform vec2 uHalfTexel;  // half a texel, to clamp exactly to the edge row
uniform vec2 uMargins;    // width of the left and right margins, as canvas fractions

vec4 sampleCanvas(vec2 screen) {
  vec2 raw = (screen - uRect.xy) / uRect.zw;
  float u = raw.x;
  if (u < 0.0) u = uMargins.x * mirror01(-u / uMargins.x);
  if (u > 1.0) u = 1.0 - uMargins.y * mirror01((u - 1.0) / uMargins.y);
  vec2 uv = vec2(u, clamp(raw.y, uHalfTexel.y, 1.0 - uHalfTexel.y));
  return textureGrad(uTexture, uv, dFdx(raw), dFdy(raw));
}

// Out of focus by about radiusPx: five taps over a slightly coarser level of
// detail, so the softness is round and smooth rather than blocky.
vec4 sampleCanvasSoft(vec2 screen, float radiusPx) {
  if (radiusPx < 0.35) return sampleCanvas(screen);
  vec2 raw = (screen - uRect.xy) / uRect.zw;
  vec2 gx = dFdx(raw) * (1.0 + radiusPx * 0.6);
  vec2 gy = dFdy(raw) * (1.0 + radiusPx * 0.6);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 5; i++) {
    float angle = float(i) * 1.2566371 + 0.4;
    vec2 offset = i == 0 ? vec2(0.0) : vec2(cos(angle), sin(angle)) * radiusPx;
    vec2 r = (screen + offset - uRect.xy) / uRect.zw;
    float u = r.x;
    if (u < 0.0) u = uMargins.x * mirror01(-u / uMargins.x);
    if (u > 1.0) u = 1.0 - uMargins.y * mirror01((u - 1.0) / uMargins.y);
    vec2 uv = vec2(u, clamp(r.y, uHalfTexel.y, 1.0 - uHalfTexel.y));
    sum += textureGrad(uTexture, uv, gx, gy) * (i == 0 ? 0.28 : 0.18);
  }
  return sum;
}
`;

const PLAIN_MAIN = /* glsl */ `
void main() {
  finalColor = sampleCanvas(vScreen) * uColor.a;
}
`;

/** A custom pass over a canvas plane: GLSL with its own main() that calls sampleCanvas. */
export interface CanvasShading {
  readonly name: string;
  readonly fragment: string;
  readonly resources: Readonly<Record<string, QuadResource>>;
}

/** Rows scanned to find where an image has content; one row is 1/ROWS of its height. */
const ROWS = 512;

/**
 * The first and last rows of an image that hold anything visible, as
 * fractions of its height (0 and 1 when the image reaches its edges). Read
 * once, from a small copy, so the plane draws only those rows: most layers
 * are empty above or below their band, and skipping those rows saves a
 * large share of the GPU's time on integrated graphics and phones.
 */
export function contentRows(texture: Texture): readonly [top: number, bottom: number] {
  const resource: unknown = texture.source.resource;
  if (!(resource instanceof ImageBitmap || resource instanceof HTMLImageElement || resource instanceof HTMLCanvasElement)) {
    return [0, 1];
  }
  const canvas = document.createElement('canvas');
  // Wide enough that a single small flower is not averaged away.
  canvas.width = 384;
  canvas.height = ROWS;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) return [0, 1];
  context.drawImage(resource, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rowHasContent = (row: number): boolean => {
    for (let x = 0; x < canvas.width; x++) if ((data[(row * canvas.width + x) * 4 + 3] ?? 0) > 0) return true;
    return false;
  };
  let top = 0;
  while (top < ROWS && !rowHasContent(top)) top++;
  if (top === ROWS) return [0, 0];
  let bottom = ROWS - 1;
  while (bottom > top && !rowHasContent(bottom)) bottom--;
  // One row of safety on each side, for filtering and the small copy's rounding.
  return [Math.max(0, top - 1) / ROWS, Math.min(ROWS, bottom + 2) / ROWS];
}

export class CanvasPlane {
  readonly view: Mesh<MeshGeometry, Shader>;
  /** Rows of the image with content, as fractions of its height. */
  private readonly rows: readonly [number, number];
  private readonly uniforms: UniformGroup<{
    uRect: { value: Float32Array; type: 'vec4<f32>' };
    uHalfTexel: { value: Float32Array; type: 'vec2<f32>' };
    uMargins: { value: Float32Array; type: 'vec2<f32>' };
  }>;

  constructor(texture: Texture, shading?: CanvasShading) {
    this.rows = contentRows(texture);
    texture.source.autoGenerateMipmaps = true;
    texture.source.scaleMode = 'linear';
    this.uniforms = new UniformGroup({
      uRect: { value: new Float32Array(4), type: 'vec4<f32>' },
      uHalfTexel: {
        value: new Float32Array([0.5 / texture.source.pixelWidth, 0.5 / texture.source.pixelHeight]),
        type: 'vec2<f32>',
      },
      uMargins: {
        value: new Float32Array([
          SCENE_CANVAS.posterX / SCENE_CANVAS.width,
          (SCENE_CANVAS.width - SCENE_CANVAS.posterX - SCENE_CANVAS.posterWidth) / SCENE_CANVAS.width,
        ]),
        type: 'vec2<f32>',
      },
    });
    this.view = createQuad(shading?.name ?? 'canvas-plane', CANVAS_SAMPLING_GLSL + (shading?.fragment ?? PLAIN_MAIN), {
      ...shading?.resources,
      uTexture: texture.source,
      planeUniforms: this.uniforms,
    });
  }

  /**
   * Cover the window and `margin` pixels past each edge (room for the depth
   * response), sampling the image as if it sat at `rect`, but only over the
   * rows where the image has content. `reachUp` and `reachDown` widen that
   * band for shading that moves the picture (the grass bending in the wind).
   */
  place(rect: ScreenRect, screenWidth: number, screenHeight: number, margin = 0, reachUp = 0, reachDown = 0): void {
    const [top, bottom] = this.rows;
    // An image that reaches its top or bottom edge continues past it, to the window's edge.
    const y0 = top <= 0 ? -margin : Math.max(-margin, rect.y + top * rect.height - reachUp - margin);
    const y1 = bottom >= 1 ? screenHeight + margin : Math.min(screenHeight + margin, rect.y + bottom * rect.height + reachDown + margin);
    this.view.visible = y1 > y0;
    this.view.position.set(-margin, y0);
    this.view.scale.set(screenWidth + margin * 2, Math.max(y1 - y0, 1));
    this.uniforms.uniforms.uRect.set([rect.x, rect.y, rect.width, rect.height]);
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy();
  }
}
