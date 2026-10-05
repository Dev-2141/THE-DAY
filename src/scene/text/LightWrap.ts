import { Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';
import { config } from '../../config/config';
import { BEAM_SHEETS_GLSL, createBeamSheetUniforms, placeBeamSheets } from '../layers/BeamLayer';
import { hexToRgb } from '../gl/quad';
import type { PosterViewport } from '../types';

const FRAGMENT = /* glsl */ `#version 300 es
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;    // filter texture size (logical px) and its inverse
uniform vec4 uInputClamp;   // valid texture-coordinate range
uniform vec4 uOutputFrame;  // filter area on screen
${BEAM_SHEETS_GLSL}
uniform vec4 uWrap;         // beam colour, strength
uniform float uRadius;      // reach of the light, px

void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  vec2 screen = uOutputFrame.xy + vTextureCoord * uInputSize.xy;
  float beam = clamp(beamSheets(screen.x).x, 0.0, 1.0);
  if (beam <= 0.0 || uWrap.a <= 0.0) {
    finalColor = src;
    return;
  }
  // Average coverage on a ring around this pixel.
  float ring = 0.0;
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5235988;
    vec2 offset = vec2(cos(angle), sin(angle)) * uRadius * uInputSize.zw;
    vec2 uv = clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw);
    ring += texture(uTexture, uv).a;
  }
  ring /= 12.0;
  // Light spills over the letter edges and faintly just outside them.
  float onEdge = src.a * (1.0 - ring);
  float outside = (1.0 - src.a) * ring;
  vec3 light = uWrap.rgb * beam * uWrap.a * (onEdge * 0.9 + outside * 0.3);
  finalColor = vec4(src.rgb + light, src.a);
}
`;

/**
 * A soft, barely visible light wrap: where the beam passes behind the
 * letters, a little of its light spills over their edges.
 */
export class LightWrap {
  readonly filter: Filter;
  private readonly sheets = createBeamSheetUniforms();
  private readonly wrap = new UniformGroup({
    uWrap: {
      value: new Float32Array([...hexToRgb(config.layers.beams.colorTop), config.text.lightWrap.strength]),
      type: 'vec4<f32>',
    },
    uRadius: { value: 1, type: 'f32' },
  });

  constructor() {
    this.filter = new Filter({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment: FRAGMENT,
        name: 'light-wrap',
        preferredFragmentPrecision: 'highp',
      }),
      resources: { sheetUniforms: this.sheets, wrapUniforms: this.wrap },
      resolution: 'inherit',
      antialias: 'inherit',
    });
  }

  resize(viewport: PosterViewport): void {
    const radius = Math.max(1, config.text.lightWrap.radius * viewport.height);
    this.filter.padding = Math.ceil(radius) + 2;
    this.wrap.uniforms.uRadius = radius;
    this.wrap.update();
    placeBeamSheets(this.sheets, viewport);
  }
}
