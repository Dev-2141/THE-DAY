import { flushSync } from 'react-dom';
import { openExternal } from '../core/openExternal';
import type { QualityChoice, SettingsStore } from '../core/settings';
import type { ElementId } from '../hub/elementIds';
import type { HubSurface } from '../hub/runActions';
import type { Scene } from '../scene/composition';
import type { Stage } from '../scene/Stage';
import { isScreen, type InterfaceStore } from './interfaceStore';

export interface SurfaceDeps {
  readonly toast: (text: string) => void;
  readonly stage: () => Stage | null;
  readonly scene: () => Scene | null;
  readonly settings: SettingsStore;
  readonly store: InterfaceStore;
}

/** The scene layers behind each tappable object, for set_visible. */
const SCENE_LAYERS: Partial<Record<ElementId, readonly string[]>> = {
  'scene.ship': ['ship', 'ship-shadow'],
  'scene.beam': ['beams', 'beam-ground'],
  'scene.aircraft': ['aircraft'],
  'scene.wreck': ['wreck'],
  'scene.grass': ['grass', 'seeds'],
  'scene.dome_left': ['domes'],
  'scene.dome_right': ['domes'],
};

const QUALITY_CHOICES: readonly string[] = ['auto', 'low', 'medium', 'high', 'ultra'];

/**
 * Change the interface with a morph where the browser supports view
 * transitions (the ENTER pill grows into the ENTER screen's panel), and
 * instantly where it does not.
 */
export function withTransition(change: () => void): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reduced) {
    change();
    return;
  }
  document.startViewTransition(() => flushSync(change));
}

/** The interface as the hub sees it: what each action does on screen. */
export function createSurface(deps: SurfaceDeps): HubSurface {
  const { store, settings } = deps;
  const warn = (message: string): void => console.warn(`[hub] ${message}`);

  return {
    toast: deps.toast,

    popup(action) {
      store.pushPopup({ kind: action.type, title: action.title, text: action.text, buttons: action.buttons });
    },

    openUrl(url, target) {
      if (target === 'panel') {
        store.openWeb(url);
        return;
      }
      openExternal(url).catch((error: unknown) => warn(`could not open ${url}: ${String(error)}`));
    },

    navigate(screen) {
      if (!isScreen(screen)) {
        warn(`there is no screen called "${screen}"`);
        return;
      }
      withTransition(() => store.setScreen(screen));
    },

    setText(target, text) {
      const scene = deps.scene();
      if (target === 'text.time' || target === 'text.date') {
        scene?.text.setOverride(target === 'text.time' ? 'time' : 'date', text);
      } else if (target === 'text.title') {
        warn('the title wording never changes');
      } else {
        store.setLabel(target, text);
      }
    },

    setVisible(target, visible) {
      if (target === 'ui') {
        store.setUiHidden(visible === 'toggle' ? 'toggle' : !visible);
      } else if (target === 'panel.settings') {
        store.setSettingsOpen(visible);
      } else if (target === 'text.time' || target === 'text.date') {
        deps.scene()?.text.setLineVisible(target === 'text.time' ? 'time' : 'date', visible !== false);
      } else if (SCENE_LAYERS[target] !== undefined) {
        for (const layer of SCENE_LAYERS[target] ?? []) deps.stage()?.setLayerVisible(layer, visible);
      } else {
        store.setElementVisible(target, visible);
      }
    },

    setSetting(key, value) {
      const isBool = typeof value === 'boolean';
      switch (key) {
        case 'time.timeZone':
          if (typeof value === 'string') settings.set({ timeZone: value });
          return;
        case 'time.hour12':
          if (isBool) settings.set({ hour12: value });
          return;
        case 'time.showSeconds':
          if (isBool) settings.set({ showSeconds: value });
          return;
        case 'motion':
          if (typeof value === 'number') settings.set({ motion: Math.max(0, Math.min(1, value)) });
          return;
        case 'quality':
          if (typeof value === 'string' && QUALITY_CHOICES.includes(value)) settings.set({ quality: value as QualityChoice });
          return;
        case 'sound':
          if (isBool) settings.set({ sound: value });
          return;
        case 'layout':
          if (value === 'extend' || value === 'letterbox') deps.stage()?.setLayout(value);
          return;
        default:
          warn(`unknown setting "${key}"`);
      }
    },
  };
}
