import { Container, UniformGroup, type Mesh, type MeshGeometry, type Shader } from 'pixi.js';
import type { ClockFrame } from '../../core/clock';
import { config } from '../../config/config';
import { MAX_BEAM_PULSES, beamPulses } from '../beamPulses';
import { GLSL_NOISE, GLSL_PERIODIC_NOISE, loopOffset } from '../gl/noise';
import { createQuad, hexToRgb } from '../gl/quad';
import type { SceneTuning } from '../tuning';
import type { PosterViewport, SceneLayer } from '../types';

export const MAX_BEAM_SHEETS = 3;

/**
 * GLSL that evaluates the beam sheets at a screen x. Shared with the text
 * light wrap and the water reflection, so they catch light exactly where the
 * beam is.
 */
export const BEAM_SHEETS_GLSL = /* glsl */ `
#define MAX_SHEETS ${MAX_BEAM_SHEETS}
uniform vec4 uSheets[MAX_SHEETS];  // x0, x1 (screen px), brightness, left edge
uniform vec4 uSheetsB[MAX_SHEETS]; // right edge, -, -, -
uniform vec4 uSheetShape;          // count, softness px, edge width px, -

// Total coverage and edge light of all sheets at screen x.
vec2 beamSheets(float x) {
  float cover = 0.0;
  float edge = 0.0;
  for (int i = 0; i < MAX_SHEETS; i++) {
    if (float(i) >= uSheetShape.x) break;
    vec4 s = uSheets[i];
    float soft = uSheetShape.y;
    float inside = smoothstep(s.x - soft, s.x + soft, x) * (1.0 - smoothstep(s.y - soft, s.y + soft, x));
    float fromLeft = max(x - s.x, 0.0) / uSheetShape.z;
    float fromRight = max(s.y - x, 0.0) / uSheetShape.z;
    edge += inside * s.z * (s.w * exp(-fromLeft) + uSheetsB[i].x * exp(-fromRight));
    cover += inside * s.z;
  }
  return vec2(cover, edge);
}
`;

const FLOW_LAYERS = 3;
const MOTE_LAYERS = 2;
/** Flow and mote patterns repeat after this many cells; offsets are folded into it. */
const FLOW_PERIOD = 16;
const MOTE_PERIOD = 64;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_PERIODIC_NOISE}
${BEAM_SHEETS_GLSL}
#define FLOW_LAYERS ${FLOW_LAYERS}
#define MOTE_LAYERS ${MOTE_LAYERS}
#define FLOW_PERIOD ${FLOW_PERIOD}.0
#define MOTE_PERIOD ${MOTE_PERIOD}.0
uniform vec2 uSpan;              // top and bottom of the light (screen px)
uniform vec4 uPoster;            // poster x, y, width, height (screen px)
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec4 uAmounts;           // tint, edge glow, ground glow, flow amount
uniform vec4 uFlow[FLOW_LAYERS]; // scale x, scale y, offset (cells), weight
uniform vec4 uPulseHead;         // head of each pulse along the beam, 0..1
uniform vec4 uPulseStrength;
uniform vec4 uPulseShape;        // head length, ground pulse, ground flicker, body glow
uniform vec4 uBundle;            // left and right of all sheets (px), halo width (px), halo strength
uniform vec4 uMoteA[MOTE_LAYERS];// cell (px), radius (cells), density, -
uniform vec4 uMoteB[MOTE_LAYERS];// offset x, offset y (cells), -, -
uniform vec4 uMoteColor;         // colour, brightness

// Streaks of energy pouring down: each layer scrolls at its own speed.
float flowEnergy(float px, float v) {
  float sum = 0.0;
  for (int i = 0; i < FLOW_LAYERS; i++) {
    vec4 f = uFlow[i];
    vec2 p = vec2(px * f.x, v * f.y - f.z);
    sum += f.w * periodicNoise(p, vec2(4096.0, FLOW_PERIOD));
  }
  return clamp(1.0 + uAmounts.w * 2.0 * sum, 0.35, 1.8);
}

// Brighter bands travelling from the emitter to the ground, with a soft tail.
float pulseLight(float v) {
  float sum = 0.0;
  float w = uPulseShape.x;
  for (int i = 0; i < 4; i++) {
    float d = v - uPulseHead[i];
    float head = exp(-d * d / (w * w));
    float tail = d < 0.0 ? 0.4 * exp(d / (w * 3.0)) : 0.0;
    sum += uPulseStrength[i] * max(head, tail);
  }
  return sum;
}

// Dust motes drifting through the light, at most one per cell.
float motes(vec2 screen) {
  float sum = 0.0;
  for (int i = 0; i < MOTE_LAYERS; i++) {
    vec4 a = uMoteA[i];
    vec2 q = (screen - uPoster.xy) / a.x - uMoteB[i].xy;
    vec2 id = mod(floor(q), MOTE_PERIOD);
    vec2 h = hash22(id) * 0.5 + 0.5;
    vec2 g = hash22(id + 31.0) * 0.5 + 0.5;
    if (g.x > a.z) continue;
    vec2 centre = 0.2 + 0.6 * h;
    float d = length(fract(q) - centre) / a.y;
    // Catches the light as it turns: the glint depends on where the mote is,
    // with a frequency that divides the pattern period so it never jumps.
    float glint = 0.55 + 0.45 * sin(q.y * 6.2831853 * 4.0 / MOTE_PERIOD + g.y * 6.2831853);
    sum += exp(-d * d * 1.5) * glint * (0.45 + 0.55 * g.y);
  }
  return sum;
}

void main() {
  float v = clamp((vScreen.y - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);
  // Emerges from under the hull, ends softly at the ground.
  float fade = smoothstep(0.0, 0.025, v) * (1.0 - smoothstep(0.96, 1.0, v));
  vec2 sheets = beamSheets(vScreen.x);
  float cover = clamp(sheets.x, 0.0, 1.0);
  float px = (vScreen.x - uPoster.x) / uPoster.z;
  float energy = flowEnergy(px, v);
  float pulse = pulseLight(v) * (0.7 + 0.3 * energy);

  // Almost glassy high up, denser and bluer near the ground.
  float density = mix(0.7, 1.5, v * v);
  vec3 colour = mix(uColorTop, uColorBottom, pow(v, 1.6));
  float alpha = clamp(sheets.x * uAmounts.x * density * (0.88 + 0.12 * energy), 0.0, 1.0) * fade;

  float ground = 1.0 + uPulseShape.z * uPulseShape.y;
  float edge = sheets.y * uAmounts.y * (0.75 + 0.25 * energy);
  float body = sheets.x * uPulseShape.w * mix(0.35, 1.0, v) * energy;
  float foot = sheets.x * uAmounts.z * v * v * v * (0.85 + 0.15 * energy) * ground;
  float surge = pulse * (sheets.x + 0.6 * sheets.y);

  // Scattered light around the sheets, strongest where the haze is dense.
  float outside = max(max(uBundle.x - vScreen.x, vScreen.x - uBundle.y), 0.0);
  float glow = exp(-outside / uBundle.z) * mix(0.25, 1.0, v * v);
  float halo = uBundle.w * glow * (0.9 + 0.1 * energy + pulse);

  float dust = motes(vScreen) * uMoteColor.a * (cover + 0.25 * glow) * mix(0.5, 1.0, v);

  vec3 light = colour * (edge + body + foot + surge + halo) + uMoteColor.rgb * dust;
  // Premultiplied: 'alpha' tints what is behind, 'light' adds to it.
  finalColor = vec4(colour * alpha + light * fade, alpha) * uColor.a;
}
`;

export type BeamSheetUniforms = UniformGroup<{
  uSheets: { value: Float32Array; type: 'vec4<f32>'; size: number };
  uSheetsB: { value: Float32Array; type: 'vec4<f32>'; size: number };
  uSheetShape: { value: Float32Array; type: 'vec4<f32>' };
}>;

export function createBeamSheetUniforms(): BeamSheetUniforms {
  return new UniformGroup({
    uSheets: { value: new Float32Array(4 * MAX_BEAM_SHEETS), type: 'vec4<f32>', size: MAX_BEAM_SHEETS },
    uSheetsB: { value: new Float32Array(4 * MAX_BEAM_SHEETS), type: 'vec4<f32>', size: MAX_BEAM_SHEETS },
    uSheetShape: { value: new Float32Array(4), type: 'vec4<f32>' },
  });
}

/** Write the configured sheets, in screen pixels, into a uniform group. */
export function placeBeamSheets(group: BeamSheetUniforms, viewport: PosterViewport): void {
  const { sheets, softness, edgeWidth } = config.layers.beams;
  const a = group.uniforms.uSheets;
  const b = group.uniforms.uSheetsB;
  sheets.slice(0, MAX_BEAM_SHEETS).forEach((sheet, i) => {
    a.set(
      [viewport.x + sheet.x0 * viewport.width, viewport.x + sheet.x1 * viewport.width, sheet.brightness, sheet.edgeLeft],
      i * 4,
    );
    b.set([sheet.edgeRight, 0, 0, 0], i * 4);
  });
  group.uniforms.uSheetShape.set([
    Math.min(sheets.length, MAX_BEAM_SHEETS),
    Math.max(softness * viewport.width, 0.5),
    Math.max(edgeWidth * viewport.width, 0.5),
    0,
  ]);
  group.update();
}

/**
 * Layer 6: the light beams, the centrepiece. A shader pours energy down the
 * sheets without ever stopping: streaks of noise scrolling at three speeds,
 * brighter pulses that travel from the emitter to the ground now and then,
 * dust motes drifting through the light and a soft halo in the haze. All of
 * it is additive light over a gentle tint, so the brightest parts can feed
 * the bloom pass. Every scrolling offset is folded into its pattern's
 * period, so the beam loops forever with no restart.
 */
export class BeamLayer implements SceneLayer {
  readonly id = 'beams';
  readonly view = new Container();
  private quad: Mesh<MeshGeometry, Shader> | null = null;
  private readonly sheets = createBeamSheetUniforms();
  private readonly uniforms = new UniformGroup({
    uSpan: { value: new Float32Array(2), type: 'vec2<f32>' },
    uPoster: { value: new Float32Array(4), type: 'vec4<f32>' },
    uColorTop: { value: new Float32Array(hexToRgb(config.layers.beams.colorTop)), type: 'vec3<f32>' },
    uColorBottom: { value: new Float32Array(hexToRgb(config.layers.beams.colorBottom)), type: 'vec3<f32>' },
    uAmounts: {
      value: new Float32Array([
        config.layers.beams.tint,
        config.layers.beams.edgeGlow,
        config.layers.beams.groundGlow,
        config.layers.beams.flow.amount,
      ]),
      type: 'vec4<f32>',
    },
    uFlow: { value: new Float32Array(4 * FLOW_LAYERS), type: 'vec4<f32>', size: FLOW_LAYERS },
    uPulseHead: { value: new Float32Array(MAX_BEAM_PULSES), type: 'vec4<f32>' },
    uPulseStrength: { value: new Float32Array(MAX_BEAM_PULSES), type: 'vec4<f32>' },
    uPulseShape: {
      value: new Float32Array([
        config.layers.beams.pulses.width,
        0,
        config.layers.beams.ground.flicker,
        config.layers.beams.bodyGlow,
      ]),
      type: 'vec4<f32>',
    },
    uBundle: { value: new Float32Array(4), type: 'vec4<f32>' },
    uMoteA: { value: new Float32Array(4 * MOTE_LAYERS), type: 'vec4<f32>', size: MOTE_LAYERS },
    uMoteB: { value: new Float32Array(4 * MOTE_LAYERS), type: 'vec4<f32>', size: MOTE_LAYERS },
    uMoteColor: {
      value: new Float32Array([...hexToRgb(config.layers.beams.motes.color), config.layers.beams.motes.brightness]),
      type: 'vec4<f32>',
    },
  });

  constructor(private readonly tuning: SceneTuning) {}

  async load(): Promise<void> {
    this.quad = createQuad('beams', FRAGMENT, { sheetUniforms: this.sheets, beamUniforms: this.uniforms });
    this.view.addChild(this.quad);
  }

  resize(viewport: PosterViewport): void {
    if (this.quad === null) return;
    const { sheets, top, bottom, edgeWidth, halo, motes, flow } = config.layers.beams;
    const left = Math.min(...sheets.map((s) => s.x0));
    const right = Math.max(...sheets.map((s) => s.x1));
    // The quad reaches far enough past the sheets for the halo to fade out.
    const margin = edgeWidth + halo.width * 5;
    const y0 = viewport.y + top * viewport.height;
    const y1 = viewport.y + bottom * viewport.height;
    this.quad.position.set(viewport.x + (left - margin) * viewport.width, y0);
    this.quad.scale.set((right - left + margin * 2) * viewport.width, y1 - y0);
    const u = this.uniforms.uniforms;
    u.uSpan.set([y0, y1]);
    u.uPoster.set([viewport.x, viewport.y, viewport.width, viewport.height]);
    u.uBundle.set([
      viewport.x + left * viewport.width,
      viewport.x + right * viewport.width,
      Math.max(halo.width * viewport.width, 1),
      halo.strength,
    ]);
    flow.layers.slice(0, FLOW_LAYERS).forEach((layer, i) => {
      u.uFlow.set([layer.scaleX, layer.scaleY, 0, layer.weight], i * 4);
    });
    motes.layers.slice(0, MOTE_LAYERS).forEach((layer, i) => {
      const cell = Math.max(layer.cell * viewport.width, 4);
      // Never smaller than about a pixel, so motes do not sparkle on small windows.
      const radius = Math.max(layer.size * viewport.width, 0.7) / cell;
      u.uMoteA.set([cell, radius, layer.density * this.tuning.particles, 0], i * 4);
    });
    this.uniforms.update();
    placeBeamSheets(this.sheets, viewport);
  }

  update(frame: ClockFrame): void {
    const { flow, motes } = config.layers.beams;
    const u = this.uniforms.uniforms;
    flow.layers.slice(0, FLOW_LAYERS).forEach((layer, i) => {
      u.uFlow[i * 4 + 2] = loopOffset(frame.time, layer.speed * layer.scaleY, FLOW_PERIOD);
    });
    motes.layers.slice(0, MOTE_LAYERS).forEach((layer, i) => {
      const cellsPerWidth = 1 / layer.cell;
      u.uMoteB[i * 4] = loopOffset(frame.time, layer.drift[0] * config.wind.direction * cellsPerWidth, MOTE_PERIOD);
      u.uMoteB[i * 4 + 1] = loopOffset(frame.time, layer.drift[1] * cellsPerWidth, MOTE_PERIOD);
    });
    const pulses = beamPulses(frame.time);
    u.uPulseHead.set(pulses.heads);
    u.uPulseStrength.set(pulses.strengths);
    u.uPulseShape[1] = pulses.ground;
    this.uniforms.update();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
