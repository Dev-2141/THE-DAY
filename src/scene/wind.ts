import { hash01 } from '../core/hash';
import { smoothstep } from '../core/math';
import { config } from '../config/config';
import { wrapPhase } from './gl/noise';

const MAX_GUSTS = 4;

/** Where gusts start and end, in poster widths past the upwind and downwind edges. */
const GUST_SPAN: readonly [number, number] = [-0.9, 1.9];

export interface WindFrame {
  /** Centre of each gust, as a poster x fraction. */
  readonly centers: Float32Array;
  /** Strength of each gust (0 for unused slots), already scaled by the gustiness. */
  readonly strengths: Float32Array;
  /** Length of each gust along the wind, in poster widths. */
  readonly widths: Float32Array;
  /** The steady lean of the grass between gusts, 0..1. */
  readonly lean: number;
  /** How gusty the wind is right now, 0 (calm spell) .. 1. */
  readonly gustiness: number;
  /** Phases (radians, folded into 0..2π) for the slow sway and the quick flutter. */
  readonly phases: Float32Array;
}

/** Smooth 1D value noise in 0..1, from the shared hash. */
function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash01(i, seed) * (1 - u) + hash01(i + 1, seed) * u;
}

/**
 * The wind at a scene time. Gusts are separate waves that cross the screen
 * in the wind's direction at their own pace, with irregular gaps between
 * them; a slow "gustiness" swell brings calmer and livelier spells. A pure
 * function of time, so the grass, the flowers and the seeds always agree,
 * and fast-forward and seeking give the same wind.
 */
export function windAt(time: number): WindFrame {
  const wind = config.wind;
  const centers = new Float32Array(MAX_GUSTS);
  const strengths = new Float32Array(MAX_GUSTS);
  const widths = new Float32Array(MAX_GUSTS);

  // Calm and gusty spells: a slow swell, never fully still.
  const swell = valueNoise(time / wind.calmPeriod, 11);
  const gustiness = 1 - wind.calm * (1 - smoothstep(0.25, 0.75, swell));

  const interval = 60 / Math.max(wind.gustsPerMinute, 0.01);
  const travel = (GUST_SPAN[1] - GUST_SPAN[0]) / wind.gustSpeed;
  const first = Math.floor((time - travel) / interval) - 1;
  const last = Math.floor(time / interval) + 1;
  let slot = 0;
  for (let k = first; k <= last && slot < MAX_GUSTS; k++) {
    const start = (k + 0.8 * (hash01(k, 21) - 0.5)) * interval;
    const age = time - start;
    if (age < 0 || age > travel) continue;
    const progress = GUST_SPAN[0] + age * wind.gustSpeed;
    centers[slot] = wind.direction > 0 ? progress : 1 - progress;
    // Each gust is a little different, and swells in and dies away as it crosses.
    const life = smoothstep(0, 0.15, age / travel) * (1 - smoothstep(0.8, 1, age / travel));
    strengths[slot] = wind.gustStrength * (0.55 + 0.45 * hash01(k, 22)) * gustiness * life;
    widths[slot] = wind.gustWidth * (0.7 + 0.6 * hash01(k, 23));
    slot++;
  }

  const phases = new Float32Array([
    wrapPhase((time / wind.swayPeriod) * Math.PI * 2),
    wrapPhase((time / (wind.swayPeriod * 1.618)) * Math.PI * 2),
    wrapPhase((time / wind.flutterPeriod) * Math.PI * 2),
    wrapPhase((time / (wind.flutterPeriod * 1.37)) * Math.PI * 2),
  ]);
  return { centers, strengths, widths, lean: wind.strength * (0.6 + 0.4 * gustiness), gustiness, phases };
}

/**
 * The gust at poster x, as the grass shader computes it (gustAt in
 * WIND_GLSL), for things that follow the wind on the CPU, such as the sound.
 */
export function gustAtX(frame: WindFrame, x: number): number {
  const direction = config.wind.direction;
  const swingBack = config.wind.swingBack;
  let sum = 0;
  for (let i = 0; i < MAX_GUSTS; i++) {
    const w = Math.max(frame.widths[i] ?? 0, 1e-4);
    const d = (x - (frame.centers[i] ?? 0)) * direction;
    const body = d > 0 ? Math.exp(-((d / (0.35 * w)) ** 2)) : Math.exp(d / w);
    const back = Math.exp(-(((d + 1.9 * w) / (0.55 * w)) ** 2));
    sum += (frame.strengths[i] ?? 0) * (body - swingBack * back);
  }
  return sum;
}

/**
 * GLSL for the wind: the travelling gusts with a sharp front, a long tail
 * and a small swing back after they pass. Uniforms are filled from windAt.
 */
export const WIND_GLSL = /* glsl */ `
uniform vec4 uGustCenter;   // poster x
uniform vec4 uGustStrength;
uniform vec4 uGustWidth;    // poster widths
uniform vec4 uWindState;    // direction, lean, gustiness, swing back
uniform vec4 uWindPhase;    // sway 1, sway 2, flutter 1, flutter 2 (radians)

float gustAt(float x) {
  float sum = 0.0;
  for (int i = 0; i < ${MAX_GUSTS}; i++) {
    float w = max(uGustWidth[i], 1e-4);
    float d = (x - uGustCenter[i]) * uWindState.x;   // > 0: ahead of the gust's centre
    float body = d > 0.0 ? exp(-pow(d / (0.35 * w), 2.0)) : exp(d / w);
    float back = exp(-pow((d + 1.9 * w) / (0.55 * w), 2.0));
    sum += uGustStrength[i] * (body - uWindState.w * back);
  }
  return sum;
}
`;

export type WindUniformValues = {
  uGustCenter: { value: Float32Array; type: 'vec4<f32>' };
  uGustStrength: { value: Float32Array; type: 'vec4<f32>' };
  uGustWidth: { value: Float32Array; type: 'vec4<f32>' };
  uWindState: { value: Float32Array; type: 'vec4<f32>' };
  uWindPhase: { value: Float32Array; type: 'vec4<f32>' };
};

export function windUniformValues(): WindUniformValues {
  return {
    uGustCenter: { value: new Float32Array(MAX_GUSTS), type: 'vec4<f32>' },
    uGustStrength: { value: new Float32Array(MAX_GUSTS), type: 'vec4<f32>' },
    uGustWidth: { value: new Float32Array(MAX_GUSTS), type: 'vec4<f32>' },
    uWindState: { value: new Float32Array(4), type: 'vec4<f32>' },
    uWindPhase: { value: new Float32Array(4), type: 'vec4<f32>' },
  };
}

/** Copy a wind frame into uniforms made by windUniformValues. */
export function writeWind(u: { [K in keyof WindUniformValues]: Float32Array }, frame: WindFrame): void {
  u.uGustCenter.set(frame.centers);
  u.uGustStrength.set(frame.strengths);
  u.uGustWidth.set(frame.widths);
  u.uWindState.set([config.wind.direction, frame.lean, frame.gustiness, config.wind.swingBack]);
  u.uWindPhase.set(frame.phases);
}
