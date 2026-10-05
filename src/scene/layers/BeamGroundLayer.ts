import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader } from 'pixi.js';
import type { ClockFrame } from '../../core/clock';
import { config } from '../../config/config';
import { beamPulses } from '../beamPulses';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { posterPoint } from '../viewport';

const FRAGMENT = /* glsl */ `
uniform vec4 uGlow;   // colour, intensity (already includes the pulse flicker)

void main() {
  vec2 p = vUnit * 2.0 - 1.0;
  // Light rises into the haze above the ground more than it spills below it.
  p.y *= p.y < 0.0 ? 0.75 : 1.4;
  float d2 = dot(p, p);
  float light = (exp(-d2 * 6.0) * 0.6 + exp(-d2 * 2.2) * 0.4) * (1.0 - smoothstep(0.6, 1.0, d2));
  finalColor = vec4(uGlow.rgb * light * uGlow.a, 0.0) * uColor.a;
}
`;

/**
 * Where the beam lands: a soft cyan glow over the ridges, haze and water in
 * front of the beam's foot. It brightens gently each time a pulse arrives.
 * Additive, drawn after the water and before the grass.
 */
export class BeamGroundLayer implements SceneLayer {
  readonly id = 'beam-ground';
  readonly view = new Container();
  private quad: Mesh<MeshGeometry, Shader> | null = null;
  private readonly uniforms = new UniformGroup({
    uGlow: {
      value: new Float32Array([...hexToRgb(config.layers.beams.ground.color), config.layers.beams.ground.intensity]),
      type: 'vec4<f32>',
    },
  });

  async load(): Promise<void> {
    this.quad = createQuad('beam-ground', FRAGMENT, { groundUniforms: this.uniforms });
    this.view.addChild(this.quad);
  }

  resize(viewport: PosterViewport): void {
    if (this.quad === null) return;
    const { x, y, radiusX, radiusY } = config.layers.beams.ground;
    const [cx, cy] = posterPoint(viewport, x, y);
    const rx = radiusX * viewport.width;
    const ry = radiusY * viewport.height;
    this.quad.position.set(cx - rx, cy - ry);
    this.quad.scale.set(rx * 2, ry * 2);
  }

  update(frame: ClockFrame): void {
    const { intensity, flicker } = config.layers.beams.ground;
    this.uniforms.uniforms.uGlow[3] = intensity * (1 + flicker * beamPulses(frame.time).ground);
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
