import type { Embed } from '../types';

/** Untrusted message links must never become executable browser navigation. */
export function externalHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}



/** Database JSON is untrusted even when its outer column is constrained to an array. */
export function messageEmbeds(value: unknown): Embed[] {
  if (!Array.isArray(value)) return [];
  const text = (value: unknown, max = 4096) => typeof value === 'string' ? value.slice(0, max) : undefined;
  return value.slice(0, 10).flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const embed: Embed = {};
    for (const key of ['provider', 'author', 'title', 'description', 'footer'] as const) embed[key] = text(raw[key]);
    for (const key of ['url', 'thumbnail', 'image'] as const) embed[key] = externalHttpUrl(raw[key]);
    if (typeof raw.color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw.color)) embed.color = raw.color;
    if (Array.isArray(raw.fields)) embed.fields = raw.fields.slice(0, 25).flatMap((field: unknown) => {
      if (!field || typeof field !== 'object') return [];
      const f = field as Record<string, unknown>, name = text(f.name, 256), value = text(f.value, 2048);
      return name !== undefined && value !== undefined ? [{ name, value, inline: f.inline === true }] : [];
    });
    const action = raw.action;
    if (action && typeof action === 'object' && typeof action.label === 'string') {
      const url = externalHttpUrl(action.url);
      if (url || action.url === undefined) embed.action = { label: action.label.slice(0, 100), url };
    }
    return [embed];
  });
}
