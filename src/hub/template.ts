/**
 * Fills a call_api template from a JSON result, exactly as the Python hub
 * does (hub_core/registry.py, fill_template): "{a.b}" reads field b of field
 * a, "{items.0}" an array element, and "{}" the whole result. Missing
 * fields become empty text. Strings are shown as they are; anything else as
 * compact JSON.
 */
const FIELD = /\{([^{}]*)\}/g;

export function fillTemplate(template: string, result: unknown): string {
  return template.replace(FIELD, (_, path: string) => {
    let value: unknown = result;
    for (const part of path.split('.').filter((p) => p !== '')) {
      if (Array.isArray(value)) {
        if (!/^\d+$/.test(part) || Number(part) >= value.length) return '';
        value = value[Number(part)];
      } else if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>;
        value = Object.hasOwn(record, part) ? record[part] : '';
      } else {
        return '';
      }
    }
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  });
}
