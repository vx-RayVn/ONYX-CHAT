import type { ID } from '../types';
import { locale, t, tn } from '../i18n';
import { CLOUD } from '../backend/config';

export { default as cn } from 'clsx';

let counter = 0;
/**
 * Short, sortable local ids in the demo. In cloud mode a UUID, so an optimistic
 * entry already has the id the database will store.
 */
export function uid(prefix = ''): ID {
  if (CLOUD) return crypto.randomUUID();
  counter = (counter + 1) % 1296;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function isSameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function formatClock(ts: number, use24h = true) {
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: !use24h }).format(ts);
}

/** "Today at 14:32", "Yesterday at 21:05", "12/10/26, 14:32" */
export function formatMessageTime(ts: number, use24h = true) {
  const now = Date.now();
  if (isSameDay(ts, now)) return t('Today at {time}', { time: formatClock(ts, use24h) });
  if (isSameDay(ts, now - DAY)) return t('Yesterday at {time}', { time: formatClock(ts, use24h) });
  const date = new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' }).format(ts);
  return `${date}, ${formatClock(ts, use24h)}`;
}

export function formatFullDate(ts: number) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
}

export function formatLongDateTime(ts: number, use24h = true) {
  const d = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
  return t('{date} at {time}', { date: d, time: formatClock(ts, use24h) });
}

export function formatDayDivider(ts: number) {
  const now = Date.now();
  if (isSameDay(ts, now)) return t('Today');
  if (isSameDay(ts, now - DAY)) return t('Yesterday');
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
}

export function formatShortDate(ts: number) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
}

export function formatIsoDate(iso: string) {
  return formatShortDate(new Date(`${iso}T12:00:00`).getTime());
}

export function formatRelative(ts: number) {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (abs < MINUTE) return rtf.format(0, 'second');
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / (7 * DAY)), 'week');
  return formatShortDate(ts);
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "for 2 hr 15 min" */
export function formatElapsed(since: number) {
  const mins = Math.floor((Date.now() - since) / MINUTE);
  if (mins < 1) return t('just started');
  const unit = (n: number, u: 'hour' | 'minute') => new Intl.NumberFormat(locale(), { style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  const d = h ? `${unit(h, 'hour')}${rest ? ` ${unit(rest, 'minute')}` : ''}` : unit(mins, 'minute');
  return t('for {duration}', { duration: d });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(locale(), { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/** Localised price, e.g. "3,99 €" (de) or "€3.99" (en). */
export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(amount);
}

export function formatCount(n: number) {
  return new Intl.NumberFormat(locale(), { notation: n >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
}

export function initials(name: string) {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Server icons show up to three initials ("Pixel Art Atelier" → "PAA"). */
export function serverInitials(name: string) {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts
    .slice(0, 3)
    .map((p) => p[0])
    .join('');
}

export function slugifyChannel(name: string) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}_-]/gu, '')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Relative luminance, used to pick readable text on custom colours. */
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Plural with count, e.g. plural(3, '{count} member', '{count} members'). */
export function plural(n: number, one: string, other: string) {
  return tn(n, one, other);
}

export function listNames(names: string[], max = 3) {
  if (names.length === 0) return '';
  const shown = names.length > max ? [...names.slice(0, max), tn(names.length - max, '{count} other', '{count} others')] : names;
  try {
    return new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(shown);
  } catch {
    return shown.join(', ');
  }
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

/** Modifier key label for shortcuts (translated, e.g. Strg in German). */
export const modKey = () => (isMac() ? '⌘' : t('Ctrl'));

export function formatNumber(n: number) {
  return new Intl.NumberFormat(locale()).format(n);
}
