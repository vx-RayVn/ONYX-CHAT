/**
 * Personalisation catalogue.
 *
 * Everything here is free and available right away – including seasonal
 * designs. Collections only group items that belong together visually; they
 * never gate anything. The artwork lives in components/cosmetics; this file
 * only describes what exists.
 */
import { tk } from '../i18n';
import type { AvatarSource, NameStyle } from '../types';
import { FLAG_FONT_FAMILY } from '../lib/flagEmoji';

/** Flag emoji fallback first (it only covers flag characters). */
const FLAGS = `'${FLAG_FONT_FAMILY}', `;

export type CollectionId =
  | 'essentials'
  | 'onyx-fracture'
  | 'celestial-orbit'
  | 'sakura-dream'
  | 'pixel-arcade'
  | 'neon-nights'
  | 'prestige'
  | 'plasma-arc'
  | 'void-rift'
  | 'dragon-ember'
  | 'haunted-harvest'
  | 'winter-crystal'
  | 'summer-tide';

export type CosmeticType = 'avatar' | 'decoration' | 'frame' | 'effect' | 'banner';

export interface EventWindow {
  name: string;
  start: string; // ISO date
  end: string;
}

export interface Collection {
  id: CollectionId;
  name: string;
  /** Seasonal sets are marked, but always available. */
  season?: 'halloween' | 'winter' | 'summer';
  /** Two colours for the small collection marker. */
  colors: [string, string];
}

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;
  collection: CollectionId;
  animated?: boolean;
  /** Only for avatars */
  avatar?: AvatarSource;
}

/** Event windows are used for event badges (see data/badges.ts). */
export const EVENTS = {
  closedBeta: { name: tk('Closed Beta'), start: '2026-03-01', end: '2026-05-15' },
  halloween2026: { name: tk('Halloween 2026'), start: '2026-10-15', end: '2026-11-02' },
  winter2026: { name: tk('Winter 2026'), start: '2026-12-01', end: '2027-01-06' },
  summer2027: { name: tk('Summer 2027'), start: '2027-06-21', end: '2027-08-31' },
} satisfies Record<string, EventWindow>;

export const COLLECTIONS: Collection[] = [
  { id: 'essentials', name: tk('Essentials'), colors: ['#10b981', '#0d9488'] },
  { id: 'onyx-fracture', name: tk('Onyx Fracture'), colors: ['#1f2a2f', '#34d399'] },
  { id: 'celestial-orbit', name: tk('Celestial Orbit'), colors: ['#312e81', '#fde68a'] },
  { id: 'sakura-dream', name: tk('Sakura Dream'), colors: ['#f9a8d4', '#be185d'] },
  { id: 'pixel-arcade', name: tk('Pixel Arcade'), colors: ['#22d3ee', '#a855f7'] },
  { id: 'neon-nights', name: tk('Neon Nights'), colors: ['#22d3ee', '#ec4899'] },
  { id: 'prestige', name: tk('Prestige'), colors: ['#fde68a', '#a78bfa'] },
  { id: 'plasma-arc', name: tk('Plasma Arc'), colors: ['#38bdf8', '#6366f1'] },
  { id: 'void-rift', name: tk('Void Rift'), colors: ['#7c3aed', '#ec4899'] },
  { id: 'dragon-ember', name: tk('Dragon Ember'), colors: ['#f97316', '#fbbf24'] },
  { id: 'haunted-harvest', name: tk('Haunted Harvest'), season: 'halloween', colors: ['#f97316', '#7c3aed'] },
  { id: 'winter-crystal', name: tk('Winter Crystal'), season: 'winter', colors: ['#bae6fd', '#3b82f6'] },
  { id: 'summer-tide', name: tk('Summer Tide'), season: 'summer', colors: ['#fbbf24', '#06b6d4'] },
];

export const COLLECTION_BY_ID = Object.fromEntries(COLLECTIONS.map((c) => [c.id, c])) as Record<CollectionId, Collection>;

const art = (style: Extract<AvatarSource, { kind: 'art' }>['style'], hue: number, seed: number, extra: Partial<Extract<AvatarSource, { kind: 'art' }>> = {}): AvatarSource => ({
  kind: 'art',
  style,
  hue,
  seed,
  ...extra,
});

export const ITEMS: CosmeticItem[] = [
  /* ---- Avatars ------------------------------------------------------ */
  { id: 'av-aurora-emerald', type: 'avatar', name: tk('Emerald Aurora'), collection: 'essentials', animated: true, avatar: art('aurora', 158, 7, { hue2: 190, animated: true }) },
  { id: 'av-aurora-violet', type: 'avatar', name: tk('Violet Aurora'), collection: 'essentials', animated: true, avatar: art('aurora', 278, 11, { hue2: 320, animated: true }) },
  { id: 'av-facet', type: 'avatar', name: tk('Facet'), collection: 'essentials', avatar: art('facet', 160, 3) },
  { id: 'av-pixel', type: 'avatar', name: tk('Pixel Buddy'), collection: 'essentials', avatar: art('pixel', 168, 42) },
  { id: 'av-orb', type: 'avatar', name: tk('Amber Orb'), collection: 'essentials', avatar: art('orb', 32, 5, { hue2: 350 }) },
  { id: 'av-wave', type: 'avatar', name: tk('Night Waves'), collection: 'essentials', avatar: art('wave', 200, 9, { hue2: 260 }) },
  { id: 'av-rings', type: 'avatar', name: tk('Target Rings'), collection: 'essentials', avatar: art('rings', 340, 2) },
  { id: 'av-pixel-gold', type: 'avatar', name: tk('Golden Pixel'), collection: 'essentials', avatar: art('pixel', 48, 77) },
  { id: 'av-crystal', type: 'avatar', name: tk('Onyx Shard'), collection: 'onyx-fracture', animated: true, avatar: art('motif', 160, 1, { motif: 'crystal', animated: true }) },
  { id: 'av-moon', type: 'avatar', name: tk('Crescent'), collection: 'celestial-orbit', animated: true, avatar: art('motif', 240, 2, { motif: 'moon', animated: true }) },
  { id: 'av-blossom', type: 'avatar', name: tk('Blossom'), collection: 'sakura-dream', avatar: art('motif', 330, 3, { motif: 'blossom' }) },
  { id: 'av-pixel-heart', type: 'avatar', name: tk('Pixel Heart'), collection: 'pixel-arcade', animated: true, avatar: art('motif', 300, 4, { motif: 'pixel-heart', animated: true }) },
  { id: 'av-plasma', type: 'avatar', name: tk('Plasma Core'), collection: 'plasma-arc', animated: true, avatar: art('motif', 200, 5, { motif: 'plasma', animated: true }) },
  { id: 'av-void', type: 'avatar', name: tk('Event Horizon'), collection: 'void-rift', animated: true, avatar: art('motif', 280, 6, { motif: 'void', animated: true }) },
  { id: 'av-flame', type: 'avatar', name: tk('Dragon Flame'), collection: 'dragon-ember', animated: true, avatar: art('motif', 24, 7, { motif: 'flame', animated: true }) },
  { id: 'av-pumpkin', type: 'avatar', name: tk('Jack'), collection: 'haunted-harvest', animated: true, avatar: art('motif', 28, 8, { motif: 'pumpkin', animated: true }) },
  { id: 'av-snowflake', type: 'avatar', name: tk('Snowflake'), collection: 'winter-crystal', animated: true, avatar: art('motif', 205, 9, { motif: 'snowflake', animated: true }) },
  { id: 'av-sun-wave', type: 'avatar', name: tk('Golden Hour'), collection: 'summer-tide', animated: true, avatar: art('motif', 40, 10, { motif: 'sun-wave', animated: true }) },

  /* ---- Avatar decorations ---------------------------------------------- */
  { id: 'aurora', type: 'decoration', name: tk('Aurora Ring'), collection: 'essentials', animated: true },
  { id: 'facet', type: 'decoration', name: tk('Facet'), collection: 'essentials' },
  { id: 'orbit', type: 'decoration', name: tk('Orbit'), collection: 'essentials', animated: true },
  { id: 'pulse', type: 'decoration', name: tk('Pulse'), collection: 'essentials', animated: true },
  { id: 'ember', type: 'decoration', name: tk('Ember Ring'), collection: 'essentials', animated: true },
  { id: 'laurel', type: 'decoration', name: tk('Golden Laurel'), collection: 'prestige' },
  { id: 'crown', type: 'decoration', name: tk('Royal Crown'), collection: 'prestige', animated: true },
  { id: 'headset', type: 'decoration', name: tk('Gaming Headset'), collection: 'neon-nights', animated: true },
  { id: 'neon-ears', type: 'decoration', name: tk('Neon Ears'), collection: 'neon-nights', animated: true },
  { id: 'holo-scan', type: 'decoration', name: tk('Holo Scan'), collection: 'neon-nights', animated: true },
  { id: 'neon-halo', type: 'decoration', name: tk('Neon Halo'), collection: 'neon-nights', animated: true },
  { id: 'onyx-fracture', type: 'decoration', name: tk('Onyx Fracture'), collection: 'onyx-fracture', animated: true },
  { id: 'celestial-orbit', type: 'decoration', name: tk('Celestial Orbit'), collection: 'celestial-orbit', animated: true },
  { id: 'sakura', type: 'decoration', name: tk('Sakura Branch'), collection: 'sakura-dream', animated: true },
  { id: 'pixel-hearts', type: 'decoration', name: tk('Extra Lives'), collection: 'pixel-arcade', animated: true },
  { id: 'plasma-arc', type: 'decoration', name: tk('Plasma Arc'), collection: 'plasma-arc', animated: true },
  { id: 'void-rift', type: 'decoration', name: tk('Void Rift'), collection: 'void-rift', animated: true },
  { id: 'dragon-ember', type: 'decoration', name: tk('Dragon Ember'), collection: 'dragon-ember', animated: true },
  { id: 'haunted-harvest', type: 'decoration', name: tk('Haunted Harvest'), collection: 'haunted-harvest', animated: true },
  { id: 'winter-crystal', type: 'decoration', name: tk('Ice Crown'), collection: 'winter-crystal', animated: true },
  { id: 'summer-tide', type: 'decoration', name: tk('Summer Tide'), collection: 'summer-tide', animated: true },

  /* ---- Profile frames ------------------------------------------------- */
  { id: 'emerald-edge', type: 'frame', name: tk('Emerald Edge'), collection: 'essentials' },
  { id: 'twin-line', type: 'frame', name: tk('Twin Line'), collection: 'essentials' },
  { id: 'glass', type: 'frame', name: tk('Frosted Glass'), collection: 'essentials' },
  { id: 'gilded', type: 'frame', name: tk('Gilded'), collection: 'prestige' },
  { id: 'holo-foil', type: 'frame', name: tk('Holo Foil'), collection: 'prestige', animated: true },
  { id: 'circuit', type: 'frame', name: tk('Circuit'), collection: 'neon-nights', animated: true },
  { id: 'onyx-fracture-frame', type: 'frame', name: tk('Fracture Lines'), collection: 'onyx-fracture', animated: true },
  { id: 'celestial-frame', type: 'frame', name: tk('Star Chart'), collection: 'celestial-orbit', animated: true },
  { id: 'sakura-frame', type: 'frame', name: tk('Blossom Corner'), collection: 'sakura-dream', animated: true },
  { id: 'pixel-frame', type: 'frame', name: tk('8-Bit Border'), collection: 'pixel-arcade' },
  { id: 'plasma-frame', type: 'frame', name: tk('Live Wire'), collection: 'plasma-arc', animated: true },
  { id: 'void-frame', type: 'frame', name: tk('Rift Edge'), collection: 'void-rift', animated: true },
  { id: 'dragon-frame', type: 'frame', name: tk('Dragon Crest'), collection: 'dragon-ember', animated: true },
  { id: 'haunted-frame', type: 'frame', name: tk('Cobweb Corner'), collection: 'haunted-harvest', animated: true },
  { id: 'winter-frame', type: 'frame', name: tk('Icicles'), collection: 'winter-crystal', animated: true },
  { id: 'summer-frame', type: 'frame', name: tk('Shoreline'), collection: 'summer-tide', animated: true },

  /* ---- Profile effects ------------------------------------------------ */
  { id: 'sparks', type: 'effect', name: tk('Sparks'), collection: 'essentials', animated: true },
  { id: 'stars', type: 'effect', name: tk('Stardust'), collection: 'essentials', animated: true },
  { id: 'aurora-veil', type: 'effect', name: tk('Aurora Veil'), collection: 'essentials', animated: true },
  { id: 'snow', type: 'effect', name: tk('Snow'), collection: 'essentials', animated: true },
  { id: 'crystal-shatter', type: 'effect', name: tk('Crystal Shatter'), collection: 'onyx-fracture', animated: true },
  { id: 'shooting-stars', type: 'effect', name: tk('Shooting Stars'), collection: 'celestial-orbit', animated: true },
  { id: 'sakura-petals', type: 'effect', name: tk('Drifting Petals'), collection: 'sakura-dream', animated: true },
  { id: 'pixel-confetti', type: 'effect', name: tk('Pixel Confetti'), collection: 'pixel-arcade', animated: true },
  { id: 'plasma-storm', type: 'effect', name: tk('Plasma Storm'), collection: 'plasma-arc', animated: true },
  { id: 'void-open', type: 'effect', name: tk('Opening Rift'), collection: 'void-rift', animated: true },
  { id: 'ember-rise', type: 'effect', name: tk('Rising Embers'), collection: 'dragon-ember', animated: true },
  { id: 'haunted-night', type: 'effect', name: tk('Bat Flight'), collection: 'haunted-harvest', animated: true },
  { id: 'winter-snowfall', type: 'effect', name: tk('Snowfall'), collection: 'winter-crystal', animated: true },
  { id: 'summer-shimmer', type: 'effect', name: tk('Light Reflections'), collection: 'summer-tide', animated: true },
  { id: 'fireflies', type: 'effect', name: tk('Fireflies'), collection: 'summer-tide', animated: true },

  /* ---- Banners -------------------------------------------------------- */
  { id: 'emerald-aurora', type: 'banner', name: tk('Emerald Aurora'), collection: 'essentials', animated: true },
  { id: 'silk-flow', type: 'banner', name: tk('Silk Flow'), collection: 'essentials', animated: true },
  { id: 'synthwave', type: 'banner', name: tk('Synthwave'), collection: 'neon-nights', animated: true },
  { id: 'neon-rain', type: 'banner', name: tk('Neon Rain'), collection: 'neon-nights', animated: true },
  { id: 'nebula', type: 'banner', name: tk('Nebula'), collection: 'essentials', animated: true },
  { id: 'night-ridge', type: 'banner', name: tk('Night Ridge'), collection: 'celestial-orbit', animated: true },
  { id: 'prism-glass', type: 'banner', name: tk('Prism Glass'), collection: 'prestige', animated: true },
  { id: 'ember', type: 'banner', name: tk('Embers'), collection: 'essentials', animated: true },
  { id: 'facets', type: 'banner', name: tk('Facets'), collection: 'essentials' },
  { id: 'ocean', type: 'banner', name: tk('Deep Sea'), collection: 'essentials' },
  { id: 'dusk', type: 'banner', name: tk('Dusk'), collection: 'essentials' },
  { id: 'graphite', type: 'banner', name: tk('Graphite'), collection: 'essentials' },
  { id: 'carbon', type: 'banner', name: tk('Carbon Weave'), collection: 'essentials' },
  { id: 'topography', type: 'banner', name: tk('Topography'), collection: 'essentials' },
  { id: 'onyx-fracture-banner', type: 'banner', name: tk('Onyx Fracture'), collection: 'onyx-fracture', animated: true },
  { id: 'celestial', type: 'banner', name: tk('Night Sky'), collection: 'celestial-orbit', animated: true },
  { id: 'sakura-banner', type: 'banner', name: tk('Sakura Sky'), collection: 'sakura-dream', animated: true },
  { id: 'pixel-city', type: 'banner', name: tk('Pixel City'), collection: 'pixel-arcade', animated: true },
  { id: 'plasma', type: 'banner', name: tk('Plasma Field'), collection: 'plasma-arc', animated: true },
  { id: 'void-rift-banner', type: 'banner', name: tk('Void Rift'), collection: 'void-rift', animated: true },
  { id: 'dragon-ember-banner', type: 'banner', name: tk('Dragon Scales'), collection: 'dragon-ember', animated: true },
  { id: 'haunted-banner', type: 'banner', name: tk('Harvest Moon'), collection: 'haunted-harvest', animated: true },
  { id: 'winter-banner', type: 'banner', name: tk('Frozen Peaks'), collection: 'winter-crystal', animated: true },
  { id: 'summer-banner', type: 'banner', name: tk('Sunset Sea'), collection: 'summer-tide', animated: true },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [`${i.type}:${i.id}`, i]));
export const itemsOf = (type: CosmeticType) => ITEMS.filter((i) => i.type === type);
export const findItem = (type: CosmeticType, id: string | undefined) => (id ? ITEM_BY_ID.get(`${type}:${id}`) : undefined);

/* ------------------------------------------------------------------ */
/* Profile colours                                                      */
/* ------------------------------------------------------------------ */

export const PALETTES: { id: string; name: string; colors: string[] }[] = [
  { id: 'onyx', name: tk('Onyx'), colors: ['#0f2a22', '#0b1512'] },
  { id: 'emerald', name: tk('Emerald'), colors: ['#10b981', '#064e3b'] },
  { id: 'midnight', name: tk('Midnight'), colors: ['#1e3a5f', '#0b1622'] },
  { id: 'amethyst', name: tk('Amethyst'), colors: ['#4c1d95', '#1a0b2e'] },
  { id: 'crimson', name: tk('Crimson'), colors: ['#7f1d1d', '#1f0a0a'] },
  { id: 'copper', name: tk('Copper'), colors: ['#78350f', '#1c1206'] },
  { id: 'slate', name: tk('Slate'), colors: ['#334155', '#0f172a'] },
  { id: 'lagoon', name: tk('Lagoon'), colors: ['#155e75', '#04232b'] },
  { id: 'aurora', name: tk('Aurora'), colors: ['#0f766e', '#4338ca', '#831843'] },
  { id: 'sunset', name: tk('Sunset'), colors: ['#c2410c', '#9d174d', '#3b0764'] },
  { id: 'sakura', name: tk('Sakura'), colors: ['#9d174d', '#4a044e'] },
  { id: 'ice', name: tk('Glacier'), colors: ['#0c4a6e', '#1e293b', '#0f172a'] },
  { id: 'toxic', name: tk('Toxic'), colors: ['#3f6212', '#052e16'] },
  { id: 'gold', name: tk('Royal Gold'), colors: ['#a16207', '#422006'] },
  { id: 'void', name: tk('Void'), colors: ['#581c87', '#020617', '#701a75'] },
  { id: 'harvest', name: tk('Harvest'), colors: ['#9a3412', '#3b0764'] },
  { id: 'cobalt', name: tk('Cobalt'), colors: ['#1d4ed8', '#0b1230'] },
  { id: 'pearl', name: tk('Pearl'), colors: ['#cbd5e1', '#64748b', '#1e293b'] },
];

/* ------------------------------------------------------------------ */
/* Display name styles                                                  */
/* ------------------------------------------------------------------ */

export const NAME_FONTS: { id: NameStyle['font']; name: string; family: string; weight: number }[] = [
  { id: 'default', name: tk('Modern'), family: FLAGS + "'Inter Variable', sans-serif", weight: 700 },
  { id: 'heavy', name: tk('Heavy'), family: FLAGS + "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", weight: 900 },
  { id: 'grotesk', name: tk('Grotesk'), family: FLAGS + "'Space Grotesk Variable', 'Inter Variable', sans-serif", weight: 700 },
  { id: 'elegant', name: tk('Elegant'), family: FLAGS + "'Playfair Display Variable', Georgia, serif", weight: 700 },
  { id: 'playful', name: tk('Playful'), family: FLAGS + "'Fredoka Variable', 'Inter Variable', sans-serif", weight: 650 },
  { id: 'tech', name: tk('Angular'), family: FLAGS + "'Orbitron Variable', 'Inter Variable', sans-serif", weight: 700 },
  { id: 'pixel', name: tk('Pixel'), family: FLAGS + "'Pixelify Sans Variable', monospace", weight: 600 },
  { id: 'ornate', name: tk('Ornamental'), family: FLAGS + "'Cinzel Decorative', Georgia, serif", weight: 700 },
  { id: 'gothic', name: tk('Gothic'), family: FLAGS + "'UnifrakturMaguntia', Georgia, serif", weight: 400 },
  { id: 'script', name: tk('Handwritten'), family: FLAGS + "'Caveat Variable', cursive", weight: 700 },
  { id: 'arcade', name: tk('Arcade'), family: FLAGS + "'Bungee', 'Inter Variable', sans-serif", weight: 400 },
  { id: 'mono', name: tk('Mono'), family: FLAGS + "'JetBrains Mono Variable', monospace", weight: 700 },
];

export const NAME_EFFECTS: { id: NameStyle['effect']; name: string; animated?: boolean; minColors: number }[] = [
  { id: 'solid', name: tk('Solid'), minColors: 1 },
  { id: 'gradient', name: tk('Gradient'), minColors: 2 },
  { id: 'outline', name: tk('Outline'), minColors: 1 },
  { id: 'metallic', name: tk('Metallic'), minColors: 1 },
  { id: 'neon', name: tk('Neon'), minColors: 1 },
  { id: 'prism', name: tk('Prism'), animated: true, minColors: 0 },
  { id: 'shimmer', name: tk('Shimmer'), animated: true, minColors: 1 },
  { id: 'pop', name: tk('Pop'), minColors: 2 },
];

export const NAME_COLORS = ['#f1f5f6', '#10b981', '#34d399', '#2dd4bf', '#38bdf8', '#3b82f6', '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#f97316', '#fbbf24', '#a3e635'];

export const NAME_PRESETS: { id: string; name: string; style: NameStyle }[] = [
  { id: 'emerald-glow', name: tk('Emerald Glow'), style: { font: 'default', effect: 'neon', colors: ['#34d399'] } },
  { id: 'velocity', name: tk('Velocity'), style: { font: 'heavy', effect: 'gradient', colors: ['#ffffff', '#c7d8ff', '#60a5fa'], italic: true, uppercase: true } },
  { id: 'onyx-chrome', name: tk('Onyx Chrome'), style: { font: 'grotesk', effect: 'metallic', colors: ['#cbd5e1'] } },
  { id: 'royal', name: tk('Royal'), style: { font: 'ornate', effect: 'metallic', colors: ['#fbbf24'] } },
  { id: 'synth', name: tk('Synth Pop'), style: { font: 'tech', effect: 'gradient', colors: ['#f472b6', '#818cf8', '#38bdf8'] } },
  { id: 'impact', name: tk('Impact'), style: { font: 'heavy', effect: 'solid', colors: ['#34d399'], uppercase: true } },
  { id: 'arcade', name: tk('Arcade Hero'), style: { font: 'pixel', effect: 'pop', colors: ['#fde047', '#7c3aed'] } },
  { id: 'sakura', name: tk('Sakura Ink'), style: { font: 'script', effect: 'gradient', colors: ['#fbcfe8', '#f472b6'] } },
  { id: 'toxic', name: tk('Toxic'), style: { font: 'arcade', effect: 'neon', colors: ['#a3e635'] } },
  { id: 'ice', name: tk('Frostbite'), style: { font: 'elegant', effect: 'shimmer', colors: ['#bae6fd'] } },
  { id: 'prism', name: tk('Prism'), style: { font: 'playful', effect: 'prism', colors: [] } },
  { id: 'gothic', name: tk('Nightfall'), style: { font: 'gothic', effect: 'outline', colors: ['#c084fc'] } },
  { id: 'creator-gold', name: tk('Creator Gold'), style: { font: 'grotesk', effect: 'shimmer', colors: ['#fcd34d', '#f59e0b'] } },
  { id: 'night-shift', name: tk('Night Shift'), style: { font: 'heavy', effect: 'neon', colors: ['#f472b6'], italic: true } },
];

export const DEFAULT_NAME_STYLE: NameStyle = { font: 'default', effect: 'solid', colors: [] };

export const BORDER_LINE_COLORS: { id: string; name: string; colors: [string, string] }[] = [
  { id: 'emerald', name: tk('Emerald'), colors: ['#10b981', '#6ee7b7'] },
  { id: 'blue', name: tk('Electric Blue'), colors: ['#3b82f6', '#93c5fd'] },
  { id: 'violet', name: tk('Violet'), colors: ['#8b5cf6', '#f0abfc'] },
  { id: 'rose', name: tk('Rose'), colors: ['#f43f5e', '#fda4af'] },
  { id: 'gold', name: tk('Gold'), colors: ['#f59e0b', '#fef3c7'] },
  { id: 'ice', name: tk('Ice'), colors: ['#22d3ee', '#ecfeff'] },
  { id: 'white', name: tk('Moonlight'), colors: ['#e2e8f0', '#ffffff'] },
];

export function eventStatus(e: EventWindow, now = Date.now()): 'upcoming' | 'live' | 'ended' {
  const start = new Date(`${e.start}T00:00:00`).getTime();
  const end = new Date(`${e.end}T23:59:59`).getTime();
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'live';
}
