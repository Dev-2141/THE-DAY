/**
 * State of the glass interface: which screen is shown, whether the settings
 * panel is open, the clean view, pop-ups and the in-app web panel, plus the
 * labels and visibility the hub can change. Held outside React so the hub
 * surface can change it from anywhere.
 */
import { useSyncExternalStore } from 'react';
import type { ElementId } from '../hub/elementIds';
import type { HubButton } from '../hub/protocol';

/** Screens the hub can navigate to. */
export const SCREENS = ['home', 'enter'] as const;
export type Screen = (typeof SCREENS)[number];

export function isScreen(value: string): value is Screen {
  return (SCREENS as readonly string[]).includes(value);
}

export interface PopupState {
  readonly key: number;
  readonly kind: 'dialog' | 'sheet';
  readonly title: string;
  readonly text: string;
  readonly buttons: readonly HubButton[];
}

export interface WebPanelState {
  readonly key: number;
  readonly url: string;
}

export interface InterfaceState {
  readonly screen: Screen;
  readonly settingsOpen: boolean;
  /** The clean view: the whole interface is hidden until the user brings it back. */
  readonly uiHidden: boolean;
  readonly hidden: ReadonlySet<ElementId>;
  readonly labels: Readonly<Partial<Record<ElementId, string>>>;
  readonly popups: readonly PopupState[];
  readonly web: WebPanelState | null;
}

type Listener = () => void;

export class InterfaceStore {
  private state: InterfaceState = {
    screen: 'home',
    settingsOpen: false,
    uiHidden: false,
    hidden: new Set(),
    labels: {},
    popups: [],
    web: null,
  };
  private readonly listeners = new Set<Listener>();
  private nextKey = 1;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly get = (): InterfaceState => this.state;

  /** How many layers sit above the home screen; each one is closed by Escape or Back. */
  depth(): number {
    const s = this.state;
    return (s.screen === 'home' ? 0 : 1) + (s.settingsOpen ? 1 : 0) + s.popups.length + (s.web === null ? 0 : 1);
  }

  setScreen(screen: Screen): void {
    // Moving between screens closes whatever floated over the old one.
    this.update({ screen, settingsOpen: false, popups: [], web: null });
  }

  setSettingsOpen(open: boolean | 'toggle'): void {
    const next = open === 'toggle' ? !this.state.settingsOpen : open;
    this.update({ settingsOpen: next, uiHidden: next ? false : this.state.uiHidden });
  }

  setUiHidden(hidden: boolean | 'toggle'): void {
    const next = hidden === 'toggle' ? !this.state.uiHidden : hidden;
    this.update({ uiHidden: next, settingsOpen: next ? false : this.state.settingsOpen });
  }

  setElementVisible(id: ElementId, visible: boolean | 'toggle'): void {
    const hidden = new Set(this.state.hidden);
    const show = visible === 'toggle' ? hidden.has(id) : visible;
    if (show) hidden.delete(id);
    else hidden.add(id);
    this.update({ hidden });
  }

  setLabel(id: ElementId, text: string): void {
    const labels = { ...this.state.labels };
    if (text === '') delete labels[id];
    else labels[id] = text;
    this.update({ labels });
  }

  pushPopup(popup: Omit<PopupState, 'key'>): void {
    this.update({ popups: [...this.state.popups, { ...popup, key: this.nextKey++ }] });
  }

  closePopup(key: number): void {
    this.update({ popups: this.state.popups.filter((p) => p.key !== key) });
  }

  openWeb(url: string): void {
    this.update({ web: { key: this.nextKey++, url } });
  }

  closeWeb(): void {
    this.update({ web: null });
  }

  /** Close the topmost layer: web panel, then pop-ups, then settings, then the screen. Returns false if nothing was open. */
  closeTop(): boolean {
    const s = this.state;
    const top = s.popups.at(-1);
    if (s.web !== null) this.closeWeb();
    else if (top !== undefined) this.closePopup(top.key);
    else if (s.settingsOpen) this.setSettingsOpen(false);
    else if (s.screen !== 'home') this.setScreen('home');
    else return false;
    return true;
  }

  private update(change: Partial<InterfaceState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
}

export const interfaceStore = new InterfaceStore();

export function useInterface(): InterfaceState {
  return useSyncExternalStore(interfaceStore.subscribe, interfaceStore.get);
}
