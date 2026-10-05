import type { HubAction } from './protocol';

/** What the interface offers the hub. Grows as later steps add pop-ups and screens. */
export interface HubSurface {
  toast(text: string): void;
}

/**
 * Carry out the hub's actions in order.
 * Step 1 renders toasts. The glass dialog, bottom sheet, web panel, screens
 * and live UI changes are built in step 10; until then each such action is
 * acknowledged with a toast so the round trip stays visible.
 */
export function runActions(actions: readonly HubAction[], surface: HubSurface): void {
  for (const action of actions) {
    if (action.type === 'toast') {
      surface.toast(action.text);
    } else {
      surface.toast(`Hub sent a "${action.type}" action. Its interface arrives in step 10.`);
    }
  }
}
