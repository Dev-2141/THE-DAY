/**
 * The one animation clock that drives the whole scene.
 *
 * Every layer receives `time` and `delta` from here, in seconds, already
 * multiplied by the time scale. Because nothing reads the frame count, motion
 * is identical at 30, 60, 120 or 144 Hz. Pausing, slowing and freezing the
 * scene is a single call on this object.
 */

export interface ClockFrame {
  /** Scene time in seconds since start, after time scaling and pauses. */
  readonly time: number;
  /** Scene seconds elapsed since the previous frame. */
  readonly delta: number;
}

export class AnimationClock {
  private sceneTime = 0;
  private lastDelta = 0;
  private lastRealDelta = 0;
  private scale: number;
  private motion = 1;
  private paused = false;
  private readonly maxDelta: number;

  // Frame-rate measurement uses real time, unaffected by scale or pause.
  private fpsWindowTime = 0;
  private fpsWindowFrames = 0;
  private measuredFps = 0;

  constructor(timeScale: number, maxDeltaSeconds: number) {
    this.scale = timeScale;
    this.maxDelta = maxDeltaSeconds;
  }

  /** Advance by a real-time interval in milliseconds. Returns the scene frame. */
  advance(realDeltaMs: number): ClockFrame {
    const realDelta = Math.max(0, realDeltaMs / 1000);
    this.lastRealDelta = Math.min(realDelta, this.maxDelta);
    this.measure(realDelta);

    const step = this.paused ? 0 : Math.min(realDelta, this.maxDelta) * this.scale * this.motion;
    this.sceneTime += step;
    this.lastDelta = step;
    return this.frame;
  }

  get frame(): ClockFrame {
    return { time: this.sceneTime, delta: this.lastDelta };
  }

  get fps(): number {
    return this.measuredFps;
  }

  get timeScale(): number {
    return this.scale;
  }

  set timeScale(value: number) {
    this.scale = Math.max(0, value);
  }

  /**
   * The motion setting's share of the speed, multiplied with the time scale.
   * Kept apart from the time scale, which the development panel uses to
   * fast-forward, so the two never overwrite each other.
   */
  get motionScale(): number {
    return this.motion;
  }

  set motionScale(value: number) {
    this.motion = Math.max(0, value);
  }

  /** Real seconds since the previous frame, unaffected by scale or pause (for input smoothing). */
  get realDelta(): number {
    return this.lastRealDelta;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Jump to a scene time, e.g. to inspect a moment far in the future. */
  seek(time: number): void {
    this.sceneTime = Math.max(0, time);
    this.lastDelta = 0;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  private measure(realDelta: number): void {
    this.fpsWindowTime += realDelta;
    this.fpsWindowFrames += 1;
    if (this.fpsWindowTime >= 0.5) {
      this.measuredFps = this.fpsWindowFrames / this.fpsWindowTime;
      this.fpsWindowTime = 0;
      this.fpsWindowFrames = 0;
    }
  }
}
