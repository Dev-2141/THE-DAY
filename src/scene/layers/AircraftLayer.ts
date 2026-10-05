import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader, type Sprite, type Texture } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { ClockFrame } from '../../core/clock';
import { hash01 } from '../../core/hash';
import { smoothstep } from '../../core/math';
import { config, type Placement } from '../../config/config';
import { GLSL_NOISE } from '../gl/noise';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import type { ScreenRect } from '../viewport';
import { createObjectSprite, placeObject } from './objectSprite';

const TRAIL_FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform vec4 uTrail;    // length (px), aircraft speed (px/s), fade (s), distance flown since entry (px)
uniform vec4 uWidth;    // width at the aircraft (px), spread (px/s), quad half-height (px), opacity
uniform vec4 uTint;     // colour, entry fade distance (px)
uniform float uSeed;

void main() {
  float behind = (1.0 - vUnit.x) * uTrail.x;     // px behind the aircraft
  float age = behind / max(uTrail.y, 1e-3);      // seconds since this part was made
  float width = uWidth.x + uWidth.y * age;
  float y = (vUnit.y - 0.5) * 2.0 * uWidth.z;
  float across = exp(-y * y / (width * width));
  float life = exp(-age / uTrail.z);
  // Where along the path this part was made: fixed in the air, so the
  // break-up pattern stays put while the trail ages.
  float made = uTrail.w - behind;
  float entry = smoothstep(0.0, uTint.a, made);
  float n = gradientNoise(vec2(made / (uWidth.x * 10.0) + uSeed, age * 0.1));
  float breakup = clamp(1.0 + n * 1.8 * smoothstep(0.0, 5.0, age), 0.0, 1.6);
  float start = smoothstep(0.0, uWidth.x * 4.0, behind);
  // Spreading thins the vapour, so it fades as it widens.
  float a = across * life * entry * breakup * start * uWidth.w * (uWidth.x / width);
  finalColor = vec4(uTint.rgb * a, a) * uColor.a;
}
`;

/** One pass of one aircraft across the sky. */
interface Pass {
  readonly index: number;
  /** Scene time at which the aircraft is at the start of its path. */
  readonly start: number;
  /** Seconds to fly the whole path, and the pause before the next pass. */
  readonly travel: number;
  readonly pause: number;
  readonly heading: number;
  readonly offset: number;
  readonly speed: number;
}

type TrailUniforms = UniformGroup<{
  uTrail: { value: Float32Array; type: 'vec4<f32>' };
  uWidth: { value: Float32Array; type: 'vec4<f32>' };
  uTint: { value: Float32Array; type: 'vec4<f32>' };
  uSeed: { value: number; type: 'f32' };
}>;

/**
 * Pass `index` of the aircraft with `seed`. The first pass flies exactly the
 * reference path; later passes vary heading, offset and speed a little, so
 * the loop is not obvious.
 */
function passFor(index: number, seed: number, start: number | null): Pass {
  const { flight } = config.layers.aircraft;
  const vary = index === 0 ? 0 : 1;
  const r = (salt: number): number => hash01(index, seed * 13 + salt) * 2 - 1;
  const heading = flight.heading + vary * flight.vary.heading * r(1);
  const offset = vary * flight.vary.offset * r(2);
  const speed = flight.speed * (1 + vary * flight.vary.speed * r(3));
  const [pauseMin, pauseMax] = flight.pause;
  const pause = pauseMin + (pauseMax - pauseMin) * hash01(index, seed * 13 + 4);
  // The first pass is timed so the aircraft sits at its reference position at time 0.
  return {
    index,
    start: start ?? -flight.enter / speed,
    travel: flight.length / speed,
    pause,
    heading,
    offset,
    speed,
  };
}

class Aircraft {
  readonly view = new Container();
  private readonly sprite: Sprite;
  private readonly trail: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: TrailUniforms;
  private pass: Pass;

  constructor(
    texture: Texture,
    private readonly placement: Placement,
    private readonly seed: number,
  ) {
    this.sprite = createObjectSprite(texture);
    const { trail } = config.layers.aircraft;
    this.uniforms = new UniformGroup({
      uTrail: { value: new Float32Array([0, 1, trail.fade, 0]), type: 'vec4<f32>' },
      uWidth: { value: new Float32Array([1, 0, 1, trail.opacity]), type: 'vec4<f32>' },
      uTint: { value: new Float32Array([...hexToRgb(trail.color), 1]), type: 'vec4<f32>' },
      uSeed: { value: seed * 7.31, type: 'f32' },
    });
    this.trail = createQuad('aircraft-trail', TRAIL_FRAGMENT, { trailUniforms: this.uniforms });
    this.trail.pivot.set(0, 0.5);
    this.view.addChild(this.trail, this.sprite);
    this.pass = passFor(0, seed, null);
  }

  update(time: number, viewport: PosterViewport): void {
    const pass = this.passAt(time);
    const { flight, trail } = config.layers.aircraft;
    const unit = viewport.width;
    const flown = pass.speed * (time - pass.start); // poster widths since the path start
    const visible = flown >= 0 && flown <= flight.length;
    this.view.visible = visible;
    if (!visible) return;

    const angle = (pass.heading * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(angle), -Math.sin(angle)];
    const s = flown - flight.enter; // 0 at the reference point
    placeObject(this.sprite, this.placement, viewport);
    const dx = (dir[0] * s + Math.sin(angle) * pass.offset) * unit;
    const dy = (dir[1] * s + Math.cos(angle) * pass.offset) * unit;
    this.sprite.position.set(this.sprite.position.x + dx, this.sprite.position.y + dy);
    // Emerges from the haze at the start of its path.
    this.sprite.alpha = smoothstep(0, flight.fadeIn, flown);

    // The trail runs back along the path from the engine, as far as it is still visible.
    const ax = this.sprite.position.x + trail.anchor[0] * this.sprite.width;
    const ay = this.sprite.position.y + trail.anchor[1] * this.sprite.height;
    const speedPx = pass.speed * unit;
    const lengthPx = Math.min(flown * unit, speedPx * trail.fade * 4);
    const widthPx = Math.max(trail.width * unit, 0.6);
    const spreadPx = trail.spread * unit;
    const halfHeight = 3 * (widthPx + spreadPx * trail.fade * 4);
    this.trail.position.set(ax - dir[0] * lengthPx, ay - dir[1] * lengthPx);
    this.trail.rotation = -angle;
    this.trail.scale.set(Math.max(lengthPx, 1e-3), halfHeight * 2);
    const u = this.uniforms.uniforms;
    u.uTrail.set([lengthPx, speedPx, trail.fade, flown * unit]);
    u.uWidth.set([widthPx, spreadPx, halfHeight, trail.opacity]);
    u.uTint[3] = Math.max(flight.fadeIn * unit, 1);
    u.uSeed = this.seed * 7.31 + pass.index * 3.17;
    this.uniforms.update();
  }

  /** Where the aircraft is on screen while it is clearly visible, else null. */
  bounds(): ScreenRect | null {
    if (!this.view.visible || this.sprite.alpha < 0.3) return null;
    return { x: this.sprite.x, y: this.sprite.y, width: this.sprite.width, height: this.sprite.height };
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  /** The pass in progress (or the pause after it) at a scene time. */
  private passAt(time: number): Pass {
    if (time < this.pass.start && this.pass.index > 0) this.pass = passFor(0, this.seed, null);
    while (time >= this.pass.start + this.pass.travel + this.pass.pause) {
      const next = this.pass.start + this.pass.travel + this.pass.pause;
      this.pass = passFor(this.pass.index + 1, this.seed, next);
    }
    return this.pass;
  }
}

/**
 * Layer 8: the two small aircraft on the right. They fly slowly up and to
 * the right, leaving vapour trails that lengthen, spread and fade, exit the
 * screen, and return after a pause on a slightly different path. Each pass
 * is a pure function of scene time, so pausing, fast-forward and seeking
 * all agree.
 */
export class AircraftLayer implements SceneLayer {
  readonly id = 'aircraft';
  readonly view = new Container();
  private planes: Aircraft[] = [];
  private viewport: PosterViewport | null = null;

  async load(): Promise<void> {
    const texture = await loadTexture('aircraft');
    this.planes = config.layers.aircraft.planes.map((placement, i) => new Aircraft(texture, placement, i + 1));
    this.view.addChild(...this.planes.map((plane) => plane.view));
  }

  resize(viewport: PosterViewport): void {
    this.viewport = viewport;
  }

  update(frame: ClockFrame): void {
    const viewport = this.viewport;
    if (viewport === null) return;
    for (const plane of this.planes) plane.update(frame.time, viewport);
  }

  /** Screen boxes of the aircraft in flight, inside this layer, for tapping. */
  hitBoxes(): ScreenRect[] {
    return this.planes.map((plane) => plane.bounds()).filter((box): box is ScreenRect => box !== null);
  }

  destroy(): void {
    for (const plane of this.planes) plane.destroy();
    this.view.destroy({ children: true });
    this.planes = [];
    releaseTexture('aircraft');
  }
}
