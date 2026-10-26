/**
 * Minimal i18n layer.
 *
 * Source strings are written in English directly in the components and act as
 * keys: t('Send message'). Other languages are lazy-loaded dictionaries that map
 * the English key to a translation. Missing keys fall back to English.
 *
 * - t(key, vars)              → string with {placeholders} filled in
 * - tn(count, one, other)     → plural-aware string (Intl.PluralRules)
 * - tx(key, { name: <b/> })   → ReactNode with components as placeholders
 * - tk(key)                   → marks a key for extraction when t() runs later
 */
import { Fragment, createElement, type ReactNode } from 'react';

export type Lang = 'en' | 'de' | 'es' | 'fr' | 'it' | 'pt-BR' | 'nl' | 'pl' | 'tr' | 'ru' | 'uk' | 'ar' | 'ja' | 'ko' | 'zh-CN';

export const LANGUAGES: { code: Lang; native: string; english: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', native: 'English', english: 'English', dir: 'ltr' },
  { code: 'de', native: 'Deutsch', english: 'German', dir: 'ltr' },
  { code: 'es', native: 'Español', english: 'Spanish', dir: 'ltr' },
  { code: 'fr', native: 'Français', english: 'French', dir: 'ltr' },
  { code: 'it', native: 'Italiano', english: 'Italian', dir: 'ltr' },
  { code: 'pt-BR', native: 'Português (Brasil)', english: 'Portuguese (Brazil)', dir: 'ltr' },
  { code: 'nl', native: 'Nederlands', english: 'Dutch', dir: 'ltr' },
  { code: 'pl', native: 'Polski', english: 'Polish', dir: 'ltr' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish', dir: 'ltr' },
  { code: 'ru', native: 'Русский', english: 'Russian', dir: 'ltr' },
  { code: 'uk', native: 'Українська', english: 'Ukrainian', dir: 'ltr' },
  { code: 'ar', native: 'العربية', english: 'Arabic', dir: 'rtl' },
  { code: 'ja', native: '日本語', english: 'Japanese', dir: 'ltr' },
  { code: 'ko', native: '한국어', english: 'Korean', dir: 'ltr' },
  { code: 'zh-CN', native: '简体中文', english: 'Chinese (Simplified)', dir: 'ltr' },
];

export type PluralEntry = Partial<Record<Intl.LDMLPluralRule, string>>;
export type Dict = Record<string, string | PluralEntry>;

const loaders: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Dict }>> = {
  de: () => import('./locales/de'),
  es: () => import('./locales/es'),
  fr: () => import('./locales/fr'),
  it: () => import('./locales/it'),
  'pt-BR': () => import('./locales/pt-BR'),
  nl: () => import('./locales/nl'),
  pl: () => import('./locales/pl'),
  tr: () => import('./locales/tr'),
  ru: () => import('./locales/ru'),
  uk: () => import('./locales/uk'),
  ar: () => import('./locales/ar'),
  ja: () => import('./locales/ja'),
  ko: () => import('./locales/ko'),
  'zh-CN': () => import('./locales/zh-CN'),
};

let current: Lang = 'en';
let dict: Dict = {};
const pluralCache = new Map<string, Intl.PluralRules>();
const numberCache = new Map<string, Intl.NumberFormat>();

export function getLanguage(): Lang {
  return current;
}

/** BCP 47 tag for Intl APIs. */
export function locale(): string {
  return current;
}

export function isRTL(lang: Lang = current) {
  return LANGUAGES.find((l) => l.code === lang)?.dir === 'rtl';
}

export async function loadLanguage(lang: Lang): Promise<void> {
  if (lang === 'en') {
    dict = {};
  } else {
    try {
      dict = (await loaders[lang]()).default;
    } catch {
      dict = {};
      lang = 'en';
    }
  }
  current = lang;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = isRTL(lang) ? 'rtl' : 'ltr';
}

function formatNumber(n: number) {
  let f = numberCache.get(current);
  if (!f) {
    f = new Intl.NumberFormat(current);
    numberCache.set(current, f);
  }
  return f.format(n);
}

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    if (v === undefined) return m;
    return typeof v === 'number' ? formatNumber(v) : v;
  });
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const v = dict[key];
  return interpolate(typeof v === 'string' ? v : key, vars);
}

/** Plural-aware translation. The dictionary entry is keyed by the English "other" form. */
export function tn(count: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const all = { count, ...vars };
  const entry = dict[other];
  if (entry && typeof entry === 'object') {
    let rules = pluralCache.get(current);
    if (!rules) {
      rules = new Intl.PluralRules(current);
      pluralCache.set(current, rules);
    }
    const rule = rules.select(count);
    return interpolate(entry[rule] ?? entry.other ?? other, all);
  }
  if (typeof entry === 'string') return interpolate(entry, all);
  return interpolate(count === 1 ? one : other, all);
}

/** Translation with React nodes as placeholders: tx('Welcome to {name}!', { name: <b>…</b> }). */
export function tx(key: string, vars: Record<string, ReactNode>): ReactNode {
  const v = dict[key];
  const s = typeof v === 'string' ? v : key;
  const parts = s.split(/(\{\w+\})/g);
  return createElement(
    Fragment,
    null,
    ...parts.map((p, i) => {
      const m = p.match(/^\{(\w+)\}$/);
      if (m && m[1] in vars) return createElement(Fragment, { key: i }, vars[m[1]]);
      return p;
    }),
  );
}

/** Marks a string as translation key without translating it yet (for data defined at module level). */
export const tk = <T extends string>(s: T): T => s;

/** Localised country name for an ISO 3166 code. */
export function countryName(code: string) {
  try {
    return new Intl.DisplayNames([current], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
