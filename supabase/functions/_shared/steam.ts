/** Steam OpenID 2.0. Always verify directly with the fixed provider, never a callback-supplied URL. */
export const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
export const hashState = async (state: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state))), (n) => n.toString(16).padStart(2, '0')).join('');

export function steamLoginURL(callback: string) {
  const url = new URL(STEAM_OPENID);
  url.search = new URLSearchParams({
    'openid.ns': NS, 'openid.mode': 'checkid_setup', 'openid.return_to': callback,
    'openid.realm': `${new URL(callback).origin}/`,
    'openid.identity': `${NS}/identifier_select`, 'openid.claimed_id': `${NS}/identifier_select`,
  }).toString();
  return url.toString();
}

export async function verifySteam(params: URLSearchParams, callback: string, fetcher: typeof fetch = fetch, now = Date.now()) {
  const get = (key: string) => params.get(`openid.${key}`) ?? '';
  // Duplicate query fields cannot be interpreted differently by Steam and this function.
  for (const key of new Set(params.keys())) if (params.getAll(key).length !== 1) throw new Error('duplicate field');
  if (get('ns') !== NS || get('mode') !== 'id_res' || get('op_endpoint') !== STEAM_OPENID || get('return_to') !== callback) throw new Error('invalid response');
  const claimed = get('claimed_id');
  const match = /^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/.exec(claimed);
  if (!match || get('identity') !== claimed) throw new Error('invalid identity');
  const signed = new Set(get('signed').split(','));
  for (const field of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']) if (!signed.has(field)) throw new Error('unsigned field');
  const nonceTime = Date.parse(get('response_nonce').slice(0, 20));
  if (!Number.isFinite(nonceTime) || Math.abs(now - nonceTime) > 10 * 60_000) throw new Error('expired response');
  const body = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  const res = await fetcher(STEAM_OPENID, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!res.ok || !(await res.text()).split(/\r?\n/).includes('is_valid:true')) throw new Error('invalid signature');
  return match[1];
}
