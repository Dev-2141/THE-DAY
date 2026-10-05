import { Container, UniformGroup } from 'pixi.js';
import { loadTexture, releaseTexture } from '../../assets/loader';
import type { ClockFrame } from '../../core/clock';
import { config } from '../../config/config';
import { beamPulses } from '../beamPulses';
import { GLSL_NOISE, GLSL_PERIODIC_NOISE, loopOffset } from '../gl/noise';
import { CanvasPlane } from '../gl/planes';
import { hexToRgb } from '../gl/quad';
import type { PosterViewport, SceneLayer } from '../types';
import { canvasRect, overscan } from '../viewport';
import { BEAM_SHEETS_GLSL, createBeamSheetUniforms, placeBeamSheets } from './BeamLayer';

/** Ripple and glint patterns repeat after this many cells; their drift is folded into it. */
const WATER_PERIOD = 128;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_PERIODIC_NOISE}
${BEAM_SHEETS_GLSL}
uniform vec4 uPoster;     // poster x, y, width, height (screen px)
uniform vec4 uWater;      // ripple (px), shimmer, reflection, reflection reach (poster heights)
uniform vec4 uDrift;      // ripple offset, glint offset (cells), beam foot (poster y), ground pulse
uniform vec4 uReflect;    // beam colour, ground flicker

void main() {
  vec2 p = (vScreen - uPoster.xy) / uPoster.zw;
  vec2 period = vec2(${WATER_PERIOD}.0, 4096.0);
  // Thin horizontal bands sliding sideways: the water's slow ripple.
  float ripple = periodicNoise(vec2(p.x * 24.0 + uDrift.x, p.y * 700.0), period);
  // Only open water ripples; the ground around it stays still.
  vec4 still = sampleCanvas(vScreen);
  float open = still.a > 0.002 ? smoothstep(0.42, 0.6, dot(still.rgb / still.a, vec3(0.299, 0.587, 0.114))) : 0.0;
  vec2 offset = vec2(ripple * uWater.x * open, 0.0);
  vec4 src = open > 0.0 ? sampleCanvas(vScreen + offset) : still;
  if (src.a <= 0.002) {
    finalColor = vec4(0.0);
    return;
  }
  vec3 rgb = src.rgb / src.a;
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));

  // Small glints moving across the brighter parts of the water.
  float g = periodicNoise(vec2(p.x * 140.0 - uDrift.y, p.y * 1500.0), period);
  float glint = smoothstep(0.22, 0.42, g) * smoothstep(0.35, 0.8, lum) * open * uWater.y;

  // The beam's reflection: a soft, broken column below the beam's foot,
  // wobbling with the ripples and answering the pulses as the ground does.
  // Soft-sided: the column is the sheets' coverage averaged across a little width.
  float wobble = vScreen.x + ripple * uWater.x * 4.0;
  float spread = uPoster.z * 0.012;
  float sheet = 0.0;
  for (int i = -2; i <= 2; i++) {
    sheet += clamp(beamSheets(wobble + float(i) * spread).x, 0.0, 1.0) * 0.2;
  }
  float below = max(p.y - uDrift.z, 0.0);
  float broken = 0.65 + 0.7 * periodicNoise(vec2(p.x * 60.0 + uDrift.x * 1.7, p.y * 1100.0), period);
  float reflection = sheet * open * exp(-below / uWater.w) * broken * uWater.z * (1.0 + uReflect.a * uDrift.w);

  vec3 light = vec3(1.0, 0.97, 0.92) * glint + uReflect.rgb * reflection;
  finalColor = vec4(src.rgb + light * src.a, src.a) * uColor.a;
}
`;

/**
 * Layer 11: the thin strips of marsh water, and the ground behind the grass.
 * A slow sideways ripple on the open water, small
 * glints drifting across the bright water, and a soft reflection of the
 * beam that wobbles with the ripples and brightens with each pulse.
 */
export class WaterLayer implements SceneLayer {
  readonly id = 'water';
  readonly view = new Container();
  private plane: CanvasPlane | null = null;
  private readonly sheets = createBeamSheetUniforms();
  private readonly uniforms = new UniformGroup({
    uPoster: { value: new Float32Array(4), type: 'vec4<f32>' },
    uWater: {
      value: new Float32Array([
        0,
        config.layers.water.shimmer,
        config.layers.water.reflection,
        config.layers.water.reflectionReach,
      ]),
      type: 'vec4<f32>',
    },
    uDrift: { value: new Float32Array([0, 0, config.layers.beams.bottom, 0]), type: 'vec4<f32>' },
    uReflect: {
      value: new Float32Array([...hexToRgb(config.layers.beams.colorBottom), config.layers.beams.ground.flicker]),
      type: 'vec4<f32>',
    },
  });

  async load(): Promise<void> {
    this.plane = new CanvasPlane(await loadTexture('water'), {
      name: 'water',
      fragment: FRAGMENT,
      resources: { sheetUniforms: this.sheets, waterUniforms: this.uniforms },
    });
    this.view.addChild(this.plane.view);
  }

  resize(viewport: PosterViewport): void {
    this.plane?.place(canvasRect(viewport), viewport.screenWidth, viewport.screenHeight, overscan(viewport));
    const u = this.uniforms.uniforms;
    u.uPoster.set([viewport.x, viewport.y, viewport.width, viewport.height]);
    u.uWater[0] = config.layers.water.ripple * viewport.width;
    this.uniforms.update();
    placeBeamSheets(this.sheets, viewport);
  }

  update(frame: ClockFrame): void {
    const { rippleSpeed, shimmerSpeed } = config.layers.water;
    const u = this.uniforms.uniforms;
    u.uDrift[0] = loopOffset(frame.time, rippleSpeed, WATER_PERIOD);
    u.uDrift[1] = loopOffset(frame.time, shimmerSpeed, WATER_PERIOD);
    u.uDrift[3] = beamPulses(frame.time).ground;
    this.uniforms.update();
  }

  destroy(): void {
    this.plane?.destroy();
    this.view.destroy({ children: true });
    releaseTexture('water');
  }
}
