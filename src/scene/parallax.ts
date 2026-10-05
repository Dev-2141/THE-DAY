import { config } from '../config/config';

export interface ParallaxPoint {
  /** -1 .. 1: where the viewer is looking from, left to right and top to bottom. */
  readonly x: number;
  readonly y: number;
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

/** Vertical shifts are kept smaller than horizontal ones: the poster is tall. */
const VERTICAL_SHARE = 0.6;

/**
 * Depth response input. On Windows the mouse position steers it; on Android
 * the device tilt does, relative to a rest position that slowly follows how
 * the phone is held, with a touch drag as the fallback where there is no
 * tilt sensor. The result is smoothed and limited to -1..1, then scaled by
 * the motion setting (0 switches it off, as the calm mode does).
 */
export class ParallaxController {
  private target = { x: 0, y: 0 };
  private current = { x: 0, y: 0 };
  private amountValue = 1;
  private tilt: { beta: number; gamma: number } | null = null;
  private rest: { beta: number; gamma: number } | null = null;
  private dragging: { id: number; x: number; y: number } | null = null;
  /** True once a touch has been seen and no tilt sensor answers: touch drags steer instead. */
  private usesDrag = false;
  private attached = false;

  get point(): ParallaxPoint {
    return { x: this.current.x * this.amountValue, y: this.current.y * this.amountValue };
  }

  /** 0 (off) .. 1 (full): the motion setting. */
  set amount(value: number) {
    this.amountValue = Math.max(0, Math.min(1, value));
  }

  get amount(): number {
    return this.amountValue;
  }

  /** Pixels a layer at `depth` is shifted, for a poster `posterWidth` pixels wide. */
  shift(depth: number, posterWidth: number): [number, number] {
    const p = this.point;
    const reach = config.parallax.maxShift * posterWidth * depth;
    // Layers move against the viewer, as if seen from where the pointer is.
    return [-p.x * reach, -p.y * reach * VERTICAL_SHARE];
  }

  attach(): void {
    if (this.attached || !config.parallax.enabled) return;
    this.attached = true;
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('deviceorientation', this.onOrientation);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('deviceorientation', this.onOrientation);
  }

  /** Advance the smoothing by `dt` real seconds. */
  update(dt: number): void {
    const { smoothing, tiltRange, tiltRecenter } = config.parallax;
    if (this.tilt !== null) {
      const rest = (this.rest ??= { ...this.tilt });
      // The rest position follows a held tilt, so the scene settles back to centre.
      const follow = 1 - Math.exp(-dt / Math.max(tiltRecenter, 0.01));
      rest.beta += (this.tilt.beta - rest.beta) * follow;
      rest.gamma += (this.tilt.gamma - rest.gamma) * follow;
      this.target = {
        x: clamp1((this.tilt.gamma - rest.gamma) / tiltRange),
        y: clamp1((this.tilt.beta - rest.beta) / tiltRange),
      };
    } else if (this.dragging === null && this.usesDrag) {
      // A released drag drifts gently back to the centre.
      const back = 1 - Math.exp(-dt / 1.6);
      this.target = { x: this.target.x * (1 - back), y: this.target.y * (1 - back) };
    }
    const k = 1 - Math.exp(-dt / Math.max(smoothing, 0.01));
    this.current = {
      x: this.current.x + (this.target.x - this.current.x) * k,
      y: this.current.y + (this.target.y - this.current.y) * k,
    };
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') {
      this.target = {
        x: clamp1((event.clientX / window.innerWidth) * 2 - 1),
        y: clamp1((event.clientY / window.innerHeight) * 2 - 1),
      };
      return;
    }
    const drag = this.dragging;
    if (this.tilt !== null || drag === null || drag.id !== event.pointerId) return;
    const scale = Math.min(window.innerWidth, window.innerHeight) * 0.5;
    this.target = {
      x: clamp1(this.target.x + (event.clientX - drag.x) / scale),
      y: clamp1(this.target.y + (event.clientY - drag.y) / scale),
    };
    this.dragging = { id: drag.id, x: event.clientX, y: event.clientY };
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    this.usesDrag = this.tilt === null;
    this.dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.dragging?.id === event.pointerId) this.dragging = null;
  };

  private readonly onLeave = (): void => {
    if (this.tilt === null && !this.usesDrag) this.target = { x: 0, y: 0 };
  };

  private readonly onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta === null || event.gamma === null) return;
    this.tilt = { beta: event.beta, gamma: event.gamma };
  };
}
