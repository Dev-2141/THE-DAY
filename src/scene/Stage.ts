import { Application, Container, type TEXTURE_FORMATS, type WebGLRenderer } from 'pixi.js';
import { config, type QualityLevel, type QualityLevelConfig, type StageLayout } from '../config/config';
import { AnimationClock, type ClockFrame } from '../core/clock';
import { ParallaxController } from './parallax';
import { PostProcessor, type FocusTargets } from './post/PostProcessor';
import type { SceneTuning } from './tuning';
import type { PosterViewport, SceneLayer } from './types';
import { computeViewport } from './viewport';

type StageState = 'idle' | 'mounting' | 'mounted' | 'destroyed';

export interface StageOptions {
  /** Layers drawn on top of the finished picture, untouched by post-processing (the reference overlay). */
  readonly overlays: readonly SceneLayer[];
  /** Layers the depth-of-field pass softens. */
  readonly focus: FocusTargets;
  /** Particle share and wind amount, shared with the layers. */
  readonly tuning: SceneTuning;
  /** The quality level to start at. */
  readonly quality: QualityLevelConfig;
  /** Called once if the GPU drops the graphics context; the owner then builds a new stage. */
  readonly onContextLost?: () => void;
}

/** Measured cost of one frame at a quality level, in milliseconds. */
export interface FrameTiming {
  readonly level: QualityLevel;
  readonly medianMs: number;
  readonly p90Ms: number;
}

/** Half-float targets for light, if the device can render to them. */
function lightFormat(app: Application): TEXTURE_FORMATS {
  const gl = (app.renderer as WebGLRenderer).gl as WebGL2RenderingContext | undefined;
  if (gl === undefined) return 'rgba8unorm';
  const float = gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float');
  return float === null ? 'rgba8unorm' : 'rgba16float';
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Owns the WebGL renderer, the shared clock and the ordered list of layers.
 * Layers are drawn back to front, off-screen; the post-processor finishes
 * the picture and the overlays are drawn on top of it.
 *
 * Each layer sits in its own render group, which the depth response shifts
 * by the layer's depth. Rendering stops while the app is hidden, follows
 * window and display-scaling changes, and reports a lost graphics context.
 */
export class Stage {
  readonly clock = new AnimationClock(config.clock.timeScale, config.clock.maxDeltaSeconds);
  readonly parallax = new ParallaxController();
  private readonly app = new Application();
  private readonly root = new Container();
  private readonly overlayRoot = new Container();
  private readonly layers: readonly SceneLayer[];
  private readonly overlays: readonly SceneLayer[];
  private readonly focus: FocusTargets;
  private readonly tuning: SceneTuning;
  private readonly groups = new Map<string, Container>();
  private readonly frameListeners = new Set<(frame: ClockFrame) => void>();
  private readonly onResize = (): void => this.layout();
  private readonly onContextLostCallback: (() => void) | undefined;
  private state: StageState = 'idle';
  private layoutChoice: StageLayout = config.stage.layout;
  private postProcessor: PostProcessor | null = null;
  private quality: QualityLevelConfig;
  private viewportValue: PosterViewport | null = null;
  private pixelRatioQuery: MediaQueryList | null = null;
  private contextLost = false;
  private measuring = false;

  constructor(layers: readonly SceneLayer[], options: StageOptions) {
    this.layers = layers;
    this.overlays = options.overlays;
    this.focus = options.focus;
    this.tuning = options.tuning;
    this.quality = options.quality;
    this.tuning.particles = options.quality.particles;
    this.onContextLostCallback = options.onContextLost;
  }

  async mount(host: HTMLElement): Promise<void> {
    this.state = 'mounting';
    await this.app.init({
      preference: 'webgl',
      resizeTo: host,
      background: config.stage.background,
      // The screen only ever receives the finished full-window picture, so
      // multisampling it would cost memory for nothing.
      antialias: false,
      autoDensity: true,
      powerPreference: 'high-performance',
      resolution: this.resolution(),
    });
    await Promise.all([...this.layers, ...this.overlays].map((layer) => layer.load()));

    // The component may have unmounted while we were loading.
    if (this.isDestroyed()) {
      this.teardown();
      return;
    }

    const canvas = this.app.canvas;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    host.appendChild(canvas);
    for (const layer of this.layers) {
      const group = new Container({ isRenderGroup: true, label: layer.id });
      group.addChild(layer.view);
      this.root.addChild(group);
      this.groups.set(layer.id, group);
    }
    for (const layer of this.overlays) this.overlayRoot.addChild(layer.view);
    const post = new PostProcessor(this.focus, lightFormat(this.app));
    post.setAllowed(this.quality.passes);
    this.postProcessor = post;
    this.app.stage.addChild(post.output, this.overlayRoot);
    this.app.renderer.on('resize', this.onResize);
    this.layout();

    // Runs before the application draws its stage each tick.
    this.app.ticker.add((ticker) => {
      this.clock.advance(ticker.deltaMS);
      this.parallax.update(this.clock.realDelta);
      this.advance();
      const frame = this.clock.frame;
      for (const listener of this.frameListeners) listener(frame);
    });
    this.parallax.attach();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.watchPixelRatio();
    this.state = 'mounted';
    this.onVisibility();
  }

  get post(): PostProcessor | null {
    return this.postProcessor;
  }

  get currentLayout(): StageLayout {
    return this.layoutChoice;
  }

  /** Where the poster sits in the window, or null before the first layout. */
  get viewport(): PosterViewport | null {
    return this.viewportValue;
  }

  /** How far the depth response has shifted a layer right now, in pixels. */
  layerOffset(layerId: string): readonly [number, number] {
    const group = this.groups.get(layerId);
    return group === undefined ? [0, 0] : [group.position.x, group.position.y];
  }

  /** Called after every drawn frame, e.g. to let the interface follow the light. */
  onFrame(listener: (frame: ClockFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** 'extend' fills the window with the scene; 'letterbox' shows the poster alone. */
  setLayout(mode: StageLayout): void {
    this.layoutChoice = mode;
    this.postProcessor?.setLetterbox(mode === 'letterbox');
  }

  /** Render resolution, particles and post-processing passes of a quality level. */
  setQuality(quality: QualityLevelConfig): void {
    this.quality = quality;
    this.tuning.particles = quality.particles;
    this.postProcessor?.setAllowed(quality.passes);
    if (this.state === 'mounted') this.applyResolution();
  }

  /**
   * The motion setting: `speed` scales the scene clock, `wind` how far the
   * grass and seeds move, `parallax` the depth response (0 switches it off).
   */
  setMotion(speed: number, wind: number, parallax: number): void {
    this.clock.motionScale = speed;
    this.parallax.amount = parallax;
    if (this.tuning.wind === wind) return;
    this.tuning.wind = wind;
    if (this.state === 'mounted') this.layout();
  }

  /** Update every layer for the clock's current time and draw one frame now. */
  renderNow(): void {
    if (this.state !== 'mounted') return;
    this.advance();
    this.app.render();
  }

  /**
   * Measure the real cost of a frame at each level: the scene is updated,
   * drawn and then waited for until the GPU has finished, so the time is
   * not hidden by the display's refresh rate. Restores the current level.
   */
  async measure(levels: readonly QualityLevel[], frames = config.quality.benchmarkFrames): Promise<FrameTiming[]> {
    if (this.state !== 'mounted' || this.measuring) return [];
    this.measuring = true;
    const gl = (this.app.renderer as WebGLRenderer).gl;
    const pixel = new Uint8Array(4);
    const previous = this.quality;
    this.app.ticker.stop();
    const results: FrameTiming[] = [];
    try {
      for (const level of levels) {
        this.setQuality(config.quality.levels[level]);
        const times: number[] = [];
        // Two warm-up frames: shaders compile and targets resize on the first ones.
        for (let i = 0; i < frames + 2; i++) {
          await nextFrame();
          if (this.state !== 'mounted' || this.contextLost) return results;
          const start = performance.now();
          this.clock.advance(1000 / 60);
          this.advance();
          this.app.render();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (i >= 2) times.push(performance.now() - start);
        }
        results.push({ level, medianMs: percentile(times, 0.5), p90Ms: percentile(times, 0.9) });
      }
    } finally {
      this.measuring = false;
      if (this.state === 'mounted') {
        this.setQuality(previous);
        this.onVisibility();
      }
    }
    return results;
  }

  /** Development only: simulate the GPU dropping the context, to test recovery. */
  loseContext(): void {
    const gl = (this.app.renderer as WebGLRenderer).gl;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  destroy(): void {
    const wasMounted = this.state === 'mounted';
    this.state = 'destroyed';
    if (!wasMounted) return;
    try {
      this.teardown();
    } catch (error: unknown) {
      // After a lost context the GPU objects are already gone; nothing more to free.
      console.warn('[stage] teardown after a lost context', error);
    }
  }

  private resolution(): number {
    return Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio, config.stage.maxPixelRatio);
  }

  private applyResolution(): void {
    // Emits 'resize', which lays the scene out again.
    this.app.renderer.resize(this.app.screen.width, this.app.screen.height, this.resolution());
  }

  private advance(): void {
    const frame = this.clock.frame;
    const viewport = this.viewportValue;
    if (viewport !== null) {
      for (const layer of this.layers) {
        const group = this.groups.get(layer.id);
        const depth = config.parallax.depths[layer.id] ?? 0;
        if (group !== undefined) group.position.set(...this.parallax.shift(depth, viewport.width));
      }
    }
    for (const layer of this.layers) layer.update(frame);
    for (const layer of this.overlays) layer.update(frame);
    this.postProcessor?.render(this.app.renderer, this.root, frame.time);
  }

  // A method, not an inline check, because destroy() can change the state
  // while mount() is awaiting, which TypeScript's narrowing cannot see.
  private isDestroyed(): boolean {
    return this.state === 'destroyed';
  }

  /** Nothing is drawn while the app is in the background or the window is hidden. */
  private readonly onVisibility = (): void => {
    if (this.state !== 'mounted' || this.measuring) return;
    if (document.hidden || this.contextLost) this.app.ticker.stop();
    else this.app.ticker.start();
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.contextLost) return;
    this.contextLost = true;
    this.app.ticker.stop();
    this.onContextLostCallback?.();
  };

  /** Follow display-scaling changes (a window moved to another screen, or the scale setting changed). */
  private watchPixelRatio(): void {
    this.pixelRatioQuery?.removeEventListener('change', this.onPixelRatioChange);
    this.pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.pixelRatioQuery.addEventListener('change', this.onPixelRatioChange);
  }

  private readonly onPixelRatioChange = (): void => {
    if (this.state !== 'mounted') return;
    this.applyResolution();
    this.watchPixelRatio();
  };

  private teardown(): void {
    this.parallax.detach();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.pixelRatioQuery?.removeEventListener('change', this.onPixelRatioChange);
    this.app.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.app.renderer.off('resize', this.onResize);
    this.frameListeners.clear();
    for (const layer of [...this.layers, ...this.overlays]) layer.destroy();
    this.postProcessor?.destroy();
    this.postProcessor = null;
    this.app.destroy({ removeView: true });
  }

  private layout(): void {
    const viewport: PosterViewport = computeViewport(this.app.screen.width, this.app.screen.height, config.poster);
    this.viewportValue = viewport;
    for (const layer of [...this.layers, ...this.overlays]) layer.resize(viewport);
    this.postProcessor?.resize(viewport, this.app.renderer.resolution);
    this.setLayout(this.layoutChoice);
  }
}
