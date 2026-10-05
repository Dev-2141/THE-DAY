import { AircraftLayer } from './layers/AircraftLayer';
import { BeamGroundLayer } from './layers/BeamGroundLayer';
import { BeamLayer } from './layers/BeamLayer';
import { CloudsLayer } from './layers/CloudsLayer';
import { DomesLayer } from './layers/DomesLayer';
import { GrassLayer } from './layers/GrassLayer';
import { HazeLayer } from './layers/HazeLayer';
import { MountainsLayer } from './layers/MountainsLayer';
import { ReferenceLayer } from './layers/ReferenceLayer';
import { SeedsLayer } from './layers/SeedsLayer';
import { ShipLayer } from './layers/ShipLayer';
import { ShipShadowLayer } from './layers/ShipShadowLayer';
import { SkyLayer } from './layers/SkyLayer';
import { SunGlowLayer } from './layers/SunGlowLayer';
import { TextLayer } from './layers/TextLayer';
import { WaterLayer } from './layers/WaterLayer';
import { WreckLayer } from './layers/WreckLayer';
import { config } from '../config/config';
import type { ElementId } from '../hub/elementIds';
import type { FocusTargets } from './post/PostProcessor';
import { SceneTuning } from './tuning';
import type { PosterViewport, SceneLayer } from './types';

/** How far the depth response has shifted a layer, in screen pixels. */
export type LayerOffset = (layerId: string) => readonly [x: number, y: number];

/** Aircraft are small; a finger needs a bigger target than the image. */
const AIRCRAFT_TOUCH_MARGIN = 14;

export interface Scene {
  /** Every layer, back to front. */
  readonly layers: readonly SceneLayer[];
  /** Drawn over the finished picture, untouched by post-processing. */
  readonly overlays: readonly SceneLayer[];
  /** What the depth-of-field pass softens: the farthest sky and the nearest grass. */
  readonly focus: FocusTargets;
  readonly text: TextLayer;
  readonly reference: ReferenceLayer;
  /** Particle share and wind amount, changed by the quality level and the motion setting. */
  readonly tuning: SceneTuning;
  /** The tappable element at a screen point, front to back, or null. */
  hitTest(x: number, y: number, viewport: PosterViewport, offset: LayerOffset): ElementId | null;
}

/**
 * The poster, back to front. This order is the composition: the far and mid
 * clouds behind the ship, with its shadow falling on them; wisps over the
 * ship's outer edges and the near clouds in front of it; the far ridges
 * behind the beam (so it tints them), the nearer ridges in front. A plane of
 * haze sits between each pair of distance planes, so the farther something
 * is, the more haze lies over it. The beam's ground glow comes after the
 * water so it lights the ridges, haze and water at its foot. The reference
 * overlay is drawn on top of the finished picture, so comparisons stay true.
 */
export function createScene(): Scene {
  const tuning = new SceneTuning();
  const text = new TextLayer();
  const reference = new ReferenceLayer();
  const sky = new SkyLayer();
  const cloudsFar = new CloudsLayer('far');
  const grass = new GrassLayer(tuning);
  const aircraft = new AircraftLayer();
  const layers: SceneLayer[] = [
    sky,
    cloudsFar,
    new CloudsLayer('mid'),
    new ShipShadowLayer(),
    new SunGlowLayer(),
    new DomesLayer(),
    new HazeLayer('far'),
    new MountainsLayer('far'),
    new HazeLayer('mid'),
    new BeamLayer(tuning),
    new ShipLayer(),
    CloudsLayer.shipVeil(),
    new CloudsLayer('near'),
    aircraft,
    new MountainsLayer('mid'),
    new HazeLayer('near'),
    new MountainsLayer('near'),
    new WreckLayer(),
    new WaterLayer(),
    new BeamGroundLayer(),
    grass,
    new SeedsLayer(tuning),
    text,
  ];
  return {
    layers,
    overlays: [reference],
    focus: { far: [sky.view, cloudsFar.view], near: [grass.nearView] },
    text,
    reference,
    tuning,
    hitTest(x, y, viewport, offset) {
      const inArea = (area: readonly [number, number, number, number], layer: string): boolean => {
        const [dx, dy] = offset(layer);
        const px = (x - dx - viewport.x) / viewport.width;
        const py = (y - dy - viewport.y) / viewport.height;
        return px >= area[0] && px <= area[2] && py >= area[1] && py <= area[3];
      };
      const areas = config.ui.hitAreas;
      // The text is in front of everything; the aircraft fly in front of the rest of the sky.
      for (const hit of areas) if (hit.layer === 'text' && inArea(hit.area, hit.layer)) return hit.id;
      const [ax, ay] = offset(aircraft.id);
      for (const box of aircraft.hitBoxes()) {
        const m = Math.max(AIRCRAFT_TOUCH_MARGIN, box.width * 0.5);
        const bx = x - ax;
        const by = y - ay;
        if (bx >= box.x - m && bx <= box.x + box.width + m && by >= box.y - m && by <= box.y + box.height + m) {
          return 'scene.aircraft';
        }
      }
      for (const hit of areas) if (hit.layer !== 'text' && inArea(hit.area, hit.layer)) return hit.id;
      return null;
    },
  };
}
