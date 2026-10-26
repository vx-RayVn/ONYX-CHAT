/** App themes and backgrounds. Colours live in styles/themes.css. */
import { tk } from '../i18n';
import type { Theme } from '../types';

export interface ThemeDef {
  id: Theme;
  name: string;
  description: string;
  /** [app, sidebar, main, accent] for the preview card */
  swatch: [string, string, string, string];
  light?: boolean;
  seasonal?: boolean;
}

export const THEMES: ThemeDef[] = [
  { id: 'graphite', name: tk('Graphite'), description: tk('The ONYX standard – calm graphite with emerald.'), swatch: ['#07090b', '#0b0f12', '#0f1417', '#10b981'] },
  { id: 'onyx', name: tk('Onyx OLED'), description: tk('True black for OLED screens.'), swatch: ['#000000', '#040607', '#07090b', '#10b981'] },
  { id: 'emerald-night', name: tk('Emerald Night'), description: tk('Deep green surfaces with a soft glow.'), swatch: ['#020d0a', '#05150f', '#081c15', '#34d399'] },
  { id: 'midnight', name: tk('Midnight Blue'), description: tk('Cool navy for late sessions.'), swatch: ['#050914', '#0a1020', '#0e1628', '#60a5fa'] },
  { id: 'amethyst', name: tk('Amethyst'), description: tk('Violet depth with lavender accents.'), swatch: ['#0a0612', '#120b1f', '#170f27', '#a78bfa'] },
  { id: 'deep-ocean', name: tk('Deep Ocean'), description: tk('Teal water tones and cyan highlights.'), swatch: ['#02090c', '#051318', '#08191f', '#22d3ee'] },
  { id: 'aurora', name: tk('Aurora'), description: tk('Northern lights drifting behind the app.'), swatch: ['#030a10', '#07131a', '#0a1820', '#5eead4'] },
  { id: 'crimson', name: tk('Crimson'), description: tk('Dark red warmth with rose accents.'), swatch: ['#0d0507', '#170a0d', '#1d0e12', '#fb7185'] },
  { id: 'sunset', name: tk('Summer Sunset'), description: tk('Warm dusk colours and golden light.'), swatch: ['#0f0806', '#1a0f0b', '#21130e', '#fb923c'], seasonal: true },
  { id: 'winter-night', name: tk('Winter Night'), description: tk('Frosty blue with icy highlights.'), swatch: ['#050a12', '#0a1220', '#0e1828', '#7dd3fc'], seasonal: true },
  { id: 'haunted', name: tk('Haunted Night'), description: tk('Pumpkin orange on midnight purple.'), swatch: ['#0a0612', '#130b1d', '#190f26', '#f97316'], seasonal: true },
  { id: 'daylight', name: tk('Daylight'), description: tk('A bright, friendly light theme.'), swatch: ['#e9eef0', '#f3f6f7', '#ffffff', '#059669'], light: true },
];
