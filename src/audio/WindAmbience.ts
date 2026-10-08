import { config } from '../config/config';
import { gustAtX, type WindFrame } from '../scene/wind';

const NOISE_SECONDS = 6;
/** Gusts are sampled at these poster x positions, so the sound follows a gust across the screen. */
const LISTEN_AT: readonly number[] = [0.2, 0.5, 0.8];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const mix = (range: readonly [number, number], t: number): number => range[0] + (range[1] - range[0]) * t;

/** Soft brown noise for the low rumble, and white noise for the rustle of the grass. */
function noiseBuffer(context: AudioContext, brown: boolean): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * NOISE_SECONDS), context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white * 0.5;
    }
  }
  // Cross-fade the ends so the loop has no click.
  const fade = Math.floor(context.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const end = data.length - fade + i;
    data[end] = (data[end] ?? 0) * (1 - t) + (data[i] ?? 0) * t;
  }
  return buffer;
}

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly rumble: BiquadFilterNode;
  readonly rustle: BiquadFilterNode;
  readonly rustleGain: GainNode;
}

/**
 * A wind ambience made in code, with no sound files: a low rumble and the
 * rustle of the grass, both swelling with the same gusts that bend the grass
 * on screen. Off until the user turns it on in the settings (browsers only
 * allow sound after a tap or click); silent while the app is hidden.
 */
export class WindAmbience {
  private graph: Graph | null = null;
  private enabled = false;
  private lastUpdate = 0;

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      const graph = this.ensureGraph();
      void graph?.context.resume();
      // Started before any tap (a remembered setting): begin on the first one.
      if (graph?.context.state !== 'running') window.addEventListener('pointerdown', this.onFirstGesture, { once: true });
    }
    this.fadeTo(on ? config.sound.volume : 0);
  }

  /** Follow the wind; called every frame, applied about ten times a second. */
  update(wind: WindFrame, amount: number, now: number): void {
    const graph = this.graph;
    if (graph === null || !this.enabled || now - this.lastUpdate < 0.1) return;
    this.lastUpdate = now;
    const gust = Math.max(...LISTEN_AT.map((x) => gustAtX(wind, x)));
    const level = clamp01((0.25 + 0.75 * clamp01(gust)) * (0.5 + 0.5 * wind.gustiness) * amount);
    const t = graph.context.currentTime;
    graph.rumble.frequency.setTargetAtTime(mix(config.sound.rumble, level), t, 0.4);
    graph.rustle.frequency.setTargetAtTime(mix(config.sound.rustle, level), t, 0.3);
    graph.rustleGain.gain.setTargetAtTime(0.08 + 0.6 * level, t, 0.25);
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerdown', this.onFirstGesture);
    void this.graph?.context.close();
    this.graph = null;
  }

  private ensureGraph(): Graph | null {
    if (this.graph !== null) return this.graph;
    try {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);

      const rumbleSource = context.createBufferSource();
      rumbleSource.buffer = noiseBuffer(context, true);
      rumbleSource.loop = true;
      const rumble = context.createBiquadFilter();
      rumble.type = 'lowpass';
      rumble.frequency.value = config.sound.rumble[0];
      rumbleSource.connect(rumble).connect(master);

      const rustleSource = context.createBufferSource();
      rustleSource.buffer = noiseBuffer(context, false);
      rustleSource.loop = true;
      const rustle = context.createBiquadFilter();
      rustle.type = 'bandpass';
      rustle.Q.value = 0.7;
      rustle.frequency.value = config.sound.rustle[0];
      const rustleGain = context.createGain();
      rustleGain.gain.value = 0.1;
      rustleSource.connect(rustle).connect(rustleGain).connect(master);

      rumbleSource.start();
      rustleSource.start();
      this.graph = { context, master, rumble, rustle, rustleGain };
    } catch (error: unknown) {
      console.warn('[sound] Web Audio is not available', error);
    }
    return this.graph;
  }

  private fadeTo(volume: number): void {
    const graph = this.graph;
    if (graph === null) return;
    const t = graph.context.currentTime;
    graph.master.gain.cancelScheduledValues(t);
    graph.master.gain.setTargetAtTime(volume, t, config.sound.fade / 3);
  }

  private readonly onFirstGesture = (): void => {
    if (this.enabled) void this.graph?.context.resume();
  };

  private readonly onVisibility = (): void => {
    const context = this.graph?.context;
    if (context === undefined) return;
    if (document.hidden) void context.suspend();
    else if (this.enabled) void context.resume();
  };
}
