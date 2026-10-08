import { Assets, type Texture } from 'pixi.js';
import type { QualityLevelConfig } from '../config/config';
import { assetManifest, type AssetKey } from './manifest';

export type TextureSet = QualityLevelConfig['textures'];

const users = new Map<AssetKey, number>();
/** The URL each key was loaded from, so it is unloaded from the same place. */
const loadedFrom = new Map<AssetKey, string>();
let textureSet: TextureSet = 'full';

/**
 * Which texture set to load: the original images, or the smaller compressed
 * copies made by `npm run assets:textures` for the medium and low quality
 * levels. Takes effect for textures loaded afterwards.
 */
export function setTextureSet(set: TextureSet): void {
  textureSet = set;
}

export function currentTextureSet(): TextureSet {
  return textureSet;
}

/** The file a loaded texture actually came from (the reduced copy, or the original). */
export function loadedTextureUrl(key: AssetKey): string | null {
  return loadedFrom.get(key) ?? null;
}

/** Resolve a manifest entry to a URL that works under vite dev, a build and Tauri. */
export function assetUrl(key: AssetKey): string {
  return `${import.meta.env.BASE_URL}${assetManifest[key].src}`;
}

/**
 * The URL of a key in a reduced set: assets/layers/sky-base.png becomes
 * assets/layers/medium/sky-base.webp. The reference is never reduced.
 */
export function reducedUrl(key: AssetKey, set: Exclude<TextureSet, 'full'>): string | null {
  const src = assetManifest[key].src;
  const slash = src.lastIndexOf('/');
  if (key === 'reference' || slash < 0) return null;
  const name = src.slice(slash + 1).replace(/\.[^.]+$/, '');
  return `${import.meta.env.BASE_URL}${src.slice(0, slash)}/${set}/${name}.webp`;
}

// ------------------------------------------------------------------ progress

type ProgressListener = (loaded: number, total: number) => void;
const progressListeners = new Set<ProgressListener>();
let requested = 0;
let finished = 0;

/** Follow texture loading, for the loading screen. Counts restart when everything has loaded. */
export function onLoadProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

function report(): void {
  for (const listener of progressListeners) listener(finished, requested);
  if (finished >= requested) {
    requested = 0;
    finished = 0;
  }
}

async function loadFrom(key: AssetKey): Promise<Texture> {
  if (textureSet !== 'full') {
    const reduced = reducedUrl(key, textureSet);
    if (reduced !== null) {
      try {
        const texture = await Assets.load<Texture>(reduced);
        loadedFrom.set(key, reduced);
        return texture;
      } catch {
        // No reduced copy (not generated yet): use the original image.
      }
    }
  }
  const url = assetUrl(key);
  const texture = await Assets.load<Texture>(url);
  loadedFrom.set(key, url);
  return texture;
}

/**
 * Load a texture by manifest key. Calls share one cached texture; each call
 * must be paired with releaseTexture() so the texture is freed only once no
 * layer uses it.
 */
export async function loadTexture(key: AssetKey): Promise<Texture> {
  users.set(key, (users.get(key) ?? 0) + 1);
  requested++;
  report();
  try {
    return await loadFrom(key);
  } finally {
    finished++;
    report();
  }
}

export function releaseTexture(key: AssetKey): void {
  const remaining = (users.get(key) ?? 1) - 1;
  if (remaining > 0) {
    users.set(key, remaining);
    return;
  }
  users.delete(key);
  const url = loadedFrom.get(key) ?? assetUrl(key);
  loadedFrom.delete(key);
  void Assets.unload(url).catch(() => undefined);
}
