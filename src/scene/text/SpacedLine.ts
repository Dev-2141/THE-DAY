import { CanvasTextMetrics, Container, Text } from 'pixi.js';
import type { FontFace } from '../../config/config';
import { capHeightRatio, cssFont, measure, textStyle } from './fonts';

/** A token is one character, or a group that should stay together. */
export interface Token {
  readonly text: string;
  /** Fixed box width in px (tabular), or null for the token's own advance. */
  readonly cell: number | null;
}

export interface LineGeometry {
  readonly centerX: number;
  readonly capCenterY: number;
  readonly capHeight: number;
}

interface Slot {
  readonly text: Text;
  readonly x: number;
  readonly width: number;
  fade: number;
}

/** One letter of `text` per token, with natural advances. */
export function letters(text: string): Token[] {
  return Array.from(text, (ch) => ({ text: ch, cell: null }));
}

/**
 * A centred, letter-spaced line where each token is its own text object.
 * When the text changes, only the tokens that differ cross-fade; if the
 * layout itself changes (a different length), the whole line cross-fades.
 */
export class SpacedLine {
  readonly view = new Container();
  private slots: Slot[] = [];
  private outgoing: Slot[] = [];
  private tokens: readonly Token[] = [];
  private size = 0;
  private tracking = 0;
  private geometry: LineGeometry = { centerX: 0, capCenterY: 0, capHeight: 0 };

  constructor(
    private face: FontFace,
    private readonly fill: string,
    private readonly fadeSeconds: number,
  ) {}

  get fontSize(): number {
    return this.size;
  }

  setFace(face: FontFace): void {
    this.face = face;
  }

  /** Font size for the capital height, and the spacing that fits `sample` to `width`. */
  fit(geometry: LineGeometry, sample: string, width: number): void {
    this.geometry = geometry;
    this.size = geometry.capHeight / capHeightRatio(this.face);
    this.tracking = solveTracking(this.face, this.size, letters(sample), width);
  }

  /** Lay out tokens. With `animate`, changed tokens cross-fade. */
  setTokens(tokens: readonly Token[], animate: boolean): void {
    const previous = this.tokens;
    this.tokens = tokens;
    const layout = this.layout(tokens);
    const sameLayout =
      animate &&
      this.slots.length === layout.length &&
      layout.every((box, i) => Math.abs(box.x - (this.slots[i]?.x ?? NaN)) < 0.01);

    if (!sameLayout) {
      for (const slot of this.slots) this.retire(slot, animate);
      this.slots = layout.map((box, i) => this.createSlot(tokens[i]?.text ?? '', box.x, box.width, animate));
      return;
    }
    this.slots = this.slots.map((slot, i) => {
      const next = tokens[i]?.text ?? '';
      if (previous[i]?.text === next) return slot;
      this.retire(slot, true);
      return this.createSlot(next, slot.x, slot.width, true);
    });
  }

  /** Re-render at the current geometry, without animation (after a resize). */
  refresh(): void {
    for (const slot of [...this.slots, ...this.outgoing]) slot.text.destroy();
    this.slots = [];
    this.outgoing = [];
    this.setTokens(this.tokens, false);
  }

  update(delta: number): void {
    const step = this.fadeSeconds > 0 ? delta / this.fadeSeconds : 1;
    for (const slot of this.slots) {
      if (slot.fade < 1) {
        slot.fade = Math.min(1, slot.fade + step);
        slot.text.alpha = ease(slot.fade);
      }
    }
    this.outgoing = this.outgoing.filter((slot) => {
      slot.fade = Math.max(0, slot.fade - step);
      slot.text.alpha = ease(slot.fade);
      if (slot.fade > 0) return true;
      slot.text.destroy();
      return false;
    });
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.slots = [];
    this.outgoing = [];
  }

  private layout(tokens: readonly Token[]): { x: number; width: number }[] {
    const widths = tokens.map((t) => t.cell ?? measure(this.face, this.size, t.text).advance);
    const boxes: { x: number; width: number }[] = [];
    let x = 0;
    widths.forEach((width, i) => {
      boxes.push({ x, width });
      x += width + (i < widths.length - 1 ? this.tracking : 0);
    });
    // Centre the ink, not the advance boxes, so side bearings do not skew it.
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const lastBox = boxes[boxes.length - 1];
    let inkStart = 0;
    let inkEnd = x;
    if (first !== undefined && first.cell === null) inkStart = measure(this.face, this.size, first.text).inkLeft;
    if (last !== undefined && lastBox !== undefined && last.cell === null) {
      inkEnd = lastBox.x + measure(this.face, this.size, last.text).inkRight;
    }
    const offset = this.geometry.centerX - (inkStart + inkEnd) / 2;
    return boxes.map((b) => ({ x: b.x + offset, width: b.width }));
  }

  private createSlot(value: string, x: number, width: number, animate: boolean): Slot {
    const text = new Text({ text: value, style: textStyle(this.face, this.size, this.fill) });
    const advance = measure(this.face, this.size, value).advance;
    // Pixi draws the baseline at the font's ascent from the top of the text.
    const ascent = CanvasTextMetrics.measureFont(cssFont(this.face, this.size)).ascent;
    text.position.set(x + (width - advance) / 2, this.geometry.capCenterY + this.geometry.capHeight / 2 - ascent);
    const slot: Slot = { text, x, width, fade: animate ? 0 : 1 };
    text.alpha = ease(slot.fade);
    this.view.addChild(text);
    return slot;
  }

  private retire(slot: Slot, animate: boolean): void {
    if (animate) {
      this.outgoing.push(slot);
    } else {
      slot.text.destroy();
    }
  }
}

/** Spacing between tokens so that their ink spans exactly `width`. */
export function solveTracking(face: FontFace, size: number, tokens: readonly Token[], width: number): number {
  if (tokens.length < 2) return 0;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (first === undefined || last === undefined) return 0;
  const sum = tokens.reduce((total, t) => total + measure(face, size, t.text).advance, 0);
  const lastMetrics = measure(face, size, last.text);
  const inkStart = measure(face, size, first.text).inkLeft;
  const inkEndTrim = lastMetrics.advance - lastMetrics.inkRight;
  return (width - (sum - inkStart - inkEndTrim)) / (tokens.length - 1);
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}
