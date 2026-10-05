import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader, type Sprite } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { ClockFrame } from '../../core/clock';
import { config } from '../../config/config';
import { GLSL_NOISE, GLSL_PERIODIC_NOISE, loopOffset } from '../gl/noise';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { posterPoint } from '../viewport';
import { createObjectSprite, placeObject } from './objectSprite';

/** The smoke pattern repeats after this many cells; its rise is folded into it. */
const SMOKE_PERIOD = 16;

const SMOKE_FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_PERIODIC_NOISE}
uniform vec4 uSmoke;     // colour, opacity
uniform vec4 uMotion;    // rise offset (cells), lean (signed), -, -

void main() {
  float h = 1.0 - vUnit.y;              // 0 at the source, 1 at the top
  float x = vUnit.x - 0.5;
  // The plume widens as it rises and bends downwind.
  float centre = uMotion.y * h * h * 0.4;
  float spread = 0.05 + 0.2 * h;
  float column = exp(-pow((x - centre) / spread, 2.0));
  float n = periodicFbm3(vec2(vUnit.x * 3.0, h * 2.5 - uMotion.x), vec2(4096.0, ${SMOKE_PERIOD}.0));
  float density = column * smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.45, 1.0, h));
  float a = density * clamp(0.5 + 1.8 * n, 0.0, 1.0) * uSmoke.a;
  finalColor = vec4(uSmoke.rgb * a, a) * uColor.a;
}
`;

/**
 * Layer 10: the small crashed craft at the lower left, with a faint wisp of
 * smoke rising from it, widening and bending with the wind as it thins.
 */
export class WreckLayer implements SceneLayer {
  readonly id = 'wreck';
  readonly view = new Container();
  private sprite: Sprite | null = null;
  private smoke: Mesh<MeshGeometry, Shader> | null = null;
  private readonly uniforms = new UniformGroup({
    uSmoke: {
      value: new Float32Array([...hexToRgb(config.layers.wreck.smoke.color), config.layers.wreck.smoke.opacity]),
      type: 'vec4<f32>',
    },
    uMotion: {
      value: new Float32Array([0, config.layers.wreck.smoke.lean * config.wind.direction, 0, 0]),
      type: 'vec4<f32>',
    },
  });

  async load(): Promise<void> {
    this.sprite = createObjectSprite(await loadTexture('wreck'));
    this.smoke = createQuad('wreck-smoke', SMOKE_FRAGMENT, { smokeUniforms: this.uniforms });
    this.view.addChild(this.sprite, this.smoke);
  }

  resize(viewport: PosterViewport): void {
    if (this.sprite !== null) placeObject(this.sprite, config.layers.wreck.placement, viewport);
    if (this.smoke === null) return;
    const { source, width, height } = config.layers.wreck.smoke;
    const [sx, sy] = posterPoint(viewport, source[0], source[1]);
    const w = width * viewport.width;
    const h = height * viewport.width;
    this.smoke.position.set(sx - w / 2, sy - h);
    this.smoke.scale.set(w, h);
  }

  update(frame: ClockFrame): void {
    // The pattern spans 2.5 cells over the plume's height.
    this.uniforms.uniforms.uMotion[0] = loopOffset(frame.time, config.layers.wreck.smoke.rise * 2.5, SMOKE_PERIOD);
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy({ children: true });
    releaseTexture('wreck');
  }
}
