import { Graphics } from 'pixi.js';

/**
 * The decorative "A" of DAY, drawn as vector paths traced from the reference.
 * No bundled font has this letter, so it is drawn directly and stays the same
 * whichever display font is chosen.
 *
 * Coordinates are reference-poster pixels (455 x 674). The letter's apex is
 * at (226, 156.5) and its capitals are 61 px tall; the text layer moves and
 * scales it into place.
 */
export const SWASH_A = {
  centerX: 226,
  top: 157,
  capHeight: 61,
} as const;

/** Hairline width in reference pixels. */
const HAIRLINE = 0.85;

export function createSwashA(color: string): Graphics {
  const g = new Graphics();

  // The thick diagonal from the apex down to the right.
  g.moveTo(224.2, 155.2)
    .lineTo(225.4, 154.6)
    .lineTo(226.0, 156.0)
    .bezierCurveTo(230.0, 170.0, 238.0, 192.0, 244.6, 211.0)
    .lineTo(247.6, 216.9)
    .lineTo(238.6, 216.9)
    .bezierCurveTo(235.6, 207.0, 230.0, 186.0, 224.2, 160.5)
    .closePath()
    .fill({ color });

  // The hairline foot serif, tapered at both ends.
  g.moveTo(232.4, 217.8)
    .bezierCurveTo(234.0, 217.0, 236.0, 216.6, 238.6, 216.6)
    .lineTo(247.6, 216.6)
    .bezierCurveTo(249.8, 216.6, 251.4, 217.0, 252.4, 217.8)
    .closePath()
    .fill({ color });

  // The teardrop bowl: thick on the left and bottom, hairline on the right,
  // tapering to nothing where it leaves the small loop.
  g.moveTo(221.8, 179.0)
    .bezierCurveTo(212.0, 186.0, 201.2, 195.5, 201.2, 206.5)
    .bezierCurveTo(201.2, 214.2, 205.8, 219.4, 212.0, 219.4)
    .bezierCurveTo(219.4, 219.4, 226.6, 213.4, 229.4, 205.0)
    .bezierCurveTo(231.6, 198.4, 231.4, 191.0, 230.4, 185.4)
    .lineTo(229.6, 185.6)
    .bezierCurveTo(230.4, 191.2, 230.4, 198.2, 228.4, 204.4)
    .bezierCurveTo(225.6, 212.4, 219.0, 217.8, 212.6, 217.8)
    .bezierCurveTo(208.0, 217.8, 205.4, 213.0, 205.6, 206.4)
    .bezierCurveTo(205.8, 197.0, 213.0, 188.0, 221.8, 179.0)
    .closePath()
    .fill({ color });

  // The hairline from the apex down to the left, curling into a small loop.
  g.moveTo(224.6, 157.0)
    .bezierCurveTo(221.8, 163.5, 218.6, 170.5, 216.4, 175.8)
    .bezierCurveTo(214.6, 180.2, 214.2, 183.6, 216.2, 184.2)
    .bezierCurveTo(218.8, 185.0, 224.2, 181.6, 225.0, 179.4)
    .bezierCurveTo(225.6, 177.6, 223.4, 177.2, 221.6, 178.8)
    .stroke({ color, width: HAIRLINE, cap: 'round', join: 'round' });

  return g;
}
