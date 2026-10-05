/**
 * Asset manifest: every image the app loads is listed here and nowhere else.
 *
 * To swap a layer, replace the file at its path (keep the file name).
 * No code change is needed, and any resolution works as long as the image
 * keeps the aspect ratio described for its `frame`.
 *
 * Frames:
 *   'canvas'  — the shared extended scene canvas. Full-scene layers are all
 *               exported on this one canvas so they register automatically.
 *               At 4K it is 3840 x 4000 px, with the 455 x 674 poster area
 *               mapped to the 2160 x 3200 px box whose top-left is at
 *               (840, 400). The margins are the sky above, the grass below
 *               and the extensions left and right for wide windows.
 *   'tile'    — a cloud band that tiles seamlessly left to right.
 *   'object'  — a tight cut-out of a single object, placed by the config.
 *   'poster'  — exactly the poster area (455 x 674 ratio).
 */

export type AssetFrame = 'canvas' | 'tile' | 'object' | 'poster';

export interface AssetEntry {
  /** Path under /public, relative, so it works in the browser and in Tauri. */
  readonly src: string;
  readonly frame: AssetFrame;
  /** What the image shows, for whoever produces the artwork. */
  readonly shows: string;
  /** Requested size at 4K portrait quality. */
  readonly size4k: readonly [width: number, height: number];
  readonly transparent: boolean;
}

/** Geometry of the shared extended canvas at its 4K size. */
export const SCENE_CANVAS = {
  width: 3840,
  height: 4000,
  posterX: 840,
  posterY: 400,
  posterWidth: 2160,
  posterHeight: 3200,
} as const;

export const assetManifest = {
  reference: {
    src: 'assets/reference/reference.png',
    frame: 'poster',
    shows: 'The reference poster. Used for the full-screen preview and the alignment overlay.',
    size4k: [455, 674],
    transparent: false,
  },
  skyBase: {
    src: 'assets/layers/sky-base.png',
    frame: 'canvas',
    shows: 'Warm cream, peach and tan sky gradient with soft built-in cloud texture, cooler blue-grey at the top. No ship, beams or terrain.',
    size4k: [3840, 4000],
    transparent: false,
  },
  cloudsFar: {
    src: 'assets/layers/clouds-far.png',
    frame: 'tile',
    shows: 'Large, soft, slow cloud masses. Tiles seamlessly left to right.',
    size4k: [4096, 2700],
    transparent: true,
  },
  cloudsMid: {
    src: 'assets/layers/clouds-mid.png',
    frame: 'tile',
    shows: 'Medium cloud between the far masses and the near wisps. Tiles seamlessly left to right.',
    size4k: [4096, 2700],
    transparent: true,
  },
  cloudsNear: {
    src: 'assets/layers/clouds-near.png',
    frame: 'tile',
    shows: 'Wispy cloud that passes over the top of the ship and around the domes. Tiles seamlessly left to right.',
    size4k: [4096, 2700],
    transparent: true,
  },
  ship: {
    src: 'assets/layers/ship.png',
    frame: 'object',
    shows: 'The whole ship: both angular halves, the V-notch, pale hull, dark underside and the curved emitter. No beams.',
    size4k: [2400, 640],
    transparent: true,
  },
  shipLights: {
    src: 'assets/layers/ship-lights.png',
    frame: 'object',
    shows: 'Same frame as ship.png: only the running lights and emitter glow, white on transparent. Drives the light pulse.',
    size4k: [2400, 640],
    transparent: true,
  },
  domeLeft: {
    src: 'assets/layers/dome-left.png',
    frame: 'object',
    shows: 'The large left dome, including its thin row of lights, without haze baked in.',
    size4k: [1000, 820],
    transparent: true,
  },
  domeRight: {
    src: 'assets/layers/dome-right.png',
    frame: 'object',
    shows: 'The smaller right dome, including its thin row of lights, without haze baked in.',
    size4k: [700, 640],
    transparent: true,
  },
  aircraft: {
    src: 'assets/layers/aircraft.png',
    frame: 'object',
    shows: 'One small aircraft seen as in the reference, flying up and to the right. No vapour trail; trails are generated.',
    size4k: [480, 240],
    transparent: true,
  },
  mountainsFar: {
    src: 'assets/layers/mountains-far.png',
    frame: 'canvas',
    shows: 'The farthest, palest ridge line, behind the beam.',
    size4k: [3840, 4000],
    transparent: true,
  },
  mountainsMid: {
    src: 'assets/layers/mountains-mid.png',
    frame: 'canvas',
    shows: 'The middle ridges, including the ones lit cyan by the beam.',
    size4k: [3840, 4000],
    transparent: true,
  },
  mountainsNear: {
    src: 'assets/layers/mountains-near.png',
    frame: 'canvas',
    shows: 'The nearest, darkest ridges and terrain.',
    size4k: [3840, 4000],
    transparent: true,
  },
  wreck: {
    src: 'assets/layers/wreck.png',
    frame: 'object',
    shows: 'The small tilted crashed craft at the lower left.',
    size4k: [800, 560],
    transparent: true,
  },
  water: {
    src: 'assets/layers/water.png',
    frame: 'canvas',
    shows: 'The thin pale strips of marsh water, and the ground behind the grass down to the bottom edge, with no grass in it. Without reflections baked in if possible.',
    size4k: [3840, 4000],
    transparent: true,
  },
  grassFar: {
    src: 'assets/layers/grass-far.png',
    frame: 'canvas',
    shows: 'The back row of grass and reeds, smallest and hazier. Blades only, on transparent.',
    size4k: [3840, 4000],
    transparent: true,
  },
  grassMid: {
    src: 'assets/layers/grass-mid.png',
    frame: 'canvas',
    shows: 'The middle row of grass and reeds. Blades only, on transparent.',
    size4k: [3840, 4000],
    transparent: true,
  },
  grassNear: {
    src: 'assets/layers/grass-near.png',
    frame: 'canvas',
    shows: 'The front row: tallest, darkest grass and reeds along the bottom edge, denser toward the right. Blades only, on transparent.',
    size4k: [3840, 4000],
    transparent: true,
  },
  flowers: {
    src: 'assets/layers/flowers.png',
    frame: 'canvas',
    shows: 'Only the tiny warm orange flowers, on transparent, so they can bob with the grass.',
    size4k: [3840, 4000],
    transparent: true,
  },
} as const satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof assetManifest;
