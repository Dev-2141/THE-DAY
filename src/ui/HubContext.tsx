import { createContext, useCallback, useContext, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { config } from '../config/config';
import type { HubResult } from '../hub/client';
import type { ElementId, HubEvent } from '../hub/elementIds';
import type { HubAction } from '../hub/protocol';

/** How the interface talks to the connectivity hub. */
export interface HubApi {
  /** Send an element's event to the hub and carry out what it answers. */
  trigger(id: ElementId, event: HubEvent, payload?: Readonly<Record<string, unknown>>): Promise<HubResult>;
  /** Carry out actions the hub already sent (a pop-up's button). */
  run(actions: readonly HubAction[]): void;
  /** Whether hub.py connects anything to this element (and event). */
  isConnected(id: ElementId, event?: HubEvent): boolean;
}

export const HubContext = createContext<HubApi | null>(null);

export function useHub(): HubApi {
  const hub = useContext(HubContext);
  if (hub === null) throw new Error('useHub needs a HubContext provider');
  return hub;
}

export interface GestureHandlers {
  readonly onClick: () => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
  readonly onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: () => void;
  readonly onContextMenu: (event: { preventDefault(): void }) => void;
}

/**
 * Tap, long press and hover for one element, all sent to the hub. A click
 * (pointer, Enter or Space) is a tap, unless it ended a long press.
 */
export function useHubGestures(id: ElementId, payload?: Readonly<Record<string, unknown>>): GestureHandlers {
  const hub = useHub();
  const pressTimer = useRef(0);
  const hoverTimer = useRef(0);
  const longPressed = useRef(false);

  useEffect(
    () => () => {
      window.clearTimeout(pressTimer.current);
      window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const endPress = useCallback((): void => window.clearTimeout(pressTimer.current), []);

  return {
    onClick: () => {
      if (longPressed.current) {
        longPressed.current = false;
        return;
      }
      void hub.trigger(id, 'tap', payload);
    },
    onPointerDown: (event) => {
      if (event.button > 0) return;
      longPressed.current = false;
      window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => {
        longPressed.current = true;
        void hub.trigger(id, 'long_press', payload);
      }, config.ui.longPressMs);
    },
    onPointerUp: endPress,
    onPointerCancel: endPress,
    onPointerEnter: (event) => {
      if (event.pointerType !== 'mouse') return;
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => void hub.trigger(id, 'hover', payload), config.ui.hoverMs);
    },
    onPointerLeave: () => {
      endPress();
      window.clearTimeout(hoverTimer.current);
    },
    // A long press on a touch screen must not open the browser's menu.
    onContextMenu: (event) => event.preventDefault(),
  };
}
