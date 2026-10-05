/**
 * Values that change while the scene runs, set by the quality level and the
 * motion setting. Layers read them in resize(); the stage lays the scene out
 * again whenever they change.
 */
export class SceneTuning {
  /** Share of dust motes and seeds drawn, 0..1 (quality level). */
  particles = 1;
  /** How far the grass, flowers and seeds move relative to the design, 0..1 (motion setting). */
  wind = 1;
}
