import {
  BlurFilter,
  Container,
  RenderTexture,
  UniformGroup,
  type Mesh,
  type MeshGeometry,
  type Renderer,
  type Shader,
  type TEXTURE_FORMATS,
} from 'pixi.js';
import { config } from '../../config/config';
import { createQuad, hexToRgb, type QuadResource } from '../gl/quad';
import type { PosterViewport } from '../types';
import { posterPoint } from '../viewport';
import { BRIGHT_FRAGMENT, COMPOSITE_FRAGMENT, DOWN_FRAGMENT, SHAFTS_FRAGMENT, UP_FRAGMENT } from './shaders';

export type PostPassName =
  | 'bloom'
  | 'shafts'
  | 'light'
  | 'tone'
  | 'grade'
  | 'atmosphere'
  | 'dof'
  | 'grain'
  | 'vignette'
  | 'dither';

export const POST_PASSES: readonly PostPassName[] = [
  'bloom',
  'shafts',
  'light',
  'tone',
  'grade',
  'atmosphere',
  'dof',
  'grain',
  'vignette',
  'dither',
];

/** Layers softened by the depth-of-field pass. */
export interface FocusTargets {
  readonly far: readonly Container[];
  readonly near: readonly Container[];
}

/** Bloom works on a chain of targets at 1/4 .. 1/64 of the screen, below the 1/2 bright pass. */
const BLOOM_LEVELS = 5;

type TexelUniforms = UniformGroup<{ uTexel: { value: Float32Array; type: 'vec4<f32>' } }>;

/** One full-target quad pass. */
class Pass {
  readonly view = new Container();
  readonly mesh: Mesh<MeshGeometry, Shader>;
  readonly texel: TexelUniforms = new UniformGroup({ uTexel: { value: new Float32Array(4), type: 'vec4<f32>' } });

  constructor(name: string, fragment: string, resources: Readonly<Record<string, QuadResource>>) {
    this.mesh = createQuad(name, fragment, { ...resources, texelUniforms: this.texel });
    this.view.addChild(this.mesh);
  }

  /** Draw into `target`, reading a source of `sourcePixels` size. */
  run(renderer: Renderer, target: RenderTexture, sourcePixels: readonly [number, number], extra = 0): void {
    this.texel.uniforms.uTexel.set([1 / sourcePixels[0], 1 / sourcePixels[1], extra, 0]);
    this.texel.update();
    this.mesh.scale.set(target.width, target.height);
    renderer.render({ container: this.view, target, clear: false });
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

function pixels(texture: RenderTexture): [number, number] {
  return [texture.source.pixelWidth, texture.source.pixelHeight];
}

function strength(on: boolean, value: number): number {
  return on ? value : 0;
}

/**
 * Renders the scene to an off-screen target and finishes it in passes:
 * bloom on bright sources (prefilter and a dual-filter blur chain), sun
 * shafts, then one composite pass for key and fill light, atmosphere,
 * tone curve, grade, vignette, grain and dither. Depth of field softens the
 * farthest sky and the nearest grass at the layer level. Every pass has its
 * own strength in config.post and can be switched off for comparison.
 */
export class PostProcessor {
  /** The finished picture, drawn to the screen by the stage. */
  readonly output: Mesh<MeshGeometry, Shader>;
  private readonly enabled: Record<PostPassName, boolean>;
  /** Passes the quality level lets run; a pass runs only if it is also enabled. */
  private allowed: ReadonlySet<PostPassName> = new Set(POST_PASSES);
  private master = config.post.enabled;
  private readonly scene: RenderTexture;
  private readonly bright: RenderTexture;
  private readonly downs: RenderTexture[];
  private readonly ups: RenderTexture[];
  private readonly shaftsTarget: RenderTexture;
  private readonly brightPass: Pass;
  private readonly downPasses: Pass[];
  private readonly upPasses: Pass[];
  private readonly shaftsPass: Pass;
  private readonly shaftsUniforms = new UniformGroup({
    uSun: { value: new Float32Array(4), type: 'vec4<f32>' },
    uShape: { value: new Float32Array(4), type: 'vec4<f32>' },
  });
  private readonly thresholdUniforms = new UniformGroup({
    uThreshold: { value: new Float32Array(4), type: 'vec4<f32>' },
  });
  private readonly composite = new UniformGroup({
    uScreen: { value: new Float32Array(4), type: 'vec4<f32>' },
    uPoster: { value: new Float32Array(4), type: 'vec4<f32>' },
    uLetterbox: { value: new Float32Array([...hexToRgb(config.stage.background), 0]), type: 'vec4<f32>' },
    uKey: { value: new Float32Array(4), type: 'vec4<f32>' },
    uKeyColor: { value: new Float32Array(hexToRgb(config.post.light.keyColor)), type: 'vec3<f32>' },
    uFill: { value: new Float32Array(4), type: 'vec4<f32>' },
    uFillColor: { value: new Float32Array(hexToRgb(config.post.light.fillColor)), type: 'vec3<f32>' },
    uAtmosphere: { value: new Float32Array(4), type: 'vec4<f32>' },
    uAtmosphereColor: { value: new Float32Array(hexToRgb(config.post.atmosphere.color)), type: 'vec3<f32>' },
    uShaftsColor: { value: new Float32Array([...hexToRgb(config.post.shafts.color), 0]), type: 'vec4<f32>' },
    uBloomColor: { value: new Float32Array([...hexToRgb(config.post.bloom.tint), 0]), type: 'vec4<f32>' },
    uTone: { value: new Float32Array(4), type: 'vec4<f32>' },
    uGrade: { value: new Float32Array(4), type: 'vec4<f32>' },
    uShadows: { value: new Float32Array(hexToRgb(config.post.grade.shadows)), type: 'vec3<f32>' },
    uHighlights: { value: new Float32Array(hexToRgb(config.post.grade.highlights)), type: 'vec3<f32>' },
    uFinish: { value: new Float32Array(4), type: 'vec4<f32>' },
  });
  private readonly focus: FocusTargets;
  private readonly farBlur = new BlurFilter({ strength: 1, quality: 3 });
  private readonly nearBlur = new BlurFilter({ strength: 1, quality: 3 });
  private viewport: PosterViewport | null = null;

  constructor(focus: FocusTargets, lightFormat: TEXTURE_FORMATS) {
    this.focus = focus;
    const post = config.post;
    this.enabled = {
      bloom: post.bloom.enabled,
      shafts: post.shafts.enabled,
      light: post.light.enabled,
      tone: post.tone.enabled,
      grade: post.grade.enabled,
      atmosphere: post.atmosphere.enabled,
      dof: post.dof.enabled,
      grain: post.grain.enabled,
      vignette: post.vignette.enabled,
      dither: post.dither.enabled,
    };
    const target = (format: TEXTURE_FORMATS): RenderTexture =>
      RenderTexture.create({ width: 1, height: 1, resolution: 1, format });
    // Half-float targets where the device allows: the scene keeps its smooth
    // gradients through the grade, and the wide, faint end of the bloom never bands.
    this.scene = target(lightFormat);
    this.bright = target(lightFormat);
    this.downs = Array.from({ length: BLOOM_LEVELS }, () => target(lightFormat));
    this.ups = Array.from({ length: BLOOM_LEVELS }, () => target(lightFormat));
    this.shaftsTarget = target(lightFormat);

    this.brightPass = new Pass('post-bright', BRIGHT_FRAGMENT, {
      uSource: this.scene.source,
      thresholdUniforms: this.thresholdUniforms,
    });
    this.downPasses = this.downs.map(
      (_, i) => new Pass(`post-down-${i}`, DOWN_FRAGMENT, { uSource: (i === 0 ? this.bright : this.downs[i - 1] ?? this.bright).source }),
    );
    // ups[i] combines the wider level (ups[i + 1], or the last down) with downs[i - 1] (or the bright pass).
    this.upPasses = this.ups.map((_, i) => {
      const wider = i === BLOOM_LEVELS - 1 ? this.downs[BLOOM_LEVELS - 1] : this.ups[i + 1];
      const detail = i === 0 ? this.bright : this.downs[i - 1];
      return new Pass(`post-up-${i}`, UP_FRAGMENT, {
        uSource: (wider ?? this.bright).source,
        uDetail: (detail ?? this.bright).source,
      });
    });
    this.shaftsPass = new Pass('post-shafts', SHAFTS_FRAGMENT, {
      uSource: this.scene.source,
      shaftsUniforms: this.shaftsUniforms,
    });
    this.output = createQuad('post-composite', COMPOSITE_FRAGMENT, {
      uScene: this.scene.source,
      uBloom: (this.ups[0] ?? this.bright).source,
      uShafts: this.shaftsTarget.source,
      compositeUniforms: this.composite,
    });
  }

  isEnabled(name: PostPassName): boolean {
    return this.enabled[name];
  }

  get masterEnabled(): boolean {
    return this.master;
  }

  setEnabled(name: PostPassName, on: boolean): void {
    this.enabled[name] = on;
    this.applySettings();
  }

  /** The passes the current quality level runs. */
  setAllowed(passes: readonly string[]): void {
    this.allowed = new Set(POST_PASSES.filter((name) => passes.includes(name)));
    this.applySettings();
  }

  /** Whether a pass runs right now: switched on, allowed by the quality level, and the master switch on. */
  isActive(name: PostPassName): boolean {
    return this.master && this.enabled[name] && this.allowed.has(name);
  }

  /** Off shows the scene exactly as the layers draw it, for comparison. */
  setMaster(on: boolean): void {
    this.master = on;
    this.applySettings();
  }

  setLetterbox(on: boolean): void {
    this.composite.uniforms.uLetterbox[3] = on ? 1 : 0;
    this.composite.update();
  }

  /** Size every target to the window and place the lights. */
  resize(viewport: PosterViewport, resolution: number): void {
    this.viewport = viewport;
    const w = viewport.screenWidth;
    const h = viewport.screenHeight;
    this.scene.resize(w, h, resolution);
    this.bright.resize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)), resolution);
    this.shaftsTarget.resize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)), resolution);
    this.downs.forEach((texture, i) => {
      const scale = 2 ** (i + 2);
      texture.resize(Math.max(1, Math.ceil(w / scale)), Math.max(1, Math.ceil(h / scale)), resolution);
    });
    this.ups.forEach((texture, i) => {
      const scale = 2 ** (i + 1);
      texture.resize(Math.max(1, Math.ceil(w / scale)), Math.max(1, Math.ceil(h / scale)), resolution);
    });
    this.output.position.set(0, 0);
    this.output.scale.set(w, h);
    this.applySettings();
  }

  /** Render the scene off-screen and run the passes; the stage then draws `output`. */
  render(renderer: Renderer, root: Container, time: number): void {
    renderer.render({ container: root, target: this.scene, clear: true, clearColor: config.stage.background });
    if (this.isActive('bloom')) {
      this.brightPass.run(renderer, this.bright, pixels(this.scene));
      this.downPasses.forEach((pass, i) => {
        const source = i === 0 ? this.bright : this.downs[i - 1];
        const target = this.downs[i];
        if (source !== undefined && target !== undefined) pass.run(renderer, target, pixels(source));
      });
      for (let i = BLOOM_LEVELS - 1; i >= 0; i--) {
        const wider = i === BLOOM_LEVELS - 1 ? this.downs[BLOOM_LEVELS - 1] : this.ups[i + 1];
        const target = this.ups[i];
        const pass = this.upPasses[i];
        if (wider !== undefined && target !== undefined && pass !== undefined) {
          pass.run(renderer, target, pixels(wider), config.post.bloom.spread);
        }
      }
    }
    if (this.isActive('shafts')) {
      this.shaftsPass.run(renderer, this.shaftsTarget, pixels(this.scene));
    }
    // Grain changes 24 times a second, like film, whatever the frame rate.
    this.composite.uniforms.uScreen[2] = Math.floor(time * 24) % 4096;
    this.composite.update();
  }

  destroy(): void {
    for (const pass of [this.brightPass, ...this.downPasses, ...this.upPasses, this.shaftsPass]) pass.destroy();
    this.output.destroy();
    for (const texture of [this.scene, this.bright, ...this.downs, ...this.ups, this.shaftsTarget]) {
      texture.destroy(true);
    }
    this.farBlur.destroy();
    this.nearBlur.destroy();
  }

  /** Push every strength (0 for a pass that is off) and the light positions to the shaders. */
  private applySettings(): void {
    const v = this.viewport;
    if (v === null) return;
    const post = config.post;
    const on = (name: PostPassName): boolean => this.isActive(name);
    const u = this.composite.uniforms;
    const [sunX, sunY] = posterPoint(v, config.layers.sunGlow.x, config.layers.sunGlow.y);
    const beam = config.layers.beams.ground;

    u.uScreen.set([v.screenWidth, v.screenHeight, u.uScreen[2] ?? 0, 0]);
    u.uPoster.set([v.x, v.y, v.width, v.height]);
    const light = on('light') ? post.light.strength : 0;
    u.uKey.set([sunX, sunY, post.light.keyReach * v.width, post.light.key * light]);
    u.uFill.set([
      v.x + beam.x * v.width,
      v.y + post.light.fillTop * v.height,
      post.light.fillReach * v.width,
      post.light.fill * light,
    ]);
    u.uAtmosphere.set([
      v.y + post.atmosphere.horizon * v.height,
      post.atmosphere.spread * v.height,
      strength(on('atmosphere'), post.atmosphere.strength),
      0,
    ]);
    u.uShaftsColor[3] = strength(on('shafts'), post.shafts.strength);
    u.uBloomColor[3] = strength(on('bloom'), post.bloom.strength);
    u.uTone.set([
      post.tone.exposure,
      strength(on('tone'), post.tone.strength),
      strength(on('tone'), post.tone.contrast),
      on('tone') ? post.tone.saturation : 1,
    ]);
    u.uGrade[0] = strength(on('grade'), post.grade.strength);
    u.uFinish.set([
      strength(on('vignette'), post.vignette.strength),
      strength(on('grain'), post.grain.strength),
      strength(on('dither'), post.dither.strength),
      0,
    ]);
    this.composite.update();

    const t = this.thresholdUniforms.uniforms.uThreshold;
    t.set([post.bloom.threshold, post.bloom.knee, 0, 0]);
    this.thresholdUniforms.update();
    const s = this.shaftsUniforms.uniforms;
    s.uSun.set([sunX / v.screenWidth, sunY / v.screenHeight, v.screenWidth / v.screenHeight, post.shafts.samples]);
    s.uShape.set([post.shafts.threshold[0], post.shafts.threshold[1], post.shafts.density, post.shafts.decay]);
    this.shaftsUniforms.update();

    // Depth of field at the layer level: the farthest sky and the nearest grass.
    const dof = on('dof');
    this.farBlur.strength = Math.max(post.dof.far * post.dof.strength * v.width, 0.5);
    this.nearBlur.strength = Math.max(post.dof.near * post.dof.strength * v.width, 0.5);
    for (const view of this.focus.far) view.filters = dof ? [this.farBlur] : [];
    for (const view of this.focus.near) view.filters = dof ? [this.nearBlur] : [];
  }
}
