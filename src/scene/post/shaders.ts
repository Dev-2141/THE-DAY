/**
 * GLSL for the post-processing passes. Each runs on a quad covering its
 * render target, with vUnit as the target's texture coordinate (0,0 top-left).
 * Every pass writes opaque colour, so targets never blend with old content.
 */

/** Rec. 709 luma and a cheap, stable per-pixel hash (no sin()). */
const COMMON = /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/**
 * Bloom prefilter: a 13-tap downsample (stable, no flicker on thin bright
 * lines) followed by a soft-knee threshold, so only bright sources bloom.
 */
export const BRIGHT_FRAGMENT = /* glsl */ `
${COMMON}
uniform sampler2D uSource;
uniform vec4 uTexel;      // source texel size (uv), -, -
uniform vec4 uThreshold;  // threshold, knee, -, -

vec3 tap(vec2 offset) { return texture(uSource, vUnit + offset * uTexel.xy).rgb; }

void main() {
  vec3 a = tap(vec2(-2.0, -2.0)), b = tap(vec2(0.0, -2.0)), c = tap(vec2(2.0, -2.0));
  vec3 d = tap(vec2(-1.0, -1.0)), e = tap(vec2(1.0, -1.0));
  vec3 f = tap(vec2(-2.0, 0.0)), g = tap(vec2(0.0, 0.0)), h = tap(vec2(2.0, 0.0));
  vec3 i = tap(vec2(-1.0, 1.0)), j = tap(vec2(1.0, 1.0));
  vec3 k = tap(vec2(-2.0, 2.0)), l = tap(vec2(0.0, 2.0)), m = tap(vec2(2.0, 2.0));
  vec3 colour = (d + e + i + j) * 0.125
    + (a + b + f + g) * 0.03125 + (b + c + g + h) * 0.03125
    + (f + g + k + l) * 0.03125 + (g + h + l + m) * 0.03125;
  float bright = max(colour.r, max(colour.g, colour.b));
  float knee = max(uThreshold.y, 1e-4);
  float soft = clamp(bright - uThreshold.x + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float weight = max(soft, bright - uThreshold.x) / max(bright, 1e-4);
  finalColor = vec4(colour * weight, 1.0);
}
`;

/** Dual-filter (Kawase) downsample: five taps, half a texel apart. */
export const DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec4 uTexel;   // source texel size (uv)

void main() {
  vec2 h = uTexel.xy;
  vec3 sum = texture(uSource, vUnit).rgb * 4.0;
  sum += texture(uSource, vUnit + vec2(-h.x, -h.y)).rgb;
  sum += texture(uSource, vUnit + vec2(h.x, -h.y)).rgb;
  sum += texture(uSource, vUnit + vec2(-h.x, h.y)).rgb;
  sum += texture(uSource, vUnit + vec2(h.x, h.y)).rgb;
  finalColor = vec4(sum / 8.0, 1.0);
}
`;

/**
 * Dual-filter upsample of the wider level, mixed with this level's own
 * downsample. `spread` shifts the balance toward the wide levels.
 */
export const UP_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;   // the wider (smaller) level
uniform sampler2D uDetail;   // this level's downsample
uniform vec4 uTexel;         // source texel size (uv), spread, -

void main() {
  vec2 h = uTexel.xy;
  vec3 sum = texture(uSource, vUnit + vec2(-2.0 * h.x, 0.0)).rgb;
  sum += texture(uSource, vUnit + vec2(2.0 * h.x, 0.0)).rgb;
  sum += texture(uSource, vUnit + vec2(0.0, -2.0 * h.y)).rgb;
  sum += texture(uSource, vUnit + vec2(0.0, 2.0 * h.y)).rgb;
  sum += texture(uSource, vUnit + vec2(-h.x, -h.y)).rgb * 2.0;
  sum += texture(uSource, vUnit + vec2(h.x, -h.y)).rgb * 2.0;
  sum += texture(uSource, vUnit + vec2(-h.x, h.y)).rgb * 2.0;
  sum += texture(uSource, vUnit + vec2(h.x, h.y)).rgb * 2.0;
  vec3 wide = sum / 12.0;
  vec3 detail = texture(uDetail, vUnit).rgb;
  finalColor = vec4(mix(detail, wide, uTexel.z), 1.0);
}
`;

/**
 * Light shafts: march from each pixel toward the sun through a mask of the
 * bright, warm sky, so light streams through gaps in the clouds and haze.
 */
export const SHAFTS_FRAGMENT = /* glsl */ `
${COMMON}
#define MAX_SAMPLES 64
uniform sampler2D uSource;   // the scene
uniform vec4 uSun;           // sun position (uv), aspect (width / height), samples
uniform vec4 uShape;         // threshold low, high, density, decay

float lightAt(vec2 uv) {
  vec3 c = texture(uSource, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
  // Warm, bright sky casts shafts; cool or dark things block them.
  float warmth = clamp((c.r - c.b) * 4.0 + 0.4, 0.0, 1.0);
  return smoothstep(uShape.x, uShape.y, luma(c)) * warmth;
}

void main() {
  vec2 toSun = uSun.xy - vUnit;
  vec2 stepUv = toSun * uShape.z / uSun.w;
  // Start each pixel's march at a slightly different point: no stepping bands.
  vec2 uv = vUnit + stepUv * hash12(gl_FragCoord.xy);
  float decay = 1.0;
  float sum = 0.0;
  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (float(i) >= uSun.w) break;
    uv += stepUv;
    sum += lightAt(uv) * decay;
    decay *= uShape.w;
  }
  // Shafts fade with distance from the sun.
  float distance = length(toSun * vec2(uSun.z, 1.0));
  float falloff = exp(-distance * 1.2);
  finalColor = vec4(vec3(sum / uSun.w * falloff), 1.0);
}
`;

/**
 * The final image: key and fill light, atmosphere, shafts and bloom, the
 * filmic tone curve and colour grade, vignette, grain, dither and the
 * letterbox. Strengths of 0 switch a stage off.
 */
export const COMPOSITE_FRAGMENT = /* glsl */ `
${COMMON}
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uShafts;
uniform vec4 uScreen;       // width, height (px), frame seed, -
uniform vec4 uPoster;       // poster x, y, width, height (px)
uniform vec4 uLetterbox;    // background colour, 1 when letterboxed
uniform vec4 uKey;          // sun x, y (px), reach (px), strength
uniform vec3 uKeyColor;
uniform vec4 uFill;         // beam x (px), top (px), reach (px), strength
uniform vec3 uFillColor;
uniform vec4 uAtmosphere;   // horizon (px), spread (px), strength, -
uniform vec3 uAtmosphereColor;
uniform vec4 uShaftsColor;  // colour, strength
uniform vec4 uBloomColor;   // tint, strength
uniform vec4 uTone;         // exposure, filmic strength, contrast, saturation
uniform vec4 uGrade;        // strength, -, -, -
uniform vec3 uShadows;
uniform vec3 uHighlights;
uniform vec4 uFinish;       // vignette, grain, dither (8-bit steps), -

// Filmic curve for a display-ready scene: below 0.8 untouched, above it a
// long, soft shoulder, so light added by the key, shafts and bloom rolls off
// gently instead of clipping.
vec3 shoulder(vec3 x) {
  vec3 over = max(x - 0.8, 0.0);
  return min(x, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
}

// Filmic toe: deep shadows sink a little, so the darks are rich, not grey.
vec3 toe(vec3 x) {
  vec3 inv = 1.0 - clamp(x, 0.0, 1.0);
  return x - x * inv * inv * inv * 0.9;
}

void main() {
  vec2 px = vUnit * uScreen.xy;
  vec3 c = texture(uScene, vUnit).rgb;

  // Key: the low sun warms everything near it, most where it is already lit.
  float toSun = length(px - uKey.xy) / max(uKey.z, 1.0);
  float key = exp(-toSun * toSun) * uKey.w;
  // The beam's cool light is its own source: the sun does not warm it.
  key *= 1.0 - 0.85 * smoothstep(0.0, 0.08, c.b - c.r);
  c += c * uKeyColor * key;
  // Fill: the beam lifts the shadows around it with cool light.
  float side = (px.x - uFill.x) / max(uFill.z, 1.0);
  float fill = exp(-side * side) * smoothstep(uFill.y, uFill.y + uPoster.w * 0.2, px.y) * uFill.w;
  // It reaches the ridges, haze and water around the beam's foot, not the near grass.
  fill *= 1.0 - smoothstep(uPoster.y + uPoster.w * 0.9, uPoster.y + uPoster.w * 0.97, px.y);
  c += uFillColor * fill * (0.06 + 0.3 * (1.0 - luma(c)));

  // Atmosphere: a veil that deepens toward the horizon.
  float horizon = (px.y - uAtmosphere.x) / max(uAtmosphere.y, 1.0);
  c = mix(c, uAtmosphereColor, exp(-horizon * horizon) * uAtmosphere.z);

  // Shafts and bloom are light: added with a screen blend so they never clip.
  vec3 shafts = texture(uShafts, vUnit).rgb * uShaftsColor.rgb * uShaftsColor.a;
  vec3 bloom = texture(uBloom, vUnit).rgb * uBloomColor.rgb * uBloomColor.a;
  c = 1.0 - (1.0 - c) * (1.0 - clamp(shafts, 0.0, 1.0));
  c = 1.0 - (1.0 - c) * (1.0 - clamp(bloom, 0.0, 1.0));

  // Tone: exposure, the filmic shoulder and toe, then a gentle S-curve.
  vec3 exposed = c * uTone.x;
  c = mix(c, toe(shoulder(exposed)), uTone.y);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), uTone.z);

  // Grade: shadows toward teal-black, highlights toward warm cream.
  float l = luma(c);
  vec3 shadowShift = uShadows - vec3(luma(uShadows));
  vec3 highlightShift = uHighlights - vec3(luma(uHighlights));
  c += shadowShift * (1.0 - l) * (1.0 - l) * uGrade.x * 0.5;
  // Cool, bright light (the beam) keeps its colour: only warm and neutral highlights turn cream.
  float cool = smoothstep(0.0, 0.08, c.b - c.r);
  c += highlightShift * l * l * uGrade.x * 0.35 * (1.0 - cool);
  c = mix(vec3(luma(c)), c, uTone.w);

  // Vignette around the window, gentle and slightly warm in its falloff.
  vec2 v = (vUnit - 0.5) * vec2(uScreen.x / uScreen.y, 1.0);
  float vignette = smoothstep(0.5, 1.3, length(v) * 1.15) * uFinish.x;
  c *= 1.0 - vignette * vec3(1.0, 1.04, 1.1);

  // Fine film grain, strongest in the mid-tones.
  float grain = hash12(px + uScreen.z * 17.0) - 0.5;
  c += grain * uFinish.y * (0.4 + 0.6 * (1.0 - abs(2.0 * luma(c) - 1.0)));
  // Triangular dither: removes banding from the smooth sky gradients.
  float dither = hash12(px + uScreen.z * 3.1 + 11.0) + hash12(px.yx + uScreen.z * 5.7 + 23.0) - 1.0;
  c += dither * uFinish.z / 255.0;

  // Letterbox: the poster alone, with plain bars around it.
  if (uLetterbox.a > 0.5) {
    vec2 inside = step(uPoster.xy, px) * step(px, uPoster.xy + uPoster.zw);
    c = mix(uLetterbox.rgb, c, inside.x * inside.y);
  }
  finalColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
