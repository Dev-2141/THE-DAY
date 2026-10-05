/**
 * Refraction for the glass: an SVG filter, used as the element's backdrop
 * filter, that blurs the live scene behind the glass and bends it near the
 * edges, as a thick rounded lens does. The bend comes from a displacement
 * map drawn for the element's exact size and corner radius.
 *
 * SVG backdrop filters are a Chromium feature; the Windows app (WebView2)
 * and the Android app (WebView) are both Chromium. Elsewhere the glass falls
 * back to the plain CSS blur in styles.css.
 */

export interface GlassShape {
  readonly width: number;
  readonly height: number;
  /** Corner radius in px; at least half the height makes a pill or a circle. */
  readonly radius: number;
}

export interface GlassOptics {
  /** Width of the curved rim that bends the light, px. */
  readonly bezel: number;
  /** Largest bend at the very edge, px. */
  readonly strength: number;
  /** Softness of the scene behind the glass, px. */
  readonly blur: number;
}

export const DEFAULT_OPTICS: GlassOptics = { bezel: 18, strength: 22, blur: 9 };

/** The map is drawn at reduced size; the filter scales it up smoothly. */
const MAP_SCALE = 0.5;

/** Signed distance to a rounded rectangle centred at the origin: negative inside. */
function roundedRectDistance(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * A displacement map as a data URL: red and green encode where each point of
 * the rim samples the scene from (0.5 is "straight through"). Points on the
 * rim look inward, most strongly at the very edge, so the scene appears to
 * curve into the glass.
 */
export function displacementMap(shape: GlassShape, bezel: number): string {
  const w = Math.max(2, Math.round(shape.width * MAP_SCALE));
  const h = Math.max(2, Math.round(shape.height * MAP_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (context === null) return '';
  const image = context.createImageData(w, h);
  const hw = shape.width / 2;
  const hh = shape.height / 2;
  const r = Math.min(shape.radius, hw, hh);
  const rim = Math.max(1, Math.min(bezel, hw, hh));
  const e = 0.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / MAP_SCALE - hw;
      const py = (y + 0.5) / MAP_SCALE - hh;
      const d = roundedRectDistance(px, py, hw, hh, r);
      let dx = 0;
      let dy = 0;
      if (d < 0 && -d < rim) {
        // Outward normal from the distance field's gradient.
        const gx = roundedRectDistance(px + e, py, hw, hh, r) - roundedRectDistance(px - e, py, hw, hh, r);
        const gy = roundedRectDistance(px, py + e, hw, hh, r) - roundedRectDistance(px, py - e, hw, hh, r);
        const length = Math.hypot(gx, gy) || 1;
        // A lens profile: flat in the middle, curving steeply at the edge.
        const t = 1 + d / rim;
        const bend = t * t * t;
        dx = (-gx / length) * bend;
        dy = (-gy / length) * bend;
      }
      const i = (y * w + x) * 4;
      image.data[i] = Math.round(127.5 + dx * 127);
      image.data[i + 1] = Math.round(127.5 + dy * 127);
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Readonly<Record<string, string | number>>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

let host: SVGSVGElement | null = null;

function filterHost(): SVGSVGElement {
  if (host !== null && host.isConnected) return host;
  host = svgElement('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
  host.style.position = 'absolute';
  host.style.width = '0';
  host.style.height = '0';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  return host;
}

/** Whether SVG backdrop filters will render here (Chromium engines). */
export const supportsRefraction: boolean =
  typeof navigator !== 'undefined' && /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);

/**
 * Build (or rebuild) the filter `id` for a shape. Returns the CSS value for
 * `backdrop-filter`.
 */
export function writeFilter(id: string, shape: GlassShape, optics: GlassOptics): string {
  filterHost().querySelector(`#${CSS.escape(id)}`)?.remove();
  const filter = svgElement('filter', {
    id,
    x: 0,
    y: 0,
    width: shape.width,
    height: shape.height,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    // The map must be read as stored, not converted to linear light.
    'color-interpolation-filters': 'sRGB',
  });
  filter.append(
    svgElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: optics.blur, edgeMode: 'duplicate', result: 'soft' }),
    svgElement('feImage', {
      href: displacementMap(shape, optics.bezel),
      x: 0,
      y: 0,
      width: shape.width,
      height: shape.height,
      preserveAspectRatio: 'none',
      result: 'map',
    }),
    svgElement('feDisplacementMap', {
      in: 'soft',
      in2: 'map',
      scale: optics.strength * 2,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'bent',
    }),
    // Richer colour, and bright sky slightly dimmed so light text stays readable.
    svgElement('feColorMatrix', { in: 'bent', type: 'saturate', values: 1.45, result: 'rich' }),
  );
  const transfer = svgElement('feComponentTransfer', { in: 'rich' });
  for (const channel of ['feFuncR', 'feFuncG', 'feFuncB'] as const) {
    transfer.append(svgElement(channel, { type: 'linear', slope: 0.86, intercept: 0.01 }));
  }
  filter.append(transfer);
  filterHost().append(filter);
  return `url(#${id})`;
}

export function removeFilter(id: string): void {
  host?.querySelector(`#${CSS.escape(id)}`)?.remove();
}
