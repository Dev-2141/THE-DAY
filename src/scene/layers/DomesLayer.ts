import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader, type Sprite, type Texture } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { ClockFrame } from '../../core/clock';
import { config, type DomeLightsConfig, type Placement } from '../../config/config';
import { wrapPhase } from '../gl/noise';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { createObjectSprite, placeObject } from './objectSprite';

const LIGHTS_FRAGMENT = /* glsl */ `
uniform sampler2D uTexture;   // the dome image itself
uniform vec4 uBand;           // band top, band bottom, threshold low, threshold high
uniform vec4 uLights;         // colour, intensity
uniform vec4 uTwinkle;        // two phases (radians), depth, -

void main() {
  vec4 src = texture(uTexture, vUnit);
  vec3 rgb = src.rgb / max(src.a, 1e-4);
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  float band = smoothstep(uBand.x - 0.01, uBand.x + 0.01, vUnit.y) * (1.0 - smoothstep(uBand.y - 0.01, uBand.y + 0.01, vUnit.y));
  // Only the brightest points in the band are lights.
  float mask = band * smoothstep(uBand.z, uBand.w, lum) * src.a;
  // Each small group of lights has its own phase on two slow waves, so the
  // row shimmers irregularly instead of blinking together.
  float cell = floor(vUnit.x * 48.0);
  float p1 = fract(cell * 0.6180339) * 6.2831853;
  float p2 = fract(cell * 0.4142135 + 0.37) * 6.2831853;
  float wave = (0.5 + 0.5 * cos(uTwinkle.x + p1)) * (0.5 + 0.5 * cos(uTwinkle.y + p2));
  float twinkle = 1.0 - uTwinkle.z + uTwinkle.z * wave;
  finalColor = vec4(uLights.rgb * mask * uLights.a * twinkle, 0.0) * uColor.a;
}
`;

type DomeLightUniforms = UniformGroup<{
  uBand: { value: Float32Array; type: 'vec4<f32>' };
  uLights: { value: Float32Array; type: 'vec4<f32>' };
  uTwinkle: { value: Float32Array; type: 'vec4<f32>' };
}>;

interface Dome {
  readonly sprite: Sprite;
  readonly lights: Mesh<MeshGeometry, Shader>;
  readonly uniforms: DomeLightUniforms;
}

function createDome(texture: Texture, settings: DomeLightsConfig): Dome {
  const sprite = createObjectSprite(texture);
  const { color, intensity, depth } = config.layers.domes.lights;
  const uniforms: DomeLightUniforms = new UniformGroup({
    uBand: {
      value: new Float32Array([settings.bandTop, settings.bandBottom, settings.threshold[0], settings.threshold[1]]),
      type: 'vec4<f32>',
    },
    uLights: { value: new Float32Array([...hexToRgb(color), intensity]), type: 'vec4<f32>' },
    uTwinkle: { value: new Float32Array([0, 0, depth, 0]), type: 'vec4<f32>' },
  });
  const lights = createQuad('dome-lights', LIGHTS_FRAGMENT, { uTexture: texture.source, domeUniforms: uniforms });
  return { sprite, lights, uniforms };
}

/**
 * Layer 7: the two domes fading into the haze. The faint row of lights near
 * each base twinkles slowly. The lights are found in the dome images by
 * brightness, so new artwork keeps working without a separate light map.
 */
export class DomesLayer implements SceneLayer {
  readonly id = 'domes';
  readonly view = new Container();
  private left: Dome | null = null;
  private right: Dome | null = null;

  async load(): Promise<void> {
    const [left, right] = await Promise.all([loadTexture('domeLeft'), loadTexture('domeRight')]);
    this.left = createDome(left, config.layers.domes.leftLights);
    this.right = createDome(right, config.layers.domes.rightLights);
    this.view.addChild(this.left.sprite, this.right.sprite, this.left.lights, this.right.lights);
  }

  resize(viewport: PosterViewport): void {
    if (this.left !== null) place(this.left, config.layers.domes.left, viewport);
    if (this.right !== null) place(this.right, config.layers.domes.right, viewport);
  }

  update(frame: ClockFrame): void {
    const [a, b] = config.layers.domes.lights.periods;
    // The right dome runs a little behind the left, so the two never match.
    [this.left, this.right].forEach((dome, i) => {
      if (dome === null) return;
      const t = frame.time + i * 2.7;
      dome.uniforms.uniforms.uTwinkle[0] = wrapPhase((t / a) * Math.PI * 2);
      dome.uniforms.uniforms.uTwinkle[1] = wrapPhase((t / b) * Math.PI * 2);
      dome.uniforms.update();
    });
  }

  destroy(): void {
    this.view.destroy({ children: true });
    releaseTexture('domeLeft');
    releaseTexture('domeRight');
  }
}

function place(dome: Dome, placement: Placement, viewport: PosterViewport): void {
  placeObject(dome.sprite, placement, viewport);
  dome.lights.position.copyFrom(dome.sprite.position);
  dome.lights.scale.set(dome.sprite.width, dome.sprite.height);
}
