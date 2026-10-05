import { CanvasTextMetrics, Container, Graphics, Text } from 'pixi.js';
import type { ClockFrame } from '../../core/clock';
import { config, type DisplayFont, type FontFace, type TextLineConfig } from '../../config/config';
import { timeSamples, type ClockFormat, type ClockText } from '../../time/clockText';
import { LiveClock } from '../../time/LiveClock';
import { capHeightRatio, cssFont, loadFonts, measure, textStyle } from '../text/fonts';
import { LightWrap } from '../text/LightWrap';
import { SpacedLine, letters, type Token } from '../text/SpacedLine';
import { SWASH_A, createSwashA } from '../text/swashA';
import type { PosterViewport, SceneLayer } from '../types';

const DIGITS = '0123456789';

/** The live lines the hub can change or hide. */
export type LiveLine = 'time' | 'date';

/**
 * Layer 13: THE, the rule, DAY, FOR DEV BY DEV, and the live time and date.
 * Sits in front of the beams, with a soft light wrap where they cross.
 */
export class TextLayer implements SceneLayer {
  readonly id = 'text';
  readonly view = new Container();
  private readonly block = new Container();
  private readonly color = config.text.color;
  private displayFont: DisplayFont = config.text.displayFont;
  private format: ClockFormat = { ...config.time };

  private readonly title = new SpacedLine(this.face(), this.color, 0);
  private readonly tagline = new SpacedLine(config.text.taglineFont, this.color, 0);
  private readonly time = new SpacedLine(config.text.clockFont, this.color, config.text.crossfadeSeconds);
  private readonly date = new SpacedLine(config.text.clockFont, this.color, config.text.crossfadeSeconds);
  private readonly rule = new Graphics();
  private readonly swash = createSwashA(this.color);
  private dayD: Text | null = null;
  private dayY: Text | null = null;
  private readonly wrap = new LightWrap();
  private readonly clock: LiveClock;
  private viewport: PosterViewport | null = null;
  private latest: ClockText = { time: '', date: '' };
  /** Text pushed by the hub in place of the live value, until cleared. */
  private readonly overrides: Record<LiveLine, string | null> = { time: null, date: null };
  private readonly listeners = new Set<(text: ClockText) => void>();

  constructor() {
    this.clock = new LiveClock(this.format, (text) => this.showClock(text, true));
  }

  async load(): Promise<void> {
    const faces: FontFace[] = [
      ...Object.values(config.text.displayFonts),
      config.text.taglineFont,
      config.text.clockFont,
    ];
    await loadFonts(faces);
    this.block.addChild(this.title.view, this.rule, this.swash, this.tagline.view, this.time.view, this.date.view);
    this.block.filters = config.text.lightWrap.strength > 0 ? [this.wrap.filter] : [];
    this.view.addChild(this.block);
    this.clock.start();
  }

  get font(): DisplayFont {
    return this.displayFont;
  }

  /** Switch the typeface used for THE, D and Y. */
  setDisplayFont(font: DisplayFont): void {
    this.displayFont = font;
    this.title.setFace(this.face());
    if (this.viewport !== null) this.resize(this.viewport);
  }

  /** The live time and date as shown, for the screen-reader description. */
  get clockText(): ClockText {
    return this.latest;
  }

  /** Called with fresh time and date text on every boundary. */
  onClock(listener: (text: ClockText) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Show `text` (in capitals) instead of the live value; null returns to the live value. */
  setOverride(line: LiveLine, text: string | null): void {
    this.overrides[line] = text === null || text === '' ? null : text.toLocaleUpperCase(this.format.locale);
    this.showClock(this.latest, true);
  }

  setLineVisible(line: LiveLine, visible: boolean): void {
    this[line].view.visible = visible;
  }

  get clockFormat(): ClockFormat {
    return this.format;
  }

  setClockFormat(format: ClockFormat): void {
    this.format = format;
    this.clock.setFormat(format);
    if (this.viewport !== null) this.resize(this.viewport);
  }

  resize(viewport: PosterViewport): void {
    this.viewport = viewport;
    const t = config.text;
    const cx = viewport.x + t.centerX * viewport.width;

    this.fitLine(this.title, t.title, cx, viewport);
    this.title.setTokens(letters(t.title.sample), false);

    this.fitLine(this.tagline, t.tagline, cx, viewport);
    this.tagline.setTokens(letters(t.tagline.sample), false);

    this.fitLine(this.time, t.time, cx, viewport);
    this.fitLine(this.date, t.date, cx, viewport);
    this.time.refresh();
    this.date.refresh();
    this.showClock(this.latest, false);

    const ruleY = viewport.y + t.rule.y * viewport.height;
    const thickness = Math.max(1, t.rule.thickness * viewport.height);
    this.rule
      .clear()
      .rect(
        viewport.x + t.rule.x0 * viewport.width,
        ruleY - thickness / 2,
        (t.rule.x1 - t.rule.x0) * viewport.width,
        thickness,
      )
      .fill({ color: this.color });

    this.placeDay(viewport);
    this.wrap.resize(viewport);
  }

  update(frame: ClockFrame): void {
    this.time.update(frame.delta);
    this.date.update(frame.delta);
  }

  destroy(): void {
    this.listeners.clear();
    this.clock.stop();
    this.title.destroy();
    this.tagline.destroy();
    this.time.destroy();
    this.date.destroy();
    this.view.destroy({ children: true });
  }

  private face(): FontFace {
    return config.text.displayFonts[this.displayFont];
  }

  private fitLine(line: SpacedLine, cfg: TextLineConfig, cx: number, viewport: PosterViewport): void {
    line.fit(
      {
        centerX: cx,
        capCenterY: viewport.y + cfg.y * viewport.height,
        capHeight: cfg.capHeight * viewport.height,
      },
      cfg.sample,
      cfg.width * viewport.width,
    );
  }

  private showClock(text: ClockText, animate: boolean): void {
    if (text.time !== this.latest.time || text.date !== this.latest.date) {
      for (const listener of this.listeners) listener(text);
    }
    this.latest = text;
    if (text.time === '' || this.viewport === null) return;
    const time = this.overrides.time;
    const date = this.overrides.date;
    this.time.setTokens(time === null ? this.timeTokens(text.time) : letters(time), animate);
    this.date.setTokens(letters(date ?? text.date), animate);
  }

  /**
   * Tabular time: every position gets a fixed width wide enough for any
   * character that can appear there, so the line never changes width.
   */
  private timeTokens(value: string): Token[] {
    const face = config.text.clockFont;
    const size = this.time.fontSize;
    const samples = timeSamples(this.format).filter((s) => s.length === value.length);
    const digitCell = Math.max(...Array.from(DIGITS, (d) => measure(face, size, d).advance));
    return Array.from(value, (ch, i) => {
      const seen = new Set(samples.map((s) => s[i] ?? ch));
      seen.add(ch);
      const chars = [...seen];
      if (chars.every((c) => DIGITS.includes(c))) return { text: ch, cell: digitCell };
      if (chars.length === 1) return { text: ch, cell: null };
      return { text: ch, cell: Math.max(...chars.map((c) => measure(face, size, c).advance)) };
    });
  }

  /** D and Y in the display font, the swash A between them, all on one baseline. */
  private placeDay(viewport: PosterViewport): void {
    const { centers, top, bottom } = config.text.day;
    const capHeight = (bottom - top) * viewport.height;
    const baseline = viewport.y + bottom * viewport.height;
    const face = this.face();
    const size = capHeight / capHeightRatio(face);
    const padding = Math.ceil(size * 0.2);

    this.dayD?.destroy();
    this.dayY?.destroy();
    this.dayD = this.glyph('D', face, size, padding, viewport.x + centers[0] * viewport.width, baseline);
    this.dayY = this.glyph('Y', face, size, padding, viewport.x + centers[2] * viewport.width, baseline);
    this.block.addChild(this.dayD, this.dayY);

    const scale = capHeight / SWASH_A.capHeight;
    this.swash.pivot.set(SWASH_A.centerX, SWASH_A.top);
    this.swash.scale.set(scale);
    this.swash.position.set(viewport.x + centers[1] * viewport.width, viewport.y + top * viewport.height);
  }

  /** A single letter, centred on its ink at `centerX`, sitting on `baseline`. */
  private glyph(letter: string, face: FontFace, size: number, padding: number, centerX: number, baseline: number): Text {
    const text = new Text({ text: letter, style: textStyle(face, size, this.color, padding) });
    const m = measure(face, size, letter);
    const ascent = CanvasTextMetrics.measureFont(cssFont(face, size)).ascent;
    // Pixi already offsets padded text so its origin stays where padding 0 would put it.
    text.position.set(centerX - (m.inkLeft + m.inkRight) / 2, baseline - ascent);
    return text;
  }
}
