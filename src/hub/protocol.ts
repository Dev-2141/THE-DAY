/**
 * The wire format between the interface and the hub. Mirrors
 * `hub/hub_core/actions.py`; both sides must agree on every field.
 */
import type { ElementId, HubEvent } from './elementIds';

export interface HubButton {
  readonly label: string;
  /** Actions to run when the button is pressed. Empty just closes the pop-up. */
  readonly actions: readonly HubAction[];
}

export interface OpenUrlAction {
  readonly type: 'open_url';
  readonly url: string;
  readonly target: 'browser' | 'panel';
}

export interface DialogAction {
  readonly type: 'dialog';
  readonly title: string;
  readonly text: string;
  readonly buttons: readonly HubButton[];
}

export interface SheetAction {
  readonly type: 'sheet';
  readonly title: string;
  readonly text: string;
  readonly buttons: readonly HubButton[];
}

export interface ToastAction {
  readonly type: 'toast';
  readonly text: string;
}

export interface NavigateAction {
  readonly type: 'navigate';
  readonly screen: string;
}

/** How to present the JSON result of an API call. `{a.b}` in the template reads a field. */
export interface ApiPresentation {
  readonly kind: 'toast' | 'set_text';
  readonly template: string;
  readonly target: ElementId | null;
}

export interface CallApiAction {
  readonly type: 'call_api';
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly body: unknown;
  readonly present: ApiPresentation;
}

export interface SetTextAction {
  readonly type: 'set_text';
  readonly target: ElementId;
  readonly text: string;
}

export interface SetVisibleAction {
  readonly type: 'set_visible';
  readonly target: ElementId;
  /** 'toggle' flips the current state (used to open and close the settings panel). */
  readonly visible: boolean | 'toggle';
}

export interface SetSettingAction {
  readonly type: 'set_setting';
  readonly key: string;
  readonly value: string | number | boolean;
}

/** In an exported hub.json: this binding is a custom Python function. */
export interface RemoteAction {
  readonly type: 'remote';
  readonly function: string;
}

export type HubAction =
  | OpenUrlAction
  | DialogAction
  | SheetAction
  | ToastAction
  | NavigateAction
  | CallApiAction
  | SetTextAction
  | SetVisibleAction
  | SetSettingAction
  | RemoteAction;

export interface HubEventRequest {
  readonly id: ElementId;
  readonly event: HubEvent;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface HubEventResponse {
  readonly actions: readonly HubAction[];
}

/** A "timer" connection: the interface sends the event every `every` seconds. */
export interface HubTimer {
  readonly id: ElementId;
  readonly every: number;
}

/**
 * Shape of hub.json written by `npm run hub:export`, and of the local hub's
 * GET /manifest reply: every connection, so the interface knows which
 * elements are connected and which timers to run.
 */
export interface ExportedHub {
  readonly version: 1;
  readonly bindings: Readonly<Record<string, Readonly<Record<string, readonly HubAction[]>>>>;
  readonly timers?: readonly HubTimer[];
}

export interface HubConnection {
  readonly url: string;
  readonly token: string;
}
