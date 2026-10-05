/**
 * THE DAY: the single place for every tunable value.
 *
 * Speeds, intensities, colours and positions live here and only here.
 * Positions are fractions of the poster (0..1), measured from its top-left,
 * exactly as in the build brief. Later steps add their sections here.
 */

import type { ElementId } from '../hub/elementIds';

export type StageLayout = 'extend' | 'letterbox';

/** Typeface pairing for THE, D and Y. The swash A is drawn in all of them. */
export type DisplayFont = 'bodoni' | 'italiana' | 'playfair';

export interface PosterConfig {
  /** Design-space size of the poster (the reference is 455 x 674). */
  readonly width: number;
  readonly height: number;
}

export interface StageConfig {
  /** Colour behind the poster in letterbox mode, and while loading. */
  readonly background: string;
  /**
   * 'extend': the poster is fully visible and the sky, terrain and grass
   * continue past its edges to fill any window shape.
   * 'letterbox': the poster alone, with plain bars around it.
   */
  readonly layout: StageLayout;
  /** Upper bound for the renderer's pixel ratio, to keep 4K screens affordable. */
  readonly maxPixelRatio: number;
}

export interface ClockConfig {
  /** 1 is real time, 0.5 is half speed, 0 freezes the scene. */
  readonly timeScale: number;
  /** Longest single step the scene may take, in seconds, e.g. after a stall. */
  readonly maxDeltaSeconds: number;
}

export interface TimeConfig {
  /** IANA zone such as 'Asia/Kolkata'. Empty string uses the device's own zone. */
  readonly timeZone: string;
  readonly hour12: boolean;
  readonly showSeconds: boolean;
  /** BCP 47 locale for weekday and month names. */
  readonly locale: string;
}

/** Where a cut-out object sits: its top-left corner and its width, as poster fractions. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface WindConfig {
  /** +1 blows left to right, -1 right to left. Clouds, haze, smoke, grass and seeds share it. */
  readonly direction: 1 | -1;
  /** Steady lean of the grass between gusts, 0 (still air) .. 1. */
  readonly strength: number;
  /** How many gusts cross the screen per minute, on average. */
  readonly gustsPerMinute: number;
  /** How hard a gust pushes the grass, 0..1 (1 bends the tallest blades fully). */
  readonly gustStrength: number;
  /** How fast a gust travels across the screen, in poster widths per second. */
  readonly gustSpeed: number;
  /** Length of a gust along the wind, in poster widths. */
  readonly gustWidth: number;
  /** How much calmer the calm spells are, 0 (none) .. 1 (gusts die away). */
  readonly calm: number;
  /** Seconds over which the wind drifts between calmer and gustier spells. */
  readonly calmPeriod: number;
  /** How far the grass swings back after a gust passes, 0..1. */
  readonly swingBack: number;
  /** Seconds per slow sway, and per quick flutter of the blades. */
  readonly swayPeriod: number;
  readonly flutterPeriod: number;
}

/** One depth plane of grass. */
export interface GrassPlaneConfig {
  /** How far this plane bends, relative to the others: nearer moves more. */
  readonly amplitude: number;
  /** Out-of-focus softness, in poster widths (0 is sharp). */
  readonly focus: number;
  /** Blade-to-blade variation: noise cells across a poster width. */
  readonly bladeScale: number;
  /** Separates this plane's variation from the others'. */
  readonly seed: number;
}

export interface GrassConfig {
  /** Where the roots are (poster y), which never move, and the height (poster heights) at which a blade bends fully. */
  readonly root: number;
  readonly height: number;
  /** Sideways bend of a fully bent blade in a full gust, as a poster width fraction. */
  readonly maxBend: number;
  /** Slow sway between gusts, and quick flutter that grows in gusts, 0..1. */
  readonly sway: number;
  readonly flutter: number;
  /** Faint brightening where a gust bends the grass, so its wave is visible. */
  readonly sheen: number;
  readonly sheenColor: string;
  readonly far: GrassPlaneConfig;
  readonly mid: GrassPlaneConfig;
  readonly near: GrassPlaneConfig;
  /** The small flowers move with the plane they grow in, and nod a little. */
  readonly flowers: {
    readonly follow: 'far' | 'mid' | 'near';
    /** Nod, in poster widths. */
    readonly bob: number;
  };
  /** Seeds and fluff carried along by the gusts, seen only while a gust passes. */
  readonly seeds: {
    readonly color: string;
    readonly opacity: number;
    /** Band they fly in, as poster y fractions. */
    readonly top: number;
    readonly bottom: number;
    /** Base drift and the extra speed a gust gives them, in poster widths per second. */
    readonly drift: number;
    readonly carry: number;
    readonly layers: readonly {
      /** Grid cell (poster widths) holding at most one seed, its radius and blur (poster widths). */
      readonly cell: number;
      readonly size: number;
      readonly softness: number;
      readonly density: number;
      /** Speed relative to the drift: nearer seeds pass faster. */
      readonly speed: number;
    }[];
  };
}

/** Slow distortion that makes cloud shapes evolve instead of only sliding. */
export interface CloudWarpConfig {
  /** Largest displacement, in 4K canvas pixels. */
  readonly amplitude: number;
  /** Size of the distortion's features, in 4K canvas pixels. */
  readonly scale: number;
  /** How fast the distortion itself changes, in noise units per second. */
  readonly evolve: number;
}

export interface CloudPlaneConfig {
  readonly opacity: number;
  /** Drift speed in 4K canvas pixels per second. */
  readonly speed: number;
  readonly warp: CloudWarpConfig;
}

export interface CloudLightConfig {
  /** Warm edge on clouds near the sun: strength and reach (poster widths). */
  readonly sunEdge: number;
  readonly sunReach: number;
  /** Faint cool tint on clouds near the beam: strength and reach (poster widths). */
  readonly beamTint: number;
  readonly beamReach: number;
}

export interface BeamSheet {
  /** Left and right edge, as poster x fractions. */
  readonly x0: number;
  readonly x1: number;
  /** Overall strength of this sheet, 0..1. */
  readonly brightness: number;
  /** Strength of the bright line along each edge, 0..1. */
  readonly edgeLeft: number;
  readonly edgeRight: number;
}

export interface BeamConfig {
  /** Where the light leaves the ship and where it meets the ground (poster y). */
  readonly top: number;
  readonly bottom: number;
  readonly sheets: readonly BeamSheet[];
  /** Glassy colour high up and saturated cyan near the ground. */
  readonly colorTop: string;
  readonly colorBottom: string;
  /** How strongly the sheets tint what is behind them, 0..1. */
  readonly tint: number;
  /** Additive light along the sheet edges. */
  readonly edgeGlow: number;
  /** Width of the edge highlight, as a poster x fraction. */
  readonly edgeWidth: number;
  /** Extra additive light near the ground. */
  readonly groundGlow: number;
  /** Softness of the sheet edges, as a poster x fraction. */
  readonly softness: number;
  /** Additive light inside the sheets, carried by the flow. */
  readonly bodyGlow: number;
  readonly flow: BeamFlowConfig;
  readonly pulses: BeamPulseConfig;
  readonly motes: BeamMotesConfig;
  /** Light scattered into the haze around the sheets, strongest low down. */
  readonly halo: {
    /** Falloff distance outside the sheets, as a poster x fraction. */
    readonly width: number;
    readonly strength: number;
  };
  /** Where the beam lands: a soft cyan glow on the ridges, haze and water. */
  readonly ground: {
    readonly x: number;
    readonly y: number;
    /** Half-width (poster widths) and half-height (poster heights). */
    readonly radiusX: number;
    readonly radiusY: number;
    readonly color: string;
    readonly intensity: number;
    /** How much each arriving pulse lifts the glow, 0..1. */
    readonly flicker: number;
  };
}

/** One layer of energy streaks scrolling down the beam. */
export interface BeamFlowLayer {
  /** Streak density across a poster width, and along the beam's length. */
  readonly scaleX: number;
  readonly scaleY: number;
  /** Beam lengths per second. */
  readonly speed: number;
  readonly weight: number;
}

export interface BeamFlowConfig {
  /** How strongly the streaks modulate the light, 0..1. Keep it calm. */
  readonly amount: number;
  readonly layers: readonly BeamFlowLayer[];
}

/** Brighter bands that travel from the emitter to the ground now and then. */
export interface BeamPulseConfig {
  /** Average seconds between pulses, and how irregular the gaps are (0..1). */
  readonly interval: number;
  readonly jitter: number;
  /** Seconds a pulse takes from the emitter to the ground. */
  readonly travel: number;
  /** Extra light at the pulse's head, 0..1, varied a little per pulse. */
  readonly strength: number;
  /** Length of the bright head, as a fraction of the beam length. */
  readonly width: number;
}

export interface BeamMoteLayer {
  /** Grid cell holding at most one mote, as a poster width fraction. */
  readonly cell: number;
  /** Mote radius, as a poster width fraction. */
  readonly size: number;
  /** Share of cells that hold a mote, 0..1. */
  readonly density: number;
  /** Drift in poster widths per second: x along the wind, y downward. */
  readonly drift: readonly [x: number, y: number];
}

export interface BeamMotesConfig {
  readonly color: string;
  readonly brightness: number;
  readonly layers: readonly BeamMoteLayer[];
}

/** Haze between two distance planes, drifting with the wind. */
export interface HazePlaneConfig {
  readonly opacity: number;
  /** Where the haze starts, is densest and ends, as poster y fractions. */
  readonly top: number;
  readonly peak: number;
  readonly bottom: number;
  /** Size of the drifting patches: noise cells per poster width. */
  readonly scale: number;
  /** Drift in poster widths per second. Nearer planes move faster. */
  readonly speed: number;
  /** How patchy the haze is, 0 (even) .. 1. */
  readonly variation: number;
}

export interface HazeConfig {
  readonly color: string;
  /** Warmer haze toward the sun, cooler where the beam lights it. */
  readonly sunColor: string;
  readonly sunReach: number;
  readonly beamColor: string;
  readonly beamReach: number;
  readonly far: HazePlaneConfig;
  readonly mid: HazePlaneConfig;
  readonly near: HazePlaneConfig;
}

/** The faint row of lights near a dome's base, found by brightness in its image. */
export interface DomeLightsConfig {
  /** Rows of the image holding the lights, as fractions of its height. */
  readonly bandTop: number;
  readonly bandBottom: number;
  /** Brightness range (0..1) that counts as a light. */
  readonly threshold: readonly [low: number, high: number];
}

export interface DomesConfig {
  readonly left: Placement;
  readonly right: Placement;
  readonly leftLights: DomeLightsConfig;
  readonly rightLights: DomeLightsConfig;
  readonly lights: {
    readonly color: string;
    readonly intensity: number;
    /** Two slow periods (seconds) whose product makes the twinkle irregular. */
    readonly periods: readonly [number, number];
    /** How deep the twinkle goes, 0..1. */
    readonly depth: number;
  };
}

export interface AircraftConfig {
  /** Where each aircraft is at the start, as in the reference, left to right. */
  readonly planes: readonly Placement[];
  readonly flight: {
    /** Climb angle in degrees above horizontal, toward the right. */
    readonly heading: number;
    /** Poster widths per second. */
    readonly speed: number;
    /** Path length before the reference point, and total path length (poster widths). */
    readonly enter: number;
    readonly length: number;
    /** Distance over which an aircraft emerges from the haze (poster widths). */
    readonly fadeIn: number;
    /** Seconds before the next pass, shortest and longest. */
    readonly pause: readonly [min: number, max: number];
    /** Per-pass variation: heading (degrees), sideways offset (poster widths), speed (fraction). */
    readonly vary: { readonly heading: number; readonly offset: number; readonly speed: number };
  };
  readonly trail: {
    /** Where the trail leaves the aircraft, as fractions of its image. */
    readonly anchor: readonly [x: number, y: number];
    readonly color: string;
    readonly opacity: number;
    /** Width at the aircraft, and how fast it spreads (poster widths, per second). */
    readonly width: number;
    readonly spread: number;
    /** Seconds for the trail to fade to about a third. */
    readonly fade: number;
  };
}

export interface WaterConfig {
  /** Sideways ripple of the water image, as a poster width fraction. */
  readonly ripple: number;
  /** Ripple drift in noise cells per second. */
  readonly rippleSpeed: number;
  /** Small moving glints on the bright parts of the water. */
  readonly shimmer: number;
  readonly shimmerSpeed: number;
  /** The beam's reflection: strength, and how far it reaches below the beam's foot (poster heights). */
  readonly reflection: number;
  readonly reflectionReach: number;
}

export interface WreckConfig {
  readonly placement: Placement;
  readonly smoke: {
    /** Where the smoke rises from, as poster fractions. */
    readonly source: readonly [x: number, y: number];
    /** Size of the plume, as poster width fractions. */
    readonly width: number;
    readonly height: number;
    readonly color: string;
    readonly opacity: number;
    /** Plume heights per second. */
    readonly rise: number;
    /** How far the wind bends the plume, 0..1. */
    readonly lean: number;
  };
}

export interface ShipConfig {
  readonly placement: Placement;
  /** The point the ship rolls around, as poster fractions (the V-notch). */
  readonly pivot: readonly [x: number, y: number];
  readonly hover: {
    /** Largest vertical drift, as a fraction of the poster height. */
    readonly amplitude: number;
    /** Two unrelated slow periods (seconds) so the drift never looks mechanical. */
    readonly periods: readonly [number, number];
    /** Largest roll, in degrees, and its period in seconds. */
    readonly roll: number;
    readonly rollPeriod: number;
  };
  readonly lights: {
    /** Brightness of the running lights (additive) and how deep they pulse, 0..1. */
    readonly intensity: number;
    readonly pulse: number;
    /** Seconds per pulse; each light is offset in phase. */
    readonly period: number;
    readonly color: string;
  };
  /** The soft glow under the centre where the beams begin. */
  readonly emitter: {
    readonly x: number;
    readonly y: number;
    /** Half-width and half-height of the glow, as poster width fractions. */
    readonly radiusX: number;
    readonly radiusY: number;
    readonly color: string;
    readonly intensity: number;
    /** Slow breathing of the glow, 0..1, and its period in seconds. */
    readonly breathe: number;
    readonly period: number;
  };
  /** The hull's faint shadow on the cloud beneath it. */
  readonly shadow: {
    /** Downward offset and blur, as fractions of the poster height. */
    readonly offset: number;
    readonly blur: number;
    readonly opacity: number;
  };
  /** Wisps drifting in front of the ship's outer edges only. */
  readonly veil: {
    readonly opacity: number;
    readonly speed: number;
    /** Distance from the pivot (poster widths) where the wisps start and reach full strength. */
    readonly edgeStart: number;
    readonly edgeFull: number;
    /** Lowest point of the wisps, as a poster y fraction. */
    readonly bottom: number;
    /** Vertical shift of the cloud tile used for the wisps, as a poster height fraction. */
    readonly tileShift: number;
  };
}

export interface SunGlowConfig {
  readonly x: number;
  readonly y: number;
  /** Radius as a fraction of the poster width. */
  readonly radius: number;
  readonly color: string;
  readonly intensity: number;
}

export interface LayersConfig {
  readonly clouds: {
    /** Where a tile's left edge sits on the shared canvas, in 4K canvas pixels. */
    readonly originX: number;
    /**
     * Cloud detail fades out over this distance past the poster's edges, in
     * 4K canvas pixels, matching the soft extension of the temporary art.
     * Set 0 once real cloud tiles with full-width detail are supplied.
     */
    readonly edgeFade: number;
    readonly light: CloudLightConfig;
    readonly far: CloudPlaneConfig;
    readonly mid: CloudPlaneConfig;
    readonly near: CloudPlaneConfig;
  };
  readonly sunGlow: SunGlowConfig;
  readonly ship: ShipConfig;
  readonly beams: BeamConfig;
  readonly haze: HazeConfig;
  readonly domes: DomesConfig;
  /** Both aircraft use aircraft.png. */
  readonly aircraft: AircraftConfig;
  readonly water: WaterConfig;
  readonly wreck: WreckConfig;
  readonly grass: GrassConfig;
}

/**
 * A line of text, positioned by the vertical centre of its capitals.
 * Letter spacing is not set directly: it is solved so that `sample`, set in
 * this font at this size, is exactly `width` wide, as measured on the
 * reference. That keeps the look when the font option changes.
 */
export interface TextLineConfig {
  /** Vertical centre of the capitals, as a poster y fraction. */
  readonly y: number;
  /** Height of the capitals, as a fraction of the poster height. */
  readonly capHeight: number;
  /** The wording measured on the reference. */
  readonly sample: string;
  /** Width of `sample` on the reference, as a poster x fraction. */
  readonly width: number;
}

export interface FontFace {
  readonly family: string;
  readonly weight: 400 | 700;
}

export interface DayGlyphConfig {
  /** Horizontal centre of each of D, A and Y, as poster x fractions. */
  readonly centers: readonly [d: number, a: number, y: number];
  /** Top and bottom of the capitals, as poster y fractions. */
  readonly top: number;
  readonly bottom: number;
}

export interface RuleConfig {
  readonly y: number;
  readonly x0: number;
  readonly x1: number;
  /** Line thickness as a fraction of the poster height. */
  readonly thickness: number;
}

export interface LightWrapConfig {
  /** 0 disables it. Keep it barely visible. */
  readonly strength: number;
  /** How far the light reaches around the letters, as a poster height fraction. */
  readonly radius: number;
}

export interface TextConfig {
  readonly color: string;
  /** Horizontal centre of the text block. The reference sits slightly left of 0.5. */
  readonly centerX: number;
  readonly displayFont: DisplayFont;
  readonly displayFonts: Readonly<Record<DisplayFont, FontFace>>;
  readonly taglineFont: FontFace;
  readonly clockFont: FontFace;
  readonly title: TextLineConfig;
  readonly rule: RuleConfig;
  readonly day: DayGlyphConfig;
  readonly tagline: TextLineConfig;
  readonly time: TextLineConfig;
  readonly date: TextLineConfig;
  /** Seconds a changing character takes to cross-fade. */
  readonly crossfadeSeconds: number;
  readonly lightWrap: LightWrapConfig;
}

export interface HubConfig {
  /**
   * Address of a hub running on a server, used for custom Python functions
   * where no local companion process exists (Android). Empty disables it.
   */
  readonly remoteUrl: string;
  /** Token for the remote hub. Leave empty for a hub without a token. */
  readonly remoteToken: string;
  /** How long to wait for the hub before treating it as unreachable. */
  readonly requestTimeoutMs: number;
  /** Declarative connections exported by `npm run hub:export`. */
  readonly exportedManifestUrl: string;
}

export interface OverlayConfig {
  /** Show the reference on top of the scene at start. Toggle with R. */
  readonly visible: boolean;
  readonly opacity: number;
}

export interface DebugConfig {
  readonly showFps: boolean;
  readonly showHubTest: boolean;
  /** The development panel: overlay, layout, font and time zone. Toggle with D. */
  readonly showDevPanel: boolean;
  /** How often the frame-rate readout refreshes, in seconds. */
  readonly fpsRefreshSeconds: number;
  readonly overlay: OverlayConfig;
}

export interface ToastConfig {
  readonly durationSeconds: number;
}

/** Depth response: layers shift with the mouse (Windows) or device tilt (Android). */
export interface ParallaxConfig {
  readonly enabled: boolean;
  /** Largest shift of the nearest layer (depth 1), as a poster width fraction. */
  readonly maxShift: number;
  /** Seconds for the motion to settle: the smoothing. */
  readonly smoothing: number;
  /** Device tilt (degrees) that gives the full shift, and how fast the rest position follows a held tilt (seconds). */
  readonly tiltRange: number;
  readonly tiltRecenter: number;
  /** Depth of each layer by id: 0 does not move, 1 moves the full shift. Layers not listed do not move. */
  readonly depths: Readonly<Record<string, number>>;
}

/** A tappable area, as poster fractions: left, top, right, bottom. */
export type HitArea = readonly [x0: number, y0: number, x1: number, y1: number];

export interface InterfaceConfig {
  /** Seconds without input before the interface fades out, and how long the fade takes. */
  readonly idleSeconds: number;
  readonly fadeSeconds: number;
  /** Hold time for a long press, and how long the pointer must rest on something to count as hover. */
  readonly longPressMs: number;
  readonly hoverMs: number;
  /** Movement (px) that turns a press into a drag instead of a tap. */
  readonly tapSlop: number;
  /**
   * Tappable scene objects and text, front to back. `layer` is the scene
   * layer the object belongs to, so a tap lands on it wherever the depth
   * response has shifted it. The aircraft are found where they fly.
   */
  readonly hitAreas: readonly { readonly id: ElementId; readonly layer: string; readonly area: HitArea }[];
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityLevelConfig {
  /** Render resolution: device pixels per CSS pixel, at most. */
  readonly pixelRatio: number;
  /** Which texture set to load: full size, or the smaller compressed sets. */
  readonly textures: 'full' | 'medium' | 'low';
  /** Share of dust motes and seeds drawn, 0..1. */
  readonly particles: number;
  /** Post-processing passes that run at this level. */
  readonly passes: readonly string[];
}

export interface QualityConfig {
  /** 'auto' measures the device on first launch and picks a level. */
  readonly initial: QualityLevel | 'auto';
  readonly levels: Readonly<Record<QualityLevel, QualityLevelConfig>>;
  /** The automatic choice: the highest level whose measured frame time stays under this budget (ms). */
  readonly budgetMs: number;
  /** Used under 'auto' until the measurement has run, and if it cannot run. */
  readonly fallback: QualityLevel;
  /** Frames rendered per level while measuring (after one warm-up frame). */
  readonly benchmarkFrames: number;
}

/** How lively the scene is. The settings panel's motion slider and the calm mode. */
export interface MotionConfig {
  /** Intensity at first launch, 0 (nearly still) .. 1 (as designed). */
  readonly default: number;
  /** Intensity of the calm mode, used while the system asks for reduced motion. */
  readonly calm: number;
  /** Scene speed (clock time scale) at intensity 0 and at 1. */
  readonly speed: readonly [min: number, max: number];
  /** How far the grass and seeds move, relative to the design, at intensity 0 and at 1. */
  readonly wind: readonly [min: number, max: number];
}

/** A soft wind ambience generated in code (no sound files), following the gusts. */
export interface SoundConfig {
  /** Off at first launch; the settings panel turns it on. */
  readonly enabled: boolean;
  readonly volume: number;
  /** Low rumble and higher rustle: filter frequencies (Hz) in calm air and in a full gust. */
  readonly rumble: readonly [calm: number, gust: number];
  readonly rustle: readonly [calm: number, gust: number];
  /** Seconds to fade in or out. */
  readonly fade: number;
}

/** A post-processing pass that can be switched off for comparison. */
export interface PostPass {
  readonly enabled: boolean;
  readonly strength: number;
}

export interface PostConfig {
  /** Master switch: off shows the scene exactly as the layers draw it. */
  readonly enabled: boolean;
  /** Bloom on bright sources only (beam, sun, ship lights): wide, soft, never blown out. */
  readonly bloom: PostPass & {
    /** Brightness (0..1) where bloom begins, and the softness of that start. */
    readonly threshold: number;
    readonly knee: number;
    /** How much the wider blur levels contribute, 0..1: higher is wider. */
    readonly spread: number;
    readonly tint: string;
  };
  /** Soft light shafts from the sun through the haze. */
  readonly shafts: PostPass & {
    /** Brightness range of the sky that casts shafts. */
    readonly threshold: readonly [low: number, high: number];
    readonly samples: number;
    /** Length of the shafts toward the sun (0..1) and how fast they fade along it. */
    readonly density: number;
    readonly decay: number;
    readonly color: string;
  };
  /** Warm key light from the low sun, cool fill from the beam. */
  readonly light: PostPass & {
    readonly keyColor: string;
    readonly key: number;
    /** Reach of the key light, in poster widths. */
    readonly keyReach: number;
    readonly fillColor: string;
    readonly fill: number;
    /** Reach of the fill sideways from the beam (poster widths), and where it starts (poster y). */
    readonly fillReach: number;
    readonly fillTop: number;
  };
  /** Filmic tone curve: a soft shoulder for added light and a rich toe. Strength blends it in. */
  readonly tone: PostPass & {
    readonly exposure: number;
    readonly contrast: number;
    readonly saturation: number;
  };
  /** Colour grade: warm cream highlights, teal-black shadows. */
  readonly grade: PostPass & {
    readonly shadows: string;
    readonly highlights: string;
  };
  /** Haze that deepens toward the horizon, over everything. */
  readonly atmosphere: PostPass & {
    readonly color: string;
    /** Densest row (poster y) and how far it spreads (poster heights). */
    readonly horizon: number;
    readonly spread: number;
  };
  /** Depth-of-field softness: the farthest sky and the very nearest grass, in poster widths. */
  readonly dof: PostPass & {
    readonly far: number;
    readonly near: number;
  };
  readonly grain: PostPass;
  readonly vignette: PostPass;
  /** Dithering against banding in the sky gradients; strength in 8-bit steps. */
  readonly dither: PostPass;
}

export interface AppConfig {
  readonly poster: PosterConfig;
  readonly stage: StageConfig;
  readonly clock: ClockConfig;
  readonly time: TimeConfig;
  readonly wind: WindConfig;
  readonly layers: LayersConfig;
  readonly text: TextConfig;
  readonly post: PostConfig;
  readonly parallax: ParallaxConfig;
  readonly ui: InterfaceConfig;
  readonly quality: QualityConfig;
  readonly motion: MotionConfig;
  readonly sound: SoundConfig;
  readonly hub: HubConfig;
  readonly toast: ToastConfig;
  readonly debug: DebugConfig;
}

export const config: AppConfig = {
  poster: {
    width: 455,
    height: 674,
  },
  stage: {
    background: '#0b0f0d',
    layout: 'extend',
    maxPixelRatio: 2,
  },
  clock: {
    timeScale: 1,
    maxDeltaSeconds: 0.1,
  },
  time: {
    timeZone: '',
    hour12: true,
    showSeconds: false,
    locale: 'en-GB',
  },
  wind: {
    direction: 1,
    strength: 0.18,
    gustsPerMinute: 7,
    gustStrength: 0.75,
    gustSpeed: 0.2,
    gustWidth: 0.35,
    calm: 0.65,
    calmPeriod: 40,
    swingBack: 0.3,
    swayPeriod: 6.5,
    flutterPeriod: 1.3,
  },
  layers: {
    clouds: {
      originX: 896,
      edgeFade: 900,
      light: { sunEdge: 0.5, sunReach: 0.55, beamTint: 0.22, beamReach: 0.22 },
      // Loop lengths are tile width / speed: about 40, 23.5 and 14 minutes.
      // They are not multiples of each other, so the sky never visibly repeats.
      far: { opacity: 1, speed: 1.7, warp: { amplitude: 26, scale: 1100, evolve: 0.0035 } },
      mid: { opacity: 1, speed: 2.9, warp: { amplitude: 20, scale: 780, evolve: 0.005 } },
      near: { opacity: 1, speed: 4.9, warp: { amplitude: 14, scale: 520, evolve: 0.007 } },
    },
    sunGlow: {
      x: 0.98,
      y: 0.6,
      radius: 0.42,
      color: '#ffd8a6',
      intensity: 0.22,
    },
    ship: {
      // The wings continue a quarter of the poster width past each edge, so a
      // wide window shows them fading into the haze instead of being cut off.
      placement: { x: -0.25, y: 0, width: 1.5 },
      pivot: [0.52, 0.09],
      hover: { amplitude: 0.0028, periods: [23, 37], roll: 0.06, rollPeriod: 31 },
      lights: { intensity: 0.85, pulse: 0.6, period: 4.6, color: '#fff3e0' },
      emitter: {
        x: 0.5,
        y: 0.1,
        radiusX: 0.17,
        radiusY: 0.028,
        color: '#dcf6ff',
        intensity: 0.45,
        breathe: 0.18,
        period: 7.5,
      },
      shadow: { offset: 0.03, blur: 0.012, opacity: 0.2 },
      veil: { opacity: 0.5, speed: 4.9, edgeStart: 0.26, edgeFull: 0.44, bottom: 0.21, tileShift: -0.26 },
    },
    beams: {
      top: 0.092,
      bottom: 0.85,
      sheets: [
        { x0: 0.343, x1: 0.416, brightness: 1, edgeLeft: 1, edgeRight: 0.5 },
        { x0: 0.416, x1: 0.574, brightness: 0.75, edgeLeft: 0.35, edgeRight: 0.95 },
        { x0: 0.574, x1: 0.655, brightness: 1, edgeLeft: 0.3, edgeRight: 1 },
      ],
      colorTop: '#c2ebfa',
      colorBottom: '#7ad8f0',
      tint: 0.36,
      edgeGlow: 0.24,
      edgeWidth: 0.012,
      groundGlow: 0.16,
      softness: 0.0016,
      bodyGlow: 0.1,
      // Speeds differ and are not multiples, so the streaks never line up the same way.
      flow: {
        amount: 0.55,
        layers: [
          { scaleX: 55, scaleY: 2.2, speed: 0.07, weight: 1 },
          { scaleX: 130, scaleY: 5, speed: 0.115, weight: 0.6 },
          { scaleX: 280, scaleY: 11, speed: 0.19, weight: 0.35 },
        ],
      },
      pulses: { interval: 9, jitter: 0.5, travel: 6.5, strength: 0.32, width: 0.07 },
      motes: {
        color: '#eefbff',
        brightness: 0.55,
        layers: [
          { cell: 0.03, size: 0.0014, density: 0.45, drift: [0.003, 0.009] },
          { cell: 0.05, size: 0.002, density: 0.3, drift: [0.0018, 0.005] },
        ],
      },
      halo: { width: 0.035, strength: 0.07 },
      ground: {
        x: 0.5,
        y: 0.85,
        radiusX: 0.3,
        radiusY: 0.06,
        color: '#8fe0f2',
        intensity: 0.16,
        flicker: 0.35,
      },
    },
    // Each plane is paler than the one in front, so depth reads from grass to domes.
    haze: {
      color: '#e6dccd',
      sunColor: '#f2d3ab',
      sunReach: 0.45,
      beamColor: '#c4e8f2',
      beamReach: 0.2,
      far: { opacity: 0.3, top: 0.5, peak: 0.7, bottom: 0.84, scale: 2.5, speed: 0.0012, variation: 0.55 },
      mid: { opacity: 0.2, top: 0.6, peak: 0.77, bottom: 0.88, scale: 3.5, speed: 0.002, variation: 0.6 },
      near: { opacity: 0.1, top: 0.7, peak: 0.82, bottom: 0.9, scale: 5, speed: 0.0032, variation: 0.65 },
    },
    domes: {
      // The left dome runs off the poster's left edge; the image holds all of it.
      left: { x: -0.0858, y: 0.552, width: 0.3099 },
      right: { x: 0.822, y: 0.579, width: 0.171 },
      leftLights: { bandTop: 0.905, bandBottom: 0.975, threshold: [0.82, 0.95] },
      rightLights: { bandTop: 0.8, bandBottom: 0.96, threshold: [0.9, 0.99] },
      lights: { color: '#fff4e2', intensity: 0.32, periods: [5.3, 8.9], depth: 0.75 },
    },
    aircraft: {
      planes: [
        { x: 0.743, y: 0.457, width: 0.092 },
        { x: 0.866, y: 0.433, width: 0.097 },
      ],
      flight: {
        heading: 20,
        speed: 0.009,
        enter: 0.12,
        length: 2.3,
        fadeIn: 0.06,
        pause: [25, 60],
        vary: { heading: 3, offset: 0.025, speed: 0.12 },
      },
      trail: {
        anchor: [0.3, 0.62],
        color: '#fbf8f2',
        opacity: 0.5,
        width: 0.0018,
        spread: 0.00006,
        fade: 9,
      },
    },
    water: {
      ripple: 0.0016,
      rippleSpeed: 0.35,
      shimmer: 0.35,
      shimmerSpeed: 0.6,
      reflection: 0.75,
      reflectionReach: 0.08,
    },
    wreck: {
      placement: { x: 0, y: 0.77, width: 0.16 },
      smoke: {
        source: [0.085, 0.8],
        width: 0.07,
        height: 0.14,
        color: '#cdc6bb',
        opacity: 0.32,
        rise: 0.05,
        lean: 0.35,
      },
    },
    // Roots at the bottom edge; the tallest grass reaches about 0.16 above it.
    grass: {
      root: 1.0,
      height: 0.14,
      maxBend: 0.016,
      sway: 0.12,
      flutter: 0.1,
      sheen: 0.07,
      sheenColor: '#cfc9b8',
      far: { amplitude: 0.55, focus: 0, bladeScale: 140, seed: 1.7 },
      mid: { amplitude: 0.8, focus: 0, bladeScale: 110, seed: 5.3 },
      near: { amplitude: 1, focus: 0.0012, bladeScale: 80, seed: 9.1 },
      flowers: { follow: 'near', bob: 0.0012 },
      seeds: {
        color: '#f6efe2',
        opacity: 0.75,
        top: 0.7,
        bottom: 0.99,
        drift: 0.012,
        carry: 0.16,
        layers: [
          { cell: 0.05, size: 0.0012, softness: 0, density: 0.35, speed: 0.8 },
          { cell: 0.11, size: 0.0028, softness: 0.0025, density: 0.25, speed: 1.25 },
        ],
      },
    },
  },
  text: {
    color: '#090807',
    centerX: 0.489,
    displayFont: 'bodoni',
    displayFonts: {
      bodoni: { family: 'Bodoni Moda Variable', weight: 400 },
      italiana: { family: 'Italiana', weight: 400 },
      playfair: { family: 'Playfair Display', weight: 400 },
    },
    taglineFont: { family: 'Cinzel', weight: 400 },
    clockFont: { family: 'Cinzel', weight: 700 },
    // Fixed wording: THE, DAY and FOR DEV BY DEV never change.
    title: { sample: 'THE', y: 0.207, capHeight: 0.0267, width: 0.1055 },
    rule: { y: 0.2337, x0: 0.2505, x1: 0.7429, thickness: 0.0018 },
    day: { centers: [0.3681, 0.4967, 0.6143], top: 0.2329, bottom: 0.3234 },
    tagline: { sample: 'FOR DEV BY DEV', y: 0.3457, capHeight: 0.0104, width: 0.3385 },
    // Live lines: spacing is taken from the reference's placeholder words.
    time: { sample: 'TIME', y: 0.3746, capHeight: 0.0062, width: 0.0352 },
    date: { sample: 'DATE AND DAY', y: 0.391, capHeight: 0.0119, width: 0.2615 },
    crossfadeSeconds: 0.6,
    lightWrap: { strength: 0.32, radius: 0.0045 },
  },
  post: {
    enabled: true,
    bloom: { enabled: true, strength: 0.45, threshold: 0.9, knee: 0.1, spread: 0.7, tint: '#fffbf5' },
    shafts: {
      enabled: true,
      strength: 0.5,
      threshold: [0.87, 0.99],
      samples: 48,
      density: 0.85,
      decay: 0.968,
      color: '#ffe3bd',
    },
    light: {
      enabled: true,
      strength: 1,
      keyColor: '#ffcf96',
      key: 0.2,
      keyReach: 0.55,
      fillColor: '#93dff0',
      fill: 0.1,
      fillReach: 0.22,
      fillTop: 0.45,
    },
    tone: { enabled: true, strength: 1, exposure: 1, contrast: 0.1, saturation: 1.04 },
    grade: { enabled: true, strength: 0.55, shadows: '#1f6266', highlights: '#ffe4bf' },
    atmosphere: { enabled: true, strength: 0.08, color: '#eadfce', horizon: 0.74, spread: 0.1 },
    dof: { enabled: true, strength: 1, far: 0.0016, near: 0.002 },
    grain: { enabled: true, strength: 0.03 },
    vignette: { enabled: true, strength: 0.13 },
    dither: { enabled: true, strength: 1 },
  },
  parallax: {
    enabled: true,
    maxShift: 0.014,
    smoothing: 0.6,
    tiltRange: 18,
    tiltRecenter: 6,
    // Far layers move least, near layers most.
    depths: {
      sky: 0.04,
      'clouds-far': 0.08,
      'clouds-mid': 0.13,
      'ship-shadow': 0.16,
      'sun-glow': 0.04,
      domes: 0.25,
      'haze-far': 0.27,
      'mountains-far': 0.3,
      'haze-mid': 0.34,
      beams: 0.36,
      ship: 0.18,
      'clouds-near': 0.22,
      aircraft: 0.28,
      'mountains-mid': 0.45,
      'haze-near': 0.5,
      'mountains-near': 0.58,
      wreck: 0.62,
      water: 0.66,
      'beam-ground': 0.66,
      grass: 1,
      seeds: 1.1,
      text: 0.4,
    },
  },
  ui: {
    idleSeconds: 5,
    fadeSeconds: 1.2,
    longPressMs: 550,
    hoverMs: 350,
    tapSlop: 10,
    hitAreas: [
      { id: 'text.time', layer: 'text', area: [0.38, 0.362, 0.62, 0.383] },
      { id: 'text.date', layer: 'text', area: [0.24, 0.383, 0.76, 0.405] },
      { id: 'text.title', layer: 'text', area: [0.22, 0.185, 0.78, 0.36] },
      { id: 'scene.grass', layer: 'grass', area: [0, 0.885, 1, 1] },
      { id: 'scene.wreck', layer: 'wreck', area: [0, 0.77, 0.16, 0.865] },
      { id: 'scene.ship', layer: 'ship', area: [0, 0, 1, 0.185] },
      { id: 'scene.dome_left', layer: 'domes', area: [0, 0.55, 0.22, 0.75] },
      { id: 'scene.dome_right', layer: 'domes', area: [0.82, 0.58, 0.99, 0.71] },
      { id: 'scene.beam', layer: 'beams', area: [0.34, 0.185, 0.66, 0.86] },
    ],
  },
  quality: {
    initial: 'auto',
    budgetMs: 11,
    fallback: 'high',
    benchmarkFrames: 12,
    levels: {
      low: { pixelRatio: 0.75, textures: 'low', particles: 0.35, passes: ['tone', 'grade', 'vignette', 'dither'] },
      medium: {
        pixelRatio: 1,
        textures: 'medium',
        particles: 0.65,
        passes: ['bloom', 'light', 'tone', 'grade', 'atmosphere', 'vignette', 'dither'],
      },
      high: {
        pixelRatio: 1.5,
        textures: 'full',
        particles: 1,
        passes: ['bloom', 'shafts', 'light', 'tone', 'grade', 'atmosphere', 'grain', 'vignette', 'dither'],
      },
      ultra: {
        pixelRatio: 2,
        textures: 'full',
        particles: 1,
        passes: ['bloom', 'shafts', 'light', 'tone', 'grade', 'atmosphere', 'dof', 'grain', 'vignette', 'dither'],
      },
    },
  },
  motion: {
    default: 1,
    calm: 0.12,
    speed: [0.08, 1],
    wind: [0.1, 1],
  },
  sound: {
    enabled: false,
    volume: 0.35,
    rumble: [260, 520],
    rustle: [1400, 3200],
    fade: 1.5,
  },
  hub: {
    remoteUrl: '',
    remoteToken: '',
    requestTimeoutMs: 1500,
    exportedManifestUrl: 'hub.json',
  },
  toast: {
    durationSeconds: 3.5,
  },
  // Development tools appear only under `npm run dev`, never in a built app.
  debug: {
    showFps: import.meta.env.DEV,
    showHubTest: import.meta.env.DEV,
    showDevPanel: import.meta.env.DEV,
    fpsRefreshSeconds: 0.25,
    overlay: { visible: false, opacity: 0.5 },
  },
};
