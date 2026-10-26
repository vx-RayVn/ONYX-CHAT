import {reservedPaths} from '../../website/routes.js';
export const SITE_ORIGIN = 'https://onyxchat.site';
export const inviteUrl = (code: string) => `${SITE_ORIGIN}/${encodeURIComponent(code)}`;
export function parseInvite(value: string): string | null {
  const text = value.trim().replace(/^(https?:\/\/)(?:https?:?\/+)+/i, '$1');
  if (/^[a-z0-9_-]{3,100}$/i.test(text)) return reservedPaths.has(text.toLowerCase()) ? null : text.toLowerCase();
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    if (!['onyxchat.site', 'www.onyxchat.site', 'onyx.gg', 'localhost', '127.0.0.1'].includes(url.hostname)) return null;
    const code = url.searchParams.get('invite') ?? url.pathname.match(/^\/(?:invite\/|i\/)?([a-z0-9_-]{3,100})\/?$/i)?.[1];
    return code && /^[a-z0-9_-]{3,100}$/i.test(code) && !reservedPaths.has(code.toLowerCase()) ? code.toLowerCase() : null;
  } catch { return null; }
}

export function locationInvite(path: string, search: string): string | null {
  const query = new URLSearchParams(search).get('invite');
  if (query) return /^[a-z0-9_-]{3,100}$/i.test(query) && !reservedPaths.has(query.toLowerCase()) ? query.toLowerCase() : null;
  const code = path.match(/^\/(?:invite\/|i\/)?([a-z0-9_-]{3,100})\/?$/i)?.[1];
  return code && !reservedPaths.has(code.toLowerCase()) ? code.toLowerCase() : null;
}
