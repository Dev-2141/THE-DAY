/**
 * A repeatable pseudo-random number in 0..1 for an integer and a seed. Used
 * to vary scheduled events (beam pulses, aircraft passes) the same way every
 * time the scene reaches the same moment, so seeking and fast-forward agree.
 */
export function hash01(n: number, seed = 0): number {
  const x = Math.sin(n * 127.1 + seed * 311.7 + 74.7) * 43758.5453123;
  return x - Math.floor(x);
}
