/**
 * GLSL gradient noise for slow, organic motion. The hash avoids sin(), so it
 * stays stable on mobile GPUs even with large coordinates.
 */
export const GLSL_NOISE = /* glsl */ `
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

float gradientNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Three octaves, roughly -0.5..0.5.
float fbm3(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * gradientNoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}
`;

/**
 * Gradient noise whose lattice repeats every `period` cells on each axis. A
 * pattern that scrolls by an offset kept in 0..period (see loopOffset) then
 * moves forever with no restart, and the shader never sees a large number.
 * Requires GLSL_NOISE.
 */
export const GLSL_PERIODIC_NOISE = /* glsl */ `
float periodicNoise(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, period);
  vec2 i1 = mod(i + 1.0, period);
  float a = dot(hash22(i0), f);
  float b = dot(hash22(vec2(i1.x, i0.y)), f - vec2(1.0, 0.0));
  float c = dot(hash22(vec2(i0.x, i1.y)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i1), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Three octaves, roughly -0.5..0.5. Each octave doubles the period, so the
// sum repeats exactly like its first octave.
float periodicFbm3(vec2 p, vec2 period) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * periodicNoise(p, period);
    p = p * 2.0 + vec2(17.0, 9.0);
    period *= 2.0;
    amp *= 0.5;
  }
  return sum;
}
`;

/**
 * How far a pattern moving at `speed` (cells per second) has scrolled at
 * `time`, folded into 0..period. Done here in double precision so a scene
 * left running for days stays smooth.
 */
export function loopOffset(time: number, speed: number, period: number): number {
  const offset = (time * speed) % period;
  return offset < 0 ? offset + period : offset;
}

/** Fold an angle into 0..2π, for phases sent to shaders. */
export function wrapPhase(radians: number): number {
  return loopOffset(radians, 1, Math.PI * 2);
}
