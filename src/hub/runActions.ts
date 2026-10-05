import type { ElementId } from './elementIds';
import type { CallApiAction, DialogAction, HubAction, SheetAction } from './protocol';
import { fillTemplate } from './template';

/** Everything the interface lets the hub do. */
export interface HubSurface {
  toast(text: string): void;
  /** A glass dialog or bottom sheet; its buttons run their own actions. */
  popup(action: DialogAction | SheetAction): void;
  /** In the system browser, or in the in-app glass web panel. */
  openUrl(url: string, target: 'browser' | 'panel'): void;
  navigate(screen: string): void;
  setText(target: ElementId, text: string): void;
  setVisible(target: ElementId, visible: boolean | 'toggle'): void;
  setSetting(key: string, value: string | number | boolean): void;
}

const API_TIMEOUT_MS = 8000;

/**
 * Only plain web addresses are ever opened. The addresses themselves come
 * from the hub's own definitions: the local hub refuses any address that is
 * not written in hub.py, and hub.json holds only those.
 */
export function isWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Runs a call_api action from hub.json (Android, or when the local hub is
 * down; the local hub makes such calls itself and sends back the text).
 * The result is only ever shown as text, never opened as an address.
 */
async function callApi(action: CallApiAction, surface: HubSurface, fetcher: typeof fetch): Promise<void> {
  if (!isWebUrl(action.url)) return;
  try {
    const init: RequestInit = {
      method: action.method,
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    };
    if (action.body !== null && action.body !== undefined) {
      init.body = JSON.stringify(action.body);
      init.headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    }
    const response = await fetcher(action.url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = fillTemplate(action.present.template, await response.json());
    if (action.present.kind === 'set_text' && action.present.target !== null) {
      surface.setText(action.present.target, text);
    } else {
      surface.toast(text);
    }
  } catch (error: unknown) {
    console.warn(`[hub] API call to ${action.url} failed`, error);
  }
}

/** Carry out the hub's actions in order. Unknown or unsafe actions are skipped. */
export async function runActions(
  actions: readonly HubAction[],
  surface: HubSurface,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'toast':
        surface.toast(action.text);
        break;
      case 'dialog':
      case 'sheet':
        surface.popup(action);
        break;
      case 'open_url':
        if (isWebUrl(action.url)) surface.openUrl(action.url, action.target === 'panel' ? 'panel' : 'browser');
        break;
      case 'navigate':
        surface.navigate(action.screen);
        break;
      case 'call_api':
        await callApi(action, surface, fetcher);
        break;
      case 'set_text':
        surface.setText(action.target, action.text);
        break;
      case 'set_visible':
        surface.setVisible(action.target, action.visible);
        break;
      case 'set_setting':
        surface.setSetting(action.key, action.value);
        break;
      case 'remote':
        // Resolved by the client before actions reach the interface.
        break;
    }
  }
}
