import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader } from 'pixi.js';
import { config } from '../../config/config';
import { createQuad, hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { posterPoint } from '../viewport';

const FRAGMENT = /* glsl */ `
uniform vec3 uCenterRadius;  // centre (screen px) and radius (screen px)
uniform vec4 uGlow;          // rgb colour, intensity

void main() {
  float d = length(vScreen - uCenterRadius.xy) / uCenterRadius.z;
  // A soft core and a wide falloff, reaching zero at the radius.
  float core = exp(-d * d * 9.0);
  float halo = exp(-d * d * 2.2) * (1.0 - smoothstep(0.75, 1.0, d));
  float light = (core * 0.6 + halo * 0.4) * uGlow.a;
  // Additive: colour with zero alpha.
  finalColor = vec4(uGlow.rgb * light, 0.0) * uColor.a;
}
`;

/** Layer 4: the low sun's warm bloom just off the right edge. */
export class SunGlowLayer implements SceneLayer {
  readonly id = 'sun-glow';
  readonly view = new Container();
  private quad: Mesh<MeshGeometry, Shader> | null = null;
  private readonly uniforms = new UniformGroup({
    uCenterRadius: { value: new Float32Array(3), type: 'vec3<f32>' },
    uGlow: { value: new Float32Array(4), type: 'vec4<f32>' },
  });

  async load(): Promise<void> {
    const { color, intensity } = config.layers.sunGlow;
    this.uniforms.uniforms.uGlow.set([...hexToRgb(color), intensity]);
    this.quad = createQuad('sun-glow', FRAGMENT, { sunUniforms: this.uniforms });
    this.view.addChild(this.quad);
  }

  resize(viewport: PosterViewport): void {
    if (this.quad === null) return;
    const { x, y, radius } = config.layers.sunGlow;
    const [cx, cy] = posterPoint(viewport, x, y);
    const r = radius * viewport.width;
    this.quad.position.set(cx - r, cy - r);
    this.quad.scale.set(r * 2, r * 2);
    this.uniforms.uniforms.uCenterRadius.set([cx, cy, r]);
    this.uniforms.update();
  }

  update(): void {
    // Static: its bloom and shafts come from the post-processing pass.
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
