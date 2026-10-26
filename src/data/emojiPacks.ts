/**
 * Animated emoji artwork (SVG + SMIL, so they animate inside <img>).
 * They belong to servers in the demo data (see seed.ts): like every custom
 * emoji, members of a server can use them in all chats and reactions.
 */
import type { CustomEmoji } from '../types';
import { svgUri } from './art';

interface EmojiSet {
  id: 'onyx' | 'halloween' | 'winter' | 'summer';
  emojis: CustomEmoji[];
}

const e = (id: string, name: string, body: string): CustomEmoji => ({
  id,
  name,
  animated: true,
  src: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`),
});

const GEM = `<path d="M22 6h20l10 10v32l-10 10H22L12 48V16z" fill="#10B981"/><path d="M22 6h20l-5 11H27z" fill="#6EE7B7"/><path d="M12 16l11 6v20l-11 6z" fill="#34D399"/><path d="M52 16l-11 6v20l11 6z" fill="#059669"/><path d="M22 58h20l-5-11H27z" fill="#047857"/><path d="M27 17h10l4 5v20l-4 5H27l-4-5V22z" fill="#10B981"/>`;

const SETS: EmojiSet[] = [
  {
    id: 'onyx',
    emojis: [
      e(
        'pe_gem_spin',
        'gem_spin',
        `<g>${GEM}<animateTransform attributeName="transform" type="scale" values="1 1;0.15 1;1 1" keyTimes="0;.5;1" dur="2.4s" repeatCount="indefinite" additive="sum"/><animateTransform attributeName="transform" type="translate" values="0 0;27 0;0 0" keyTimes="0;.5;1" dur="2.4s" repeatCount="indefinite" additive="sum"/></g>`,
      ),
      e(
        'pe_gg_shine',
        'gg_shine',
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34D399"/><stop offset="1" stop-color="#047857"/></linearGradient><clipPath id="c"><rect x="2" y="10" width="60" height="44" rx="12"/></clipPath></defs><rect x="2" y="10" width="60" height="44" rx="12" fill="url(#g)"/><text x="32" y="43" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-weight="900" font-size="28" font-style="italic" fill="#03130C">GG</text><g clip-path="url(#c)"><rect x="-30" y="0" width="16" height="64" fill="#fff" opacity=".55" transform="skewX(-20)"><animate attributeName="x" values="-30;90" dur="1.8s" repeatCount="indefinite"/></rect></g>`,
      ),
      e(
        'pe_hype_flame',
        'hype_flame',
        `<g><path d="M32 4c4 12 18 18 18 34a18 18 0 0 1-36 0c0-9 5-14 8-18 1 6 4 9 7 10-2-10 0-19 3-26z" fill="#10B981"/><path d="M32 30c3 6 9 9 9 17a9 9 0 0 1-18 0c0-5 3-8 5-10 0 3 2 5 4 5-1-5-1-8 0-12z" fill="#D1FAE5"/><animateTransform attributeName="transform" type="scale" values="1 1;1.04 .94;.97 1.05;1 1" dur=".9s" repeatCount="indefinite" additive="sum"/><animateTransform attributeName="transform" type="translate" values="0 0;-1.3 3.8;1 -3;0 0" dur=".9s" repeatCount="indefinite" additive="sum"/></g>`,
      ),
      e(
        'pe_heart_beat',
        'onyx_heartbeat',
        `<g><path d="M32 56S6 40 6 22c0-8 6-14 13-14 6 0 10 3 13 8 3-5 7-8 13-8 7 0 13 6 13 14 0 18-26 34-26 34z" fill="#10B981"/><path d="M17 16c-4 1-6 5-6 8" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".6"/><animateTransform attributeName="transform" type="scale" values="1;1.12;1;1.08;1" keyTimes="0;.15;.3;.45;1" dur="1.2s" repeatCount="indefinite" additive="sum"/><animateTransform attributeName="transform" type="translate" values="0 0;-3.8 -3.8;0 0;-2.6 -2.6;0 0" keyTimes="0;.15;.3;.45;1" dur="1.2s" repeatCount="indefinite" additive="sum"/></g>`,
      ),
    ],
  },
  {
    id: 'halloween',
    emojis: [
      e(
        'pe_pumpkin',
        'pumpkin_glow',
        `<defs><radialGradient id="p" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fdba74"/><stop offset="1" stop-color="#c2410c"/></radialGradient></defs><ellipse cx="20" cy="38" rx="14" ry="19" fill="url(#p)"/><ellipse cx="44" cy="38" rx="14" ry="19" fill="url(#p)"/><ellipse cx="32" cy="38" rx="14" ry="20" fill="url(#p)" stroke="#9a3412"/><path d="M30 18c0-7 4-11 10-12" stroke="#365314" stroke-width="5" fill="none" stroke-linecap="round"/><g fill="#fde047"><path d="M18 32l7-5 1 8z M46 32l-7-5-1 8z M16 44q16 14 32 0l-5 2-3-3-3 4-3-4-3 4-3-4-3 3z"/><animate attributeName="opacity" values="1;.55;1;.8;1" dur="1.6s" repeatCount="indefinite"/></g>`,
      ),
      e(
        'pe_ghost',
        'ghost_float',
        `<g><path d="M14 30a18 18 0 0 1 36 0v24l-6-5-6 5-6-5-6 5-6-5-6 5z" fill="#f8fafc" stroke="#cbd5e1"/><ellipse cx="25" cy="30" rx="3.4" ry="4.4" fill="#1e1b4b"/><ellipse cx="39" cy="30" rx="3.4" ry="4.4" fill="#1e1b4b"/><ellipse cx="32" cy="40" rx="4" ry="3" fill="#1e1b4b"/><animateTransform attributeName="transform" type="translate" values="0 2;0 -3;0 2" dur="2.2s" repeatCount="indefinite"/></g>`,
      ),
      e(
        'pe_bat',
        'bat_flap',
        `<g transform="translate(32 34)"><g><path d="M0 0C-6-6-12-6-20-12c2 8-2 12-8 14 8 0 14 4 18 8 4-4 8-4 10-2 2-2 6-2 10 2 4-4 10-8 18-8-6-2-10-6-8-14C12-6 6-6 0 0z" fill="#1e1033"/><circle cx="-3" cy="0" r="1.6" fill="#fde047"/><circle cx="3" cy="0" r="1.6" fill="#fde047"/><animateTransform attributeName="transform" type="scale" values="1 1;1 .45;1 1" dur=".5s" repeatCount="indefinite"/></g></g>`,
      ),
      e(
        'pe_spooky',
        'spooky_eyes',
        `<rect width="64" height="64" rx="14" fill="#1e1033"/><g fill="#fde047"><ellipse cx="22" cy="30" rx="7" ry="9"><animate attributeName="ry" values="9;9;1;9" keyTimes="0;.8;.9;1" dur="3s" repeatCount="indefinite"/></ellipse><ellipse cx="42" cy="30" rx="7" ry="9"><animate attributeName="ry" values="9;9;1;9" keyTimes="0;.8;.9;1" dur="3s" repeatCount="indefinite"/></ellipse></g><circle cx="23" cy="31" r="3" fill="#1e1033"/><circle cx="43" cy="31" r="3" fill="#1e1033"/>`,
      ),
    ],
  },
  {
    id: 'winter',
    emojis: [
      e(
        'pe_snowflake',
        'snowflake_spin',
        `<g stroke="#bae6fd" stroke-width="4.5" stroke-linecap="round" fill="none"><g><path d="M32 6v52M18 12l14 10 14-10M18 52l14-10 14 10"/><path d="M9.5 19l45 26M9.5 45l45-26" /><animateTransform attributeName="transform" type="rotate" values="0 32 32;360 32 32" dur="6s" repeatCount="indefinite"/></g></g><circle cx="32" cy="32" r="5" fill="#fff"/>`,
      ),
      e(
        'pe_snowman',
        'snowman',
        `<circle cx="32" cy="44" r="16" fill="#f8fafc" stroke="#cbd5e1"/><circle cx="32" cy="22" r="11" fill="#f8fafc" stroke="#cbd5e1"/><rect x="21" y="6" width="22" height="5" rx="2" fill="#1e293b"/><rect x="25" y="-2" width="14" height="10" rx="2" fill="#1e293b"/><circle cx="28" cy="20" r="1.6" fill="#1e293b"/><circle cx="36" cy="20" r="1.6" fill="#1e293b"/><path d="M32 24l8 2-8 1z" fill="#f97316"/><path d="M20 31q12 6 24 0" stroke="#dc2626" stroke-width="4" fill="none"><animate attributeName="d" values="M20 31q12 6 24 0;M20 31q12 3 24 2;M20 31q12 6 24 0" dur="1.5s" repeatCount="indefinite"/></path>`,
      ),
      e(
        'pe_gift',
        'gift_bounce',
        `<g><rect x="12" y="28" width="40" height="28" rx="3" fill="#10b981"/><rect x="9" y="20" width="46" height="10" rx="3" fill="#34d399"/><rect x="29" y="20" width="6" height="36" fill="#fbbf24"/><path d="M32 20c-6-10-16-8-14-2 2 5 10 3 14 2zm0 0c6-10 16-8 14-2-2 5-10 3-14 2z" fill="#fbbf24"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0;0 0" keyTimes="0;.2;.4;1" dur="1.6s" repeatCount="indefinite"/></g>`,
      ),
      e(
        'pe_cocoa',
        'cocoa',
        `<path d="M14 26h32v18a12 12 0 0 1-12 12h-8a12 12 0 0 1-12-12z" fill="#b45309"/><path d="M46 30h4a6 6 0 0 1 0 12h-4" stroke="#b45309" stroke-width="4" fill="none"/><ellipse cx="30" cy="26" rx="16" ry="3" fill="#78350f"/><g stroke="#e2e8f0" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"><path d="M24 20c-3-4 3-6 0-10"><animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></path><path d="M34 20c-3-4 3-6 0-10"><animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/></path></g>`,
      ),
    ],
  },
  {
    id: 'summer',
    emojis: [
      e(
        'pe_sun',
        'sun_spin',
        `<g><g fill="#fbbf24"><path d="M32 2l4 10h-8zM32 62l-4-10h8zM2 32l10-4v8zM62 32l-10 4v-8zM10.8 10.8l9.9 4.2-5.7 5.7zM53.2 53.2l-9.9-4.2 5.7-5.7zM10.8 53.2l4.2-9.9 5.7 5.7zM53.2 10.8l-4.2 9.9-5.7-5.7z"/></g><animateTransform attributeName="transform" type="rotate" values="0 32 32;360 32 32" dur="8s" repeatCount="indefinite"/></g><circle cx="32" cy="32" r="15" fill="#fde047" stroke="#f59e0b" stroke-width="2"/><circle cx="27" cy="30" r="2" fill="#78350f"/><circle cx="37" cy="30" r="2" fill="#78350f"/><path d="M26 36q6 5 12 0" stroke="#78350f" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
      ),
      e(
        'pe_wave',
        'wave_roll',
        `<defs><clipPath id="c"><circle cx="32" cy="32" r="28"/></clipPath></defs><circle cx="32" cy="32" r="28" fill="#cffafe"/><g clip-path="url(#c)"><g><path d="M-32 34q8-8 16 0t16 0 16 0 16 0 16 0 16 0 16 0V70H-32z" fill="#06b6d4"/><path d="M-32 44q8-8 16 0t16 0 16 0 16 0 16 0 16 0 16 0V70H-32z" fill="#0e7490"/><animateTransform attributeName="transform" type="translate" values="0 0;32 0" dur="2s" repeatCount="indefinite"/></g></g><circle cx="32" cy="32" r="28" fill="none" stroke="#0891b2" stroke-width="2"/>`,
      ),
      e(
        'pe_icecream',
        'icecream',
        `<path d="M22 34l10 26 10-26z" fill="#f59e0b" stroke="#b45309"/><path d="M24 38l14 6M26 46l10 4" stroke="#b45309" stroke-width="1.4"/><circle cx="25" cy="28" r="9" fill="#f9a8d4"/><circle cx="39" cy="28" r="9" fill="#a7f3d0"/><circle cx="32" cy="18" r="9" fill="#fde68a"/><circle cx="34" cy="10" r="3" fill="#dc2626"/><path d="M40 34q2 6-1 8" stroke="#a7f3d0" stroke-width="3" fill="none" stroke-linecap="round"><animate attributeName="d" values="M40 34q2 6-1 8;M40 34q2 9-1 12;M40 34q2 6-1 8" dur="2.4s" repeatCount="indefinite"/></path>`,
      ),
      e(
        'pe_palm',
        'palm_sway',
        `<path d="M10 58q22-6 44 0" stroke="#fcd34d" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M33 56c-2-14 0-28 4-38" stroke="#92400e" stroke-width="4.5" fill="none" stroke-linecap="round"/><g><path d="M37 18c-8-8-20-6-26 0 8-2 16 0 22 4zM37 18c8-8 20-6 26 0-8-2-16 0-22 4zM37 18c-2-10 4-16 10-18-4 6-6 12-6 18zM37 18c-6-8-14-10-20-8 6 2 12 6 16 12z" fill="#16a34a"/><animateTransform attributeName="transform" type="rotate" values="-6 37 18;6 37 18;-6 37 18" dur="3s" repeatCount="indefinite"/></g>`,
      ),
    ],
  },
];

export const ANIMATED_EMOJI_SETS = Object.fromEntries(SETS.map((s) => [s.id, s.emojis])) as Record<EmojiSet['id'], CustomEmoji[]>;

/** Fallback lookup so old messages still render if a server was left. */
export const ALL_ANIMATED_EMOJIS = SETS.flatMap((s) => s.emojis);
