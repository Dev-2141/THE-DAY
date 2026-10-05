import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { AssetKey } from '../../assets/manifest';
import { SCENE_CANVAS, assetManifest } from '../../assets/manifest';
import type { ClockFrame } from '../../core/clock';
import { config, type CloudPlaneConfig } from '../../config/config';
import { GLSL_NOISE } from '../gl/noise';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { canvasRect, canvasUnit, overscan, posterPoint } from '../viewport';

export type CloudDepth = 'far' | 'mid' | 'near';

const ASSET: Record<CloudDepth, AssetKey> = {
  far: 'cloudsFar',
  mid: 'cloudsMid',
  near: 'cloudsNear',
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D uTexture;
uniform vec3 uCanvas;      // canvas origin on screen (px), screen px per 4K canvas px
uniform vec4 uTile;        // tile origin and size, 4K canvas px
uniform vec2 uHalfTexel;
uniform vec2 uDrift;       // wind offset: wrapped to the tile (for sampling), and unwrapped (for the warp)
uniform vec4 uWarp;        // amplitude (px), 1 / feature size, evolution phase, -
uniform vec4 uPoster;      // poster rectangle on screen
uniform float uEdgeFade;   // fade distance past the poster, screen px (0 = off)
uniform vec4 uSun;         // sun centre (screen), reach (px), warm-edge strength
uniform vec3 uSunColor;
uniform vec4 uBeam;        // beam centre x (screen), reach (px), cool-tint strength, -
uniform vec3 uBeamColor;
uniform vec4 uMask;        // centre x, start and full distance (px), lowest y (px); start < 0 = no mask

void main() {
  vec2 canvasPx = (vScreen - uCanvas.xy) / uCanvas.z;

  // A slowly evolving distortion that travels with the cloud, so shapes
  // change as they drift instead of only sliding.
  vec2 q = (canvasPx - vec2(uDrift.y, 0.0)) * uWarp.y;
  float t = uWarp.z;
  vec2 warp = vec2(
    fbm3(q + vec2(t, -0.7 * t)),
    fbm3(q + vec2(5.2 - 0.6 * t, 1.3 + t))
  ) * uWarp.x;

  vec2 raw = (canvasPx - vec2(uDrift.x, 0.0) + warp - uTile.xy) / uTile.zw;
  float inside = 1.0 - step(1.0, raw.y);
  vec2 uv = vec2(fract(raw.x), clamp(raw.y, uHalfTexel.y, 1.0 - uHalfTexel.y));
  // Gradients of the unwrapped coordinate keep the repeat seam invisible.
  vec4 c = textureGrad(uTexture, uv, dFdx(raw), dFdy(raw)) * inside;

  if (uMask.y >= 0.0) {
    // Only away from the centre and above a line: the ship's outer edges.
    float side = smoothstep(uMask.y, uMask.z, abs(vScreen.x - uMask.x));
    float above = 1.0 - smoothstep(uMask.w - (uMask.z - uMask.y) * 0.25, uMask.w, vScreen.y);
    c *= side * above;
  }

  if (uEdgeFade > 0.0) {
    vec2 outside = max(max(uPoster.xy - vScreen, vScreen - (uPoster.xy + uPoster.zw)), 0.0);
    c *= 1.0 - smoothstep(0.0, uEdgeFade, length(outside));
  }

  // Thin, translucent parts of a cloud catch the light at its edges.
  float a = c.a;
  float edge = clamp(a * (1.0 - a) * 4.0, 0.0, 1.0);
  float toSun = length(vScreen - uSun.xy) / uSun.z;
  c.rgb += uSunColor * (edge * exp(-toSun * toSun) * uSun.w * a);
  float toBeam = (vScreen.x - uBeam.x) / uBeam.y;
  c.rgb = mix(c.rgb, uBeamColor * a, exp(-toBeam * toBeam) * uBeam.z * a);

  finalColor = c * uColor.a;
}
`;

/** Wisps drawn only over the ship's outer edges, from a shifted cloud tile. */
interface VeilOptions {
  readonly opacity: number;
  readonly speed: number;
  readonly edgeStart: number;
  readonly edgeFull: number;
  readonly bottom: number;
  readonly tileShift: number;
}

/**
 * Layers 2 and 3: one depth of cloud, drifting forever with the wind.
 *
 * Each plane is a seamless tile at the canvas's pixel scale. The far and mid
 * planes sit behind the ship, the near plane in front of it. All share the
 * wind direction; the farthest moves slowest. `CloudsLayer.shipVeil()` is a
 * further plane that passes in front of the ship's outer edges only.
 */
export class CloudsLayer implements SceneLayer {
  readonly id: string;
  readonly view = new Container();
  private readonly asset: AssetKey;
  private readonly settings: CloudPlaneConfig;
  private readonly veil: VeilOptions | null;
  private quad: Mesh<MeshGeometry, Shader> | null = null;
  private readonly uniforms = new UniformGroup({
    uCanvas: { value: new Float32Array(3), type: 'vec3<f32>' },
    uTile: { value: new Float32Array(4), type: 'vec4<f32>' },
    uHalfTexel: { value: new Float32Array(2), type: 'vec2<f32>' },
    uDrift: { value: new Float32Array(2), type: 'vec2<f32>' },
    uWarp: { value: new Float32Array(4), type: 'vec4<f32>' },
    uPoster: { value: new Float32Array(4), type: 'vec4<f32>' },
    uEdgeFade: { value: 0, type: 'f32' },
    uSun: { value: new Float32Array(4), type: 'vec4<f32>' },
    uSunColor: { value: new Float32Array(hexToRgb(config.layers.sunGlow.color)), type: 'vec3<f32>' },
    uBeam: { value: new Float32Array(4), type: 'vec4<f32>' },
    uBeamColor: { value: new Float32Array(hexToRgb(config.layers.beams.colorTop)), type: 'vec3<f32>' },
    uMask: { value: new Float32Array([0, -1, 0, 0]), type: 'vec4<f32>' },
  });

  constructor(depth: CloudDepth, veil: VeilOptions | null = null) {
    this.id = veil === null ? `clouds-${depth}` : 'ship-veil';
    this.asset = ASSET[depth];
    const plane = config.layers.clouds[depth];
    this.settings = veil === null ? plane : { ...plane, opacity: veil.opacity, speed: veil.speed };
    this.veil = veil;
  }

  /** Wisps from the near clouds, passing in front of the ship's outer edges. */
  static shipVeil(): CloudsLayer {
    return new CloudsLayer('near', config.layers.ship.veil);
  }

  async load(): Promise<void> {
    const texture = await loadTexture(this.asset);
    texture.source.autoGenerateMipmaps = true;
    texture.source.scaleMode = 'linear';
    const [tileWidth, tileHeight] = assetManifest[this.asset].size4k;
    const u = this.uniforms.uniforms;
    // The veil borrows a cloud tile shifted vertically onto the ship's height.
    const shift = (this.veil?.tileShift ?? 0) * SCENE_CANVAS.posterHeight;
    u.uTile.set([config.layers.clouds.originX, shift, tileWidth, tileHeight]);
    u.uHalfTexel.set([0.5 / texture.source.pixelWidth, 0.5 / texture.source.pixelHeight]);
    u.uWarp.set([this.settings.warp.amplitude, 1 / this.settings.warp.scale, 0, 0]);
    this.quad = createQuad(this.id, FRAGMENT, { uTexture: texture.source, cloudUniforms: this.uniforms });
    this.quad.alpha = this.settings.opacity;
    this.view.addChild(this.quad);
  }

  resize(viewport: PosterViewport): void {
    if (this.quad === null) return;
    const unit = canvasUnit(viewport);
    const canvas = canvasRect(viewport);
    const { clouds, sunGlow, beams } = config.layers;
    const u = this.uniforms.uniforms;
    const margin = overscan(viewport);
    this.quad.position.set(-margin, -margin);
    this.quad.scale.set(viewport.screenWidth + margin * 2, viewport.screenHeight + margin * 2);
    u.uCanvas.set([canvas.x, canvas.y, unit]);
    u.uPoster.set([viewport.x, viewport.y, viewport.width, viewport.height]);
    u.uEdgeFade = clouds.edgeFade * unit;
    const [sx, sy] = posterPoint(viewport, sunGlow.x, sunGlow.y);
    u.uSun.set([sx, sy, clouds.light.sunReach * viewport.width, clouds.light.sunEdge]);
    const beamLeft = Math.min(...beams.sheets.map((s) => s.x0));
    const beamRight = Math.max(...beams.sheets.map((s) => s.x1));
    const [bx] = posterPoint(viewport, (beamLeft + beamRight) / 2, 0);
    u.uBeam.set([bx, clouds.light.beamReach * viewport.width, clouds.light.beamTint, 0]);
    if (this.veil !== null) {
      const [cx] = posterPoint(viewport, config.layers.ship.pivot[0], 0);
      u.uMask.set([
        cx,
        this.veil.edgeStart * viewport.width,
        this.veil.edgeFull * viewport.width,
        viewport.y + this.veil.bottom * viewport.height,
      ]);
    }
    this.uniforms.update();
  }

  update(frame: ClockFrame): void {
    const tileWidth = assetManifest[this.asset].size4k[0];
    // Kept in double precision here; only the wrapped value needs to be exact on the GPU.
    const offset = config.wind.direction * this.settings.speed * frame.time;
    const u = this.uniforms.uniforms;
    u.uDrift[0] = ((offset % tileWidth) + tileWidth) % tileWidth;
    u.uDrift[1] = offset;
    u.uWarp[2] = frame.time * this.settings.warp.evolve;
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy({ children: true });
    releaseTexture(this.asset);
  }
}
