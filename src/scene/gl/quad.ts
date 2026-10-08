import { Mesh, MeshGeometry, Shader, type UniformGroup, type TextureSource } from 'pixi.js';

/**
 * A rectangle drawn by a custom fragment shader. The fragment shader receives
 * `vUnit` (0..1 across the quad) and `vScreen` (stage pixels), plus `uColor`
 * whose alpha is the mesh's alpha. Output is premultiplied, so a colour with
 * zero alpha adds light and a colour with alpha mixes over what is behind.
 *
 * `vScreen` is measured inside the quad's render group: each scene layer is
 * its own group, so when the depth response shifts a layer, its picture moves
 * with it instead of staying put under a moving quad. Filters drawing into
 * an off-screen area do not change it either.
 */
const QUAD_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vUnit;
out vec2 vScreen;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vec3 local = uTransformMatrix * vec3(aPosition, 1.0);
  vec3 world = uWorldTransformMatrix * local;
  gl_Position = vec4((uProjectionMatrix * world).xy, 0.0, 1.0);
  vUnit = aPosition;
  vScreen = local.xy;
}
`;

/**
 * Shared header for every quad fragment shader. GLSL ES 3.0 (WebGL 2), and
 * high precision, because the shaders work in screen pixels.
 */
export const GLSL_COMMON = /* glsl */ `#version 300 es
in vec2 vUnit;
in vec2 vScreen;
out vec4 finalColor;
uniform vec4 uColor;

// Folds any coordinate into 0..1 as a mirror image, continuous at the folds.
float mirror01(float x) {
  return 1.0 - abs(mod(x, 2.0) - 1.0);
}
`;

export type QuadResource = TextureSource | UniformGroup;

export function createQuad(
  name: string,
  fragment: string,
  resources: Readonly<Record<string, QuadResource>>,
): Mesh<MeshGeometry, Shader> {
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = Shader.from({
    gl: { vertex: QUAD_VERTEX, fragment: GLSL_COMMON + fragment, name, preferredFragmentPrecision: 'highp' },
    resources: { ...resources },
  });
  const mesh = new Mesh({ geometry, shader });
  // A mesh does not free its shader; without this the shader would keep
  // listening to textures that are unloaded after the scene is torn down.
  mesh.once('destroyed', () => shader.destroy());
  return mesh;
}

/** Parse '#rrggbb' into 0..1 RGB components for a uniform. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
