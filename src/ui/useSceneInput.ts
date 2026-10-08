import { useEffect, type RefObject } from 'react';
import { config } from '../config/config';
import type { ElementId } from '../hub/elementIds';
import type { Scene } from '../scene/composition';
import type { Stage } from '../scene/Stage';
import type { HubApi } from './HubContext';

interface Running {
  readonly stage: Stage;
  readonly scene: Scene;
}

interface Press {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly target: ElementId | null;
  timer: number;
  longPressed: boolean;
  moved: boolean;
}

/**
 * Taps, long presses and hovers on the scene itself: the ship, the beam, the
 * domes, the aircraft, the wreck, the grass and the text. Every one goes to
 * the hub; an object with no connection simply does nothing. A press that
 * moves becomes a drag (which steers the depth response on touch screens)
 * instead of a tap.
 *
 * `onEmptyTap` runs for a tap on nothing connected (it brings the interface
 * back from the clean view).
 */
export function useSceneInput(
  host: RefObject<HTMLElement | null>,
  running: Running | null,
  hub: HubApi,
  onEmptyTap: () => void,
): void {
  useEffect(() => {
    const element = host.current;
    if (element === null || running === null) return undefined;
    const { stage, scene } = running;
    let press: Press | null = null;
    /** A finished tap, sent on the click that follows it (see onClick). */
    let tapped: { readonly target: ElementId | null; readonly x: number; readonly y: number } | null = null;
    let hovered: ElementId | null = null;
    let hoverTimer = 0;

    const hitAt = (x: number, y: number): ElementId | null => {
      const viewport = stage.viewport;
      if (viewport === null) return null;
      const rect = element.getBoundingClientRect();
      return scene.hitTest(x - rect.left, y - rect.top, viewport, (layer) => stage.layerOffset(layer));
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!event.isPrimary || event.button > 0) return;
      const target = hitAt(event.clientX, event.clientY);
      const next: Press = { id: event.pointerId, x: event.clientX, y: event.clientY, target, timer: 0, longPressed: false, moved: false };
      if (target !== null && hub.isConnected(target, 'long_press')) {
        next.timer = window.setTimeout(() => {
          if (press !== next || next.moved) return;
          next.longPressed = true;
          void hub.trigger(target, 'long_press');
        }, config.ui.longPressMs);
      }
      press = next;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (press !== null && press.id === event.pointerId && !press.moved) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > config.ui.tapSlop) {
          press.moved = true;
          window.clearTimeout(press.timer);
        }
      }
      if (event.pointerType !== 'mouse') return;
      const target = hitAt(event.clientX, event.clientY);
      element.style.cursor = target !== null && hub.isConnected(target) ? 'pointer' : '';
      if (target === hovered) return;
      hovered = target;
      window.clearTimeout(hoverTimer);
      if (target !== null && hub.isConnected(target, 'hover')) {
        hoverTimer = window.setTimeout(() => void hub.trigger(target, 'hover'), config.ui.hoverMs);
      }
    };

    const onPointerUp = (event: PointerEvent): void => {
      const done = press;
      if (done === null || done.id !== event.pointerId) return;
      press = null;
      window.clearTimeout(done.timer);
      if (done.moved || done.longPressed) return;
      tapped = { target: done.target, x: event.clientX, y: event.clientY };
    };

    // The tap is sent on the click that ends it, not on the pointer's release:
    // a pop-up that appeared at once would otherwise catch that click itself
    // (on touch screens the browser sends it after the finger lifts).
    const onClick = (): void => {
      const tap = tapped;
      tapped = null;
      if (tap === null) return;
      if (tap.target !== null && hub.isConnected(tap.target, 'tap')) {
        void hub.trigger(tap.target, 'tap', { x: tap.x, y: tap.y });
      } else {
        onEmptyTap();
      }
    };

    const onPointerCancel = (): void => {
      if (press !== null) window.clearTimeout(press.timer);
      press = null;
    };

    const onLeave = (): void => {
      hovered = null;
      window.clearTimeout(hoverTimer);
      element.style.cursor = '';
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('pointerleave', onLeave);
    element.addEventListener('click', onClick);
    return () => {
      onPointerCancel();
      onLeave();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('click', onClick);
    };
  }, [host, running, hub, onEmptyTap]);
}
