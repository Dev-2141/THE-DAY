import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader, type Sprite } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { ClockFrame } from '../../core/clock';
import { config } from '../../config/config';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { posterPoint } from '../viewport';
import { createObjectSprite, placeObject } from './objectSprite';
import { applyHover } from './shipMotion';

const LIGHTS_FRAGMENT = /* glsl */ `
uniform sampler2D uTexture;   // ship-lights.png: white lights on transparent
uniform vec4 uLights;         // colour, intensity
uniform vec2 uPulse;          // phase (radians), depth 0..1

void main() {
  float mask = texture(uTexture, vUnit).a;
  // Each light gets its own phase from where it sits, so they never blink together.
  vec2 cell = floor(vUnit * vec2(48.0, 6.0));
  float phase = fract(dot(cell, vec2(0.6180339, 0.4142135))) * 6.2831853;
  float pulse = 1.0 - uPulse.y * (0.5 + 0.5 * cos(uPulse.x + phase));
  // Additive light: colour with zero alpha.
  finalColor = vec4(uLights.rgb * (mask * uLights.a * pulse), 0.0) * uColor.a;
}
`;

const EMITTER_FRAGMENT = /* glsl */ `
uniform vec4 uGlow;           // colour, intensity (already breathing)

void main() {
  vec2 p = vUnit * 2.0 - 1.0;
  float d2 = dot(p, p);
  // A bright soft core and a wide, faint skirt, zero at the quad's edge.
  float light = (exp(-d2 * 7.0) * 0.7 + exp(-d2 * 2.5) * 0.3) * (1.0 - smoothstep(0.7, 1.0, d2));
  finalColor = vec4(uGlow.rgb * light * uGlow.a, 0.0) * uColor.a;
}
`;

/**
 * Layer 5: the ship. It hovers almost imperceptibly, its running lights
 * pulse slowly, and a soft glow sits at the emitter where the beams begin.
 * Its shadow is a separate layer behind (ShipShadowLayer).
 */
export class ShipLayer implements SceneLayer {
  readonly id = 'ship';
  readonly view = new Container();
  private readonly body = new Container();
  private hull: Sprite | null = null;
  private lights: Mesh<MeshGeometry, Shader> | null = null;
  private emitter: Mesh<MeshGeometry, Shader> | null = null;
  private viewport: PosterViewport | null = null;
  private readonly lightUniforms = new UniformGroup({
    uLights: {
      value: new Float32Array([...hexToRgb(config.layers.ship.lights.color), config.layers.ship.lights.intensity]),
      type: 'vec4<f32>',
    },
    uPulse: { value: new Float32Array([0, config.layers.ship.lights.pulse]), type: 'vec2<f32>' },
  });
  private readonly emitterUniforms = new UniformGroup({
    uGlow: {
      value: new Float32Array([...hexToRgb(config.layers.ship.emitter.color), config.layers.ship.emitter.intensity]),
      type: 'vec4<f32>',
    },
  });

  async load(): Promise<void> {
    const [hullTexture, lightTexture] = await Promise.all([loadTexture('ship'), loadTexture('shipLights')]);
    this.hull = createObjectSprite(hullTexture);
    lightTexture.source.scaleMode = 'linear';
    this.lights = createQuad('ship-lights', LIGHTS_FRAGMENT, {
      uTexture: lightTexture.source,
      lightUniforms: this.lightUniforms,
    });
    this.emitter = createQuad('ship-emitter', EMITTER_FRAGMENT, { emitterUniforms: this.emitterUniforms });
    this.body.addChild(this.hull, this.lights, this.emitter);
    this.view.addChild(this.body);
  }

  resize(viewport: PosterViewport): void {
    this.viewport = viewport;
    if (this.hull === null || this.lights === null || this.emitter === null) return;
    placeObject(this.hull, config.layers.ship.placement, viewport);
    this.lights.position.copyFrom(this.hull.position);
    this.lights.scale.set(this.hull.width, this.hull.height);
    const { x, y, radiusX, radiusY } = config.layers.ship.emitter;
    const [ex, ey] = posterPoint(viewport, x, y);
    const rx = radiusX * viewport.width;
    const ry = radiusY * viewport.width;
    this.emitter.position.set(ex - rx, ey - ry);
    this.emitter.scale.set(rx * 2, ry * 2);
  }

  update(frame: ClockFrame): void {
    if (this.viewport !== null) applyHover(this.body, this.viewport, frame.time);
    const { lights, emitter } = config.layers.ship;
    this.lightUniforms.uniforms.uPulse[0] = (frame.time / lights.period) * Math.PI * 2;
    this.lightUniforms.update();
    const breath = 0.5 - 0.5 * Math.cos((frame.time / emitter.period) * Math.PI * 2);
    this.emitterUniforms.uniforms.uGlow[3] = emitter.intensity * (1 - emitter.breathe * breath);
    this.emitterUniforms.update();
  }

  destroy(): void {
    this.view.destroy({ children: true });
    releaseTexture('ship');
    releaseTexture('shipLights');
  }
}
