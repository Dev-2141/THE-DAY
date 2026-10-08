import { currentTextureSet } from '../assets/loader';
import { config, type QualityLevel } from '../config/config';
import { effectiveQuality, settingsStore } from '../core/settings';
import { QUALITY_LEVELS } from '../scene/quality';
import type { Stage } from '../scene/Stage';

export interface BenchmarkRow {
  readonly level: QualityLevel;
  /** GPU-synchronised cost of one frame. */
  readonly medianMs: number;
  readonly p90Ms: number;
  /** The highest frame rate that cost allows. */
  readonly capacityFps: number;
  /** Frames actually shown per second over a few seconds of normal running. */
  readonly displayFps: number;
}

export interface BenchmarkReport {
  readonly textures: string;
  readonly renderer: string;
  readonly screen: string;
  readonly rows: readonly BenchmarkRow[];
}

function rendererName(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

async function displayRate(seconds: number): Promise<number> {
  const start = performance.now();
  let frames = 0;
  await new Promise<void>((resolve) => {
    const tick = (now: number): void => {
      frames++;
      if (now - start < seconds * 1000) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  return (frames / (performance.now() - start)) * 1000;
}

/**
 * Development benchmark, run with ?benchmark in the address: every quality
 * level is measured twice, once synchronised with the GPU (its true cost
 * per frame) and once as frames actually shown per second. Under `npm run
 * dev` the report is also written to benchmark/results.json, or to
 * benchmark/<level>.json for ?benchmark=<level>.
 */
export async function runBenchmark(
  stage: Stage,
  levels: readonly QualityLevel[] = QUALITY_LEVELS,
  seconds = 4,
): Promise<BenchmarkReport> {
  const timings = await stage.measure(levels, 60);
  const rows: BenchmarkRow[] = [];
  for (const timing of timings) {
    stage.setQuality(config.quality.levels[timing.level]);
    await displayRate(0.5);
    const displayFps = await displayRate(seconds);
    rows.push({ ...timing, capacityFps: 1000 / Math.max(timing.medianMs, 0.01), displayFps });
  }
  // Back to the level the settings ask for.
  stage.setQuality(config.quality.levels[effectiveQuality(settingsStore.get())]);
  const report: BenchmarkReport = {
    textures: currentTextureSet(),
    renderer: rendererName(),
    screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    rows,
  };
  console.table(rows);
  if (import.meta.env.DEV) {
    const name = levels.length === 1 ? levels.join('') : 'results';
    await fetch(`/__the-day/benchmark?name=${name}`, { method: 'POST', body: JSON.stringify(report) }).catch(() => undefined);
  }
  return report;
}
