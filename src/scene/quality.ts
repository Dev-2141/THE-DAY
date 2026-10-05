import { config, type QualityLevel } from '../config/config';
import type { FrameTiming } from './Stage';

/** Highest first: the order in which levels are tried. */
export const QUALITY_LEVELS: readonly QualityLevel[] = ['ultra', 'high', 'medium', 'low'];

/**
 * The automatic choice: the highest level whose median frame time fits the
 * budget, leaving headroom below a 60 Hz frame (16.7 ms). The lowest level
 * if none fits.
 */
export function pickQuality(timings: readonly FrameTiming[], budgetMs = config.quality.budgetMs): QualityLevel {
  for (const level of QUALITY_LEVELS) {
    const timing = timings.find((t) => t.level === level);
    if (timing !== undefined && timing.medianMs <= budgetMs) return level;
  }
  return 'low';
}

/**
 * The texture set to start loading before anything has been measured:
 * phones and small-memory devices begin with the medium set, which is a
 * quarter of the memory of the full one.
 */
export function initialTextureGuess(): QualityLevel {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if ((memory !== undefined && memory <= 4) || coarse) return 'medium';
  return config.quality.fallback;
}
