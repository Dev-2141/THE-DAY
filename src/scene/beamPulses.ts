import { hash01 } from '../core/hash';
import { smoothstep } from '../core/math';
import { config } from '../config/config';

export const MAX_BEAM_PULSES = 4;

/** A pulse is drawn until its head is this far past the ground, so it sinks in softly. */
const OVERRUN = 0.35;

export interface BeamPulseFrame {
  /** Head position of each pulse along the beam (0 at the emitter, 1 at the ground). */
  readonly heads: Float32Array;
  /** Strength of each pulse; 0 for unused slots. */
  readonly strengths: Float32Array;
  /** How much pulses are currently lifting the ground glow, 0..~1. */
  readonly ground: number;
}

/** When pulse `k` leaves the emitter: a regular rhythm with irregular gaps. */
function pulseStart(k: number): number {
  const { interval, jitter } = config.layers.beams.pulses;
  return (k + jitter * (hash01(k, 3) - 0.5)) * interval;
}

/**
 * The pulses travelling down the beam at a scene time. A pure function of
 * time, so every layer that reacts to the pulses (the beam, its ground glow,
 * the reflection in the water) agrees, including after a seek.
 */
export function beamPulses(time: number): BeamPulseFrame {
  const { interval, travel, strength } = config.layers.beams.pulses;
  const heads = new Float32Array(MAX_BEAM_PULSES);
  const strengths = new Float32Array(MAX_BEAM_PULSES);
  let ground = 0;
  let slot = 0;
  const span = travel * (1 + OVERRUN);
  const first = Math.floor((time - span) / interval) - 1;
  const last = Math.floor(time / interval) + 1;
  for (let k = first; k <= last && slot < MAX_BEAM_PULSES; k++) {
    const age = time - pulseStart(k);
    if (age < 0 || age > span) continue;
    const head = age / travel;
    // Grows out of the emitter, and fades as it sinks into the ground.
    const life = smoothstep(0, 0.12, head) * (1 - smoothstep(1, 1 + OVERRUN, head));
    const s = strength * (0.7 + 0.3 * hash01(k, 7)) * life;
    heads[slot] = head;
    strengths[slot] = s;
    slot++;
    // The ground answers as the pulse arrives, then settles.
    ground += (s / strength) * smoothstep(0.85, 1, head) * (1 - smoothstep(1, 1 + OVERRUN, head));
  }
  return { heads, strengths, ground };
}
