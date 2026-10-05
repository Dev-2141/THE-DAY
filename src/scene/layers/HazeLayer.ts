import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader } from 'pixi.js';
import type { ClockFrame } from '../../core/clock';
import { config, type HazePlaneConfig } from '../../config/config';
import { GLSL_NOISE, GLSL_PERIODIC_NOISE, loopOffset } from '../gl/noise';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { overscan } from '../viewport';

export type HazeDepth = 'far' | 'mid' | 'near';

/** The haze pattern repeats after this many noise cells; the drift is folded into it. */
const HAZE_PERIOD = 32;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_PERIODIC_NOISE}
uniform vec4 uPoster;     // poster x, y, width, height (screen px)
uniform vec4 uBand;       // top, peak, bottom (poster y), opacity
uniform vec4 uPatch;      // noise cells per poster width, drift offset (cells), variation, -
uniform vec3 uHaze;
uniform vec4 uSun;        // colour, reach (poster widths)
uniform vec4 uBeam;       // colour, reach (poster widths)
uniform vec4 uPoints;     // sun x, y and beam foot x, y (poster fractions)

void main() {
  vec2 p = (vScreen - uPoster.xy) / uPoster.zw;
  float band = smoothstep(uBand.x, uBand.y, p.y) * (1.0 - smoothstep(uBand.y, uBand.z, p.y));
  if (band <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }
  // Slow drifting patches, stretched sideways like layered mist.
  vec2 q = vec2(p.x * uPatch.x + uPatch.y, p.y * uPatch.x * 2.4);
  float patches = periodicFbm3(q, vec2(${HAZE_PERIOD}.0, 4096.0));
  float density = band * uBand.w * clamp(1.0 + uPatch.z * 2.0 * patches, 0.0, 2.0);

  // Distances in poster widths, so the reach is round on any window.
  float aspect = uPoster.w / uPoster.z;
  vec2 toSun = (p - uPoints.xy) * vec2(1.0, aspect);
  vec2 toBeam = (p - uPoints.zw) * vec2(1.0, aspect * 2.0);
  float sun = exp(-dot(toSun, toSun) / (uSun.a * uSun.a));
  float beam = exp(-dot(toBeam, toBeam) / (uBeam.a * uBeam.a));
  vec3 colour = mix(mix(uHaze, uSun.rgb, sun), uBeam.rgb, beam);
  finalColor = vec4(colour * density, density) * uColor.a;
}
`;

/**
 * Drifting haze between two distance planes. Each plane of haze is drawn in
 * front of everything farther away, so the farther things are, the more haze
 * lies over them: paler and lower in contrast. Warmer toward the sun, cooler
 * where the beam lights it. Nearer planes drift faster.
 */
export class HazeLayer implements SceneLayer {
  readonly id: string;
  readonly view = new Container();
  private readonly settings: HazePlaneConfig;
  private quad: Mesh<MeshGeometry, Shader> | null = null;
  private readonly uniforms: UniformGroup<{
    uPoster: { value: Float32Array; type: 'vec4<f32>' };
    uBand: { value: Float32Array; type: 'vec4<f32>' };
    uPatch: { value: Float32Array; type: 'vec4<f32>' };
    uHaze: { value: Float32Array; type: 'vec3<f32>' };
    uSun: { value: Float32Array; type: 'vec4<f32>' };
    uBeam: { value: Float32Array; type: 'vec4<f32>' };
    uPoints: { value: Float32Array; type: 'vec4<f32>' };
  }>;

  constructor(depth: HazeDepth) {
    this.id = `haze-${depth}`;
    const haze = config.layers.haze;
    this.settings = haze[depth];
    const s = this.settings;
    const { sunGlow, beams } = config.layers;
    this.uniforms = new UniformGroup({
      uPoster: { value: new Float32Array(4), type: 'vec4<f32>' },
      uBand: { value: new Float32Array([s.top, s.peak, s.bottom, s.opacity]), type: 'vec4<f32>' },
      uPatch: { value: new Float32Array([s.scale, 0, s.variation, 0]), type: 'vec4<f32>' },
      uHaze: { value: new Float32Array(hexToRgb(haze.color)), type: 'vec3<f32>' },
      uSun: { value: new Float32Array([...hexToRgb(haze.sunColor), haze.sunReach]), type: 'vec4<f32>' },
      uBeam: { value: new Float32Array([...hexToRgb(haze.beamColor), haze.beamReach]), type: 'vec4<f32>' },
      uPoints: {
        value: new Float32Array([sunGlow.x, sunGlow.y, beams.ground.x, beams.ground.y]),
        type: 'vec4<f32>',
      },
    });
  }

  async load(): Promise<void> {
    this.quad = createQuad(this.id, FRAGMENT, { hazeUniforms: this.uniforms });
    this.view.addChild(this.quad);
  }

  resize(viewport: PosterViewport): void {
    if (this.quad === null) return;
    // Full window width, but only the rows the haze band covers.
    const y0 = viewport.y + this.settings.top * viewport.height;
    const y1 = viewport.y + this.settings.bottom * viewport.height;
    const margin = overscan(viewport);
    this.quad.position.set(-margin, y0);
    this.quad.scale.set(viewport.screenWidth + margin * 2, y1 - y0);
    this.uniforms.uniforms.uPoster.set([viewport.x, viewport.y, viewport.width, viewport.height]);
    this.uniforms.update();
  }

  update(frame: ClockFrame): void {
    const { speed, scale } = this.settings;
    // Patches drift downwind: the pattern moves +x when the wind blows left to right.
    this.uniforms.uniforms.uPatch[1] = loopOffset(frame.time, -speed * scale * config.wind.direction, HAZE_PERIOD);
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
