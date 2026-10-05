import { Application, Container, type TEXTURE_FORMATS, type WebGLRenderer } from 'pixi.js';
import { config, type StageLayout } from '../config/config';
import { AnimationClock } from '../core/clock';
import { PostProcessor, type FocusTargets } from './post/PostProcessor';
import type { PosterViewport, SceneLayer } from './types';
import { computeViewport } from './viewport';

type StageState = 'idle' | 'mounting' | 'mounted' | 'destroyed';

export interface StageOptions {
  /** Layers drawn on top of the finished picture, untouched by post-processing (the reference overlay). */
  readonly overlays: readonly SceneLayer[];
  /** Layers the depth-of-field pass softens. */
  readonly focus: FocusTargets;
}

/** Half-float targets for light, if the device can render to them. */
function lightFormat(app: Application): TEXTURE_FORMATS {
  const gl = (app.renderer as WebGLRenderer).gl as WebGL2RenderingContext | undefined;
  if (gl === undefined) return 'rgba8unorm';
  const float = gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float');
  return float === null ? 'rgba8unorm' : 'rgba16float';
}

/**
 * Owns the WebGL renderer, the shared clock and the ordered list of layers.
 * Layers are drawn back to front, off-screen; the post-processor finishes
 * the picture and the overlays are drawn on top of it.
 */
export class Stage {
  readonly clock = new AnimationClock(config.clock.timeScale, config.clock.maxDeltaSeconds);
  private readonly app = new Application();
  private readonly root = new Container();
  private readonly overlayRoot = new Container();
  private readonly layers: readonly SceneLayer[];
  private readonly overlays: readonly SceneLayer[];
  private readonly focus: FocusTargets;
  private readonly onResize = (): void => this.layout();
  private state: StageState = 'idle';
  private layoutChoice: StageLayout = config.stage.layout;
  private postProcessor: PostProcessor | null = null;

  constructor(layers: readonly SceneLayer[], options: StageOptions) {
    this.layers = layers;
    this.overlays = options.overlays;
    this.focus = options.focus;
  }

  async mount(host: HTMLElement): Promise<void> {
    this.state = 'mounting';
    await this.app.init({
      preference: 'webgl',
      resizeTo: host,
      background: config.stage.background,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, config.stage.maxPixelRatio),
    });
    await Promise.all([...this.layers, ...this.overlays].map((layer) => layer.load()));

    // The component may have unmounted while we were loading.
    if (this.isDestroyed()) {
      this.teardown();
      return;
    }

    host.appendChild(this.app.canvas);
    for (const layer of this.layers) this.root.addChild(layer.view);
    for (const layer of this.overlays) this.overlayRoot.addChild(layer.view);
    const post = new PostProcessor(this.focus, lightFormat(this.app));
    this.postProcessor = post;
    this.app.stage.addChild(post.output, this.overlayRoot);
    this.app.renderer.on('resize', this.onResize);
    this.layout();

    // Runs before the application draws its stage each tick.
    this.app.ticker.add((ticker) => {
      this.clock.advance(ticker.deltaMS);
      this.advance();
    });
    this.state = 'mounted';
  }

  get post(): PostProcessor | null {
    return this.postProcessor;
  }

  get currentLayout(): StageLayout {
    return this.layoutChoice;
  }

  /** 'extend' fills the window with the scene; 'letterbox' shows the poster alone. */
  setLayout(mode: StageLayout): void {
    this.layoutChoice = mode;
    this.postProcessor?.setLetterbox(mode === 'letterbox');
  }

  /** Update every layer for the clock's current time and draw one frame now. */
  renderNow(): void {
    if (this.state !== 'mounted') return;
    this.advance();
    this.app.render();
  }

  destroy(): void {
    const wasMounted = this.state === 'mounted';
    this.state = 'destroyed';
    if (wasMounted) this.teardown();
  }

  private advance(): void {
    const frame = this.clock.frame;
    for (const layer of this.layers) layer.update(frame);
    for (const layer of this.overlays) layer.update(frame);
    this.postProcessor?.render(this.app.renderer, this.root, frame.time);
  }

  // A method, not an inline check, because destroy() can change the state
  // while mount() is awaiting, which TypeScript's narrowing cannot see.
  private isDestroyed(): boolean {
    return this.state === 'destroyed';
  }

  private teardown(): void {
    this.app.renderer.off('resize', this.onResize);
    for (const layer of [...this.layers, ...this.overlays]) layer.destroy();
    this.postProcessor?.destroy();
    this.postProcessor = null;
    this.app.destroy({ removeView: true });
  }

  private layout(): void {
    const viewport: PosterViewport = computeViewport(this.app.screen.width, this.app.screen.height, config.poster);
    for (const layer of [...this.layers, ...this.overlays]) layer.resize(viewport);
    this.postProcessor?.resize(viewport, this.app.renderer.resolution);
    this.setLayout(this.layoutChoice);
  }
}
