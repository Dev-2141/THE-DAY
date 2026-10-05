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

export class CanvasPlane {
  readonly view: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup<{
    uRect: { value: Float32Array; type: 'vec4<f32>' };
    uHalfTexel: { value: Float32Array; type: 'vec2<f32>' };
    uMargins: { value: Float32Array; type: 'vec2<f32>' };
  }>;

  constructor(texture: Texture, shading?: CanvasShading) {
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
   * response), sampling the image as if it sat at `rect`.
   */
  place(rect: ScreenRect, screenWidth: number, screenHeight: number, margin = 0): void {
    this.view.position.set(-margin, -margin);
    this.view.scale.set(screenWidth + margin * 2, screenHeight + margin * 2);
    this.uniforms.uniforms.uRect.set([rect.x, rect.y, rect.width, rect.height]);
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy();
  }
}
