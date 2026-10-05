import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader } from 'pixi.js';
import type { ClockFrame } from '../../core/clock';
import { config } from '../../config/config';
import { GLSL_NOISE } from '../gl/noise';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import type { SceneTuning } from '../tuning';
import { overscan } from '../viewport';
import { WIND_GLSL, windAt, windUniformValues, writeWind } from '../wind';

const SEED_LAYERS = 2;
/** The seed field repeats after this many cells; the drift is folded into it. */
const SEED_PERIOD = 64;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${WIND_GLSL}
#define SEED_LAYERS ${SEED_LAYERS}
#define SEED_PERIOD ${SEED_PERIOD}.0
uniform vec4 uPoster;              // poster x, y, width, height (screen px)
uniform vec4 uSeedA[SEED_LAYERS];  // cell (px), radius (cells), softness (cells), density
uniform vec4 uSeedB[SEED_LAYERS];  // drift offset x, y (cells), -, -
uniform vec4 uSeed;                // colour, opacity
uniform vec2 uBand;                // top and bottom (poster y)

void main() {
  vec2 p = (vScreen - uPoster.xy) / uPoster.zw;
  float band = smoothstep(uBand.x, uBand.x + 0.05, p.y) * (1.0 - smoothstep(uBand.y - 0.04, uBand.y, p.y));
  // Seeds are only seen while a gust carries them.
  float carried = smoothstep(0.08, 0.5, gustAt(p.x));
  if (band * carried <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }
  float sum = 0.0;
  for (int i = 0; i < SEED_LAYERS; i++) {
    vec4 a = uSeedA[i];
    vec2 q = (vScreen - uPoster.xy) / a.x - uSeedB[i].xy;
    vec2 id = mod(floor(q), SEED_PERIOD);
    vec2 h = hash22(id) * 0.5 + 0.5;
    vec2 g = hash22(id + 17.0) * 0.5 + 0.5;
    if (g.x > a.w) continue;
    // Each seed tumbles a little as it travels, with a frequency that divides
    // the pattern period so it never jumps.
    float tumble = sin(q.x * 6.2831853 * 3.0 / SEED_PERIOD + g.y * 6.2831853);
    vec2 centre = vec2(0.25 + 0.5 * h.x, 0.3 + 0.4 * h.y + 0.12 * tumble);
    vec2 d = fract(q) - centre;
    // Stretched a little along the wind, as fast-moving fluff looks.
    d.x *= 0.6;
    float r = length(d);
    float edge = a.y + a.z;
    float seed = 1.0 - smoothstep(a.y - a.z * 0.5, edge, r);
    sum += seed * (0.5 + 0.5 * g.y);
  }
  float alpha = clamp(sum, 0.0, 1.0) * band * carried * uSeed.a;
  finalColor = vec4(uSeed.rgb * alpha, alpha) * uColor.a;
}
`;

/**
 * Seeds and fluff carried by the gusts over the grass. They drift with the
 * wind all the time, but only show while a gust passes, so they arrive and
 * leave with each wave. The nearer layer is larger, faster and softer.
 */
export class SeedsLayer implements SceneLayer {
  readonly id = 'seeds';

  constructor(private readonly tuning: SceneTuning) {}

  readonly view = new Container();
  private quad: Mesh<MeshGeometry, Shader> | null = null;
  /** Distance each layer has drifted, folded into the pattern period (cells). */
  private readonly drifted = [0, 0];
  private readonly wind = new UniformGroup(windUniformValues());
  private readonly uniforms = new UniformGroup({
    uPoster: { value: new Float32Array(4), type: 'vec4<f32>' },
    uSeedA: { value: new Float32Array(4 * SEED_LAYERS), type: 'vec4<f32>', size: SEED_LAYERS },
    uSeedB: { value: new Float32Array(4 * SEED_LAYERS), type: 'vec4<f32>', size: SEED_LAYERS },
    uSeed: {
      value: new Float32Array([...hexToRgb(config.layers.grass.seeds.color), config.layers.grass.seeds.opacity]),
      type: 'vec4<f32>',
    },
    uBand: {
      value: new Float32Array([config.layers.grass.seeds.top, config.layers.grass.seeds.bottom]),
      type: 'vec2<f32>',
    },
  });

  async load(): Promise<void> {
    this.quad = createQuad('seeds', FRAGMENT, { seedUniforms: this.uniforms, windUniforms: this.wind });
    this.view.addChild(this.quad);
  }

  resize(viewport: PosterViewport): void {
    if (this.quad === null) return;
    const { seeds } = config.layers.grass;
    const y0 = viewport.y + seeds.top * viewport.height;
    const y1 = viewport.y + seeds.bottom * viewport.height;
    const margin = overscan(viewport);
    this.quad.position.set(-margin, y0);
    this.quad.scale.set(viewport.screenWidth + margin * 2, Math.max(y1 - y0, 1));
    const u = this.uniforms.uniforms;
    u.uPoster.set([viewport.x, viewport.y, viewport.width, viewport.height]);
    seeds.layers.slice(0, SEED_LAYERS).forEach((layer, i) => {
      const cell = Math.max(layer.cell * viewport.width, 6);
      const radius = Math.max(layer.size * viewport.width, 0.8) / cell;
      const soft = Math.max(layer.softness * viewport.width, 0.6) / cell;
      u.uSeedA.set([cell, radius, soft, layer.density * this.tuning.particles * this.tuning.wind], i * 4);
    });
    this.uniforms.update();
  }

  update(frame: ClockFrame): void {
    const wind = windAt(frame.time);
    writeWind(this.wind.uniforms, wind);
    this.wind.update();
    const { seeds } = config.layers.grass;
    const u = this.uniforms.uniforms;
    // Seeds speed up while the wind is gusty. Integrated over the frame, so
    // the motion is the same at any frame rate.
    const speed = (seeds.drift + seeds.carry * wind.gustiness) * config.wind.direction;
    seeds.layers.slice(0, SEED_LAYERS).forEach((layer, i) => {
      const step = (speed * layer.speed * frame.delta) / layer.cell;
      const next = ((this.drifted[i] ?? 0) + step) % SEED_PERIOD;
      this.drifted[i] = next < 0 ? next + SEED_PERIOD : next;
      u.uSeedB[i * 4] = this.drifted[i] ?? 0;
      // A slow sink and rise, as fluff does.
      u.uSeedB[i * 4 + 1] = 0.25 * Math.sin((frame.time / 9) * Math.PI * 2 + i * 1.9);
    });
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
