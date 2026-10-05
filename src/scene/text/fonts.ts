import { TextStyle, type TextStyleFontWeight } from 'pixi.js';
import type { FontFace } from '../../config/config';

/**
 * Font loading and measurement. Fonts are bundled with the app (fontsource),
 * so this works offline. Measurements use the same canvas text engine PixiJS
 * draws with, so layout and rendering agree.
 */

const WEIGHT: Record<FontFace['weight'], TextStyleFontWeight> = { 400: '400', 700: '700' };

const context = document.createElement('canvas').getContext('2d');

function ctx(): CanvasRenderingContext2D {
  if (context === null) throw new Error('2D canvas is not available for text measurement');
  return context;
}

export function cssFont(face: FontFace, size: number): string {
  return `${face.weight} ${size}px "${face.family}"`;
}

export async function loadFonts(faces: readonly FontFace[]): Promise<void> {
  await Promise.all(faces.map((face) => document.fonts.load(cssFont(face, 64), 'THEDAY0123456789·')));
}

export function textStyle(face: FontFace, size: number, fill: string, padding = 0): TextStyle {
  return new TextStyle({ fontFamily: face.family, fontWeight: WEIGHT[face.weight], fontSize: size, fill, padding });
}

const capCache = new Map<string, number>();

/** Height of a capital H as a fraction of the font size. */
export function capHeightRatio(face: FontFace): number {
  const key = cssFont(face, 200);
  const cached = capCache.get(key);
  if (cached !== undefined) return cached;
  const c = ctx();
  c.font = key;
  const ratio = c.measureText('H').actualBoundingBoxAscent / 200;
  capCache.set(key, ratio);
  return ratio;
}

export interface GlyphMetrics {
  /** Horizontal advance. */
  readonly advance: number;
  /** Ink extent relative to the pen position: left edge (usually >= 0) and right edge. */
  readonly inkLeft: number;
  readonly inkRight: number;
}

export function measure(face: FontFace, size: number, text: string): GlyphMetrics {
  const c = ctx();
  c.font = cssFont(face, size);
  const m = c.measureText(text);
  return { advance: m.width, inkLeft: -m.actualBoundingBoxLeft, inkRight: m.actualBoundingBoxRight };
}
