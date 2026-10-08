import { Container, UniformGroup } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { AssetKey } from '../../assets/manifest';
import type { ClockFrame } from '../../core/clock';
import { config, type GrassPlaneConfig } from '../../config/config';
import { GLSL_NOISE } from '../gl/noise';
import { CanvasPlane } from '../gl/planes';
import { hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import type { SceneTuning } from '../tuning';
import { canvasRect, overscan } from '../viewport';
import { WIND_GLSL, windAt, windUniformValues, writeWind } from '../wind';

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${WIND_GLSL}
uniform vec4 uPoster;   // poster x, y, width, height (screen px)
uniform vec4 uBend;     // full bend (px), root (poster y), bend height (poster heights), plane amplitude
uniform vec4 uBlade;    // blade variation (cells per poster width), seed, focus (px), sheen
uniform vec4 uMotion;   // sway, flutter, nod (px), -
uniform vec3 uSheen;

void main() {
  vec2 p = (vScreen - uPoster.xy) / uPoster.zw;
  // 0 at the roots, 1 at the bend height: tips move most, roots never.
  float rise = (uBend.y - p.y) / uBend.z;
  float profile = clamp(pow(max(rise, 0.0), 1.6), 0.0, 2.2);

  // Every blade differs a little in stiffness and timing, so they never move as one.
  float bx = p.x * uBlade.x + uBlade.y;
  float stiffness = 0.6 + 0.8 * clamp(gradientNoise(vec2(bx, 3.1)) + 0.5, 0.0, 1.0);
  float lag = gradientNoise(vec2(bx, 7.7)) * 0.05;
  float phase = (gradientNoise(vec2(bx * 1.7, 1.3)) + 0.5) * 12.566371;

  float gust = gustAt(p.x - uWindState.x * lag);
  float sway = 0.6 * sin(uWindPhase.x + p.x * 5.0 + phase * 0.25) + 0.4 * sin(uWindPhase.y + p.x * 2.3);
  float flutter = 0.6 * sin(uWindPhase.z + phase) + 0.4 * sin(uWindPhase.w + phase * 1.7);
  float push = uWindState.x * (uWindState.y + gust) * stiffness;
  float force = push
    + uMotion.x * sway * (0.4 + 0.6 * uWindState.z)
    + uMotion.y * flutter * (0.2 + max(gust, 0.0));

  float dx = force * uBend.x * uBend.w * profile;
  // A bending blade keeps its length: its tip dips instead of stretching.
  float heightPx = max(rise, 0.08) * uBend.z * uPoster.w;
  float dy = dx * dx / (2.0 * heightPx);
  // Flowers nod on their stems.
  dy += uMotion.z * profile * (0.35 + max(gust, 0.0)) * sin(uWindPhase.z * 1.0 + phase * 2.0);

  vec4 src = sampleCanvasSoft(vScreen - vec2(dx, dy), uBlade.z);
  // Bent blades turn their paler sides to the light: the gust's wave shows.
  float sheen = uBlade.w * max(gust, 0.0) * min(profile, 1.0);
  finalColor = vec4(src.rgb + uSheen * sheen * src.a, src.a) * uColor.a;
}
`;

type GrassUniforms = UniformGroup<{
  uPoster: { value: Float32Array; type: 'vec4<f32>' };
  uBend: { value: Float32Array; type: 'vec4<f32>' };
  uBlade: { value: Float32Array; type: 'vec4<f32>' };
  uMotion: { value: Float32Array; type: 'vec4<f32>' };
  uSheen: { value: Float32Array; type: 'vec3<f32>' };
}>;

interface GrassPlane {
  readonly key: AssetKey;
  readonly settings: GrassPlaneConfig;
  /** Nod of the flowers, as a poster width fraction; 0 for grass. */
  readonly nod: number;
}

/** Back to front. The flowers sit among the grass and move with the plane they grow in. */
function planes(): readonly GrassPlane[] {
  const grass = config.layers.grass;
  return [
    { key: 'grassFar', settings: grass.far, nod: 0 },
    { key: 'grassMid', settings: grass.mid, nod: 0 },
    { key: 'flowers', settings: grass[grass.flowers.follow], nod: grass.flowers.bob },
    { key: 'grassNear', settings: grass.near, nod: 0 },
  ];
}

/**
 * Layer 12: the grass, reeds and small flowers along the bottom, in three
 * depth planes moving in the wind. Roots stay fixed and tips move most;
 * gusts travel across the screen as visible waves in the wind's direction,
 * with calmer spells between them. Each blade has its own stiffness and
 * timing; the nearest plane moves most and is slightly out of focus; the
 * flowers nod with the grass around them.
 */
export class GrassLayer implements SceneLayer {
  readonly id = 'grass';
  readonly view = new Container();
  /** The nearest plane, for the depth-of-field pass. */
  readonly nearView = new Container();
  private readonly planes = planes();
  private canvasPlanes: CanvasPlane[] = [];
  private readonly grassUniforms: GrassUniforms[] = [];
  private readonly wind = new UniformGroup(windUniformValues());

  constructor(private readonly tuning: SceneTuning) {}

  async load(): Promise<void> {
    const textures = await Promise.all(this.planes.map((plane) => loadTexture(plane.key)));
    this.canvasPlanes = textures.map((texture, i) => {
      const plane = this.planes[i];
      const uniforms: GrassUniforms = new UniformGroup({
        uPoster: { value: new Float32Array(4), type: 'vec4<f32>' },
        uBend: { value: new Float32Array(4), type: 'vec4<f32>' },
        uBlade: { value: new Float32Array(4), type: 'vec4<f32>' },
        uMotion: { value: new Float32Array(4), type: 'vec4<f32>' },
        uSheen: { value: new Float32Array(hexToRgb(config.layers.grass.sheenColor)), type: 'vec3<f32>' },
      });
      this.grassUniforms.push(uniforms);
      return new CanvasPlane(texture, {
        name: `grass-${plane?.key ?? i}`,
        fragment: FRAGMENT,
        resources: { grassUniforms: uniforms, windUniforms: this.wind },
      });
    });
    this.canvasPlanes.forEach((plane, i) => {
      // The nearest plane goes in its own container so it can be softened as a whole.
      if (this.planes[i]?.key === 'grassNear') this.nearView.addChild(plane.view);
      else this.view.addChild(plane.view);
    });
    this.view.addChild(this.nearView);
  }

  resize(viewport: PosterViewport): void {
    const rect = canvasRect(viewport);
    const margin = overscan(viewport);
    const grass = config.layers.grass;
    // Bent blades move sideways and dip; only the flowers' nod lifts anything, and only a little.
    const reachUp = (grass.flowers.bob * 2 + grass.near.focus * 2) * viewport.width + 2;
    const reachDown = grass.maxBend * viewport.width;
    this.canvasPlanes.forEach((plane, i) => {
      plane.place(rect, viewport.screenWidth, viewport.screenHeight, margin, reachUp, reachDown);
      const settings = this.planes[i];
      const group = this.grassUniforms[i];
      if (settings === undefined || group === undefined) return;
      const u = group.uniforms;
      const { amplitude, focus, bladeScale, seed } = settings.settings;
      u.uPoster.set([viewport.x, viewport.y, viewport.width, viewport.height]);
      // The motion setting scales every movement: gusts, sway, flutter and the flowers' nod.
      u.uBend.set([grass.maxBend * viewport.width * this.tuning.wind, grass.root, grass.height, amplitude]);
      // Flowers are tiny: they follow their plane's motion but stay sharp.
      const soft = settings.nod > 0 ? 0 : focus * viewport.width;
      u.uBlade.set([bladeScale, seed, soft, settings.nod > 0 ? 0 : grass.sheen]);
      u.uMotion.set([grass.sway, grass.flutter, settings.nod * viewport.width * this.tuning.wind, 0]);
      group.update();
    });
  }

  update(frame: ClockFrame): void {
    writeWind(this.wind.uniforms, windAt(frame.time));
    this.wind.update();
  }

  destroy(): void {
    for (const plane of this.canvasPlanes) plane.destroy();
    this.canvasPlanes = [];
    this.view.destroy({ children: true });
    for (const plane of this.planes) releaseTexture(plane.key);
  }
}
