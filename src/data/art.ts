/**
 * Generated artwork used by the demo: banner presets, avatar frames, profile
 * effects, custom emojis and sample images. Everything is local SVG/CSS so the
 * app works offline and has no third-party image dependencies.
 */
export const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;

/* ------------------------------------------------------------------ */
/* Personalisation catalogues                                           */
/* ------------------------------------------------------------------ */

export const ROLE_COLORS = [
  '#10b981',
  '#34d399',
  '#2dd4bf',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#c084fc',
  '#f472b6',
  '#fb7185',
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#a3e635',
  '#94a3b8',
  '#e2e8f0',
];

export const AVATAR_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#14b8a6', '#6366f1', '#64748b', '#0ea5e9'];

export const SERVER_COLORS = ['#10b981', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#14b8a6', '#64748b'];

/* ------------------------------------------------------------------ */
/* ONYX mark                                                            */
/* ------------------------------------------------------------------ */

const GEM_PATHS = `
  <path d="M8 2h8l4 4v12l-4 4H8l-4-4V6z" fill="#10B981"/>
  <path d="M8 2h8l-2 4.5h-4z" fill="#6EE7B7"/>
  <path d="M4 6l4.5 2.5v7L4 18z" fill="#34D399"/>
  <path d="M20 6l-4.5 2.5v7L20 18z" fill="#059669"/>
  <path d="M8 22h8l-2-4.5h-4z" fill="#047857"/>
  <path d="M10 6.5h4l1.5 2v7l-1.5 2h-4l-1.5-2v-7z" fill="#10B981"/>
  <path d="M10 6.5h4l1.5 2h-7z" fill="#A7F3D0" opacity=".55"/>`;

/* ------------------------------------------------------------------ */
/* Custom emojis (free to use in every server on ONYX)                  */
/* ------------------------------------------------------------------ */

export const EMOJI_ART = {
  onyx: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${GEM_PATHS}</svg>`),
  gg: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34D399"/><stop offset="1" stop-color="#047857"/></linearGradient></defs><rect x="2" y="8" width="60" height="48" rx="14" fill="url(#g)"/><rect x="2" y="8" width="60" height="24" rx="14" fill="#fff" opacity=".12"/><text x="32" y="44" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="30" font-style="italic" fill="#03130C">GG</text></svg>`,
  ),
  w: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#10B981"/><circle cx="32" cy="32" r="29" fill="none" stroke="#6EE7B7" stroke-width="3"/><text x="32" y="44" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="34" fill="#fff">W</text></svg>`,
  ),
  crown: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDE68A"/><stop offset="1" stop-color="#D97706"/></linearGradient></defs><path d="M8 22l12 10 12-18 12 18 12-10-5 28H13z" fill="url(#c)" stroke="#92400E" stroke-width="2" stroke-linejoin="round"/><rect x="13" y="48" width="38" height="7" rx="2" fill="#B45309"/><circle cx="32" cy="36" r="4" fill="#10B981"/><circle cx="8" cy="20" r="3.5" fill="#FBBF24"/><circle cx="56" cy="20" r="3.5" fill="#FBBF24"/><circle cx="32" cy="12" r="3.5" fill="#FBBF24"/></svg>`,
  ),
  heart: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6EE7B7"/><stop offset=".5" stop-color="#10B981"/><stop offset="1" stop-color="#065F46"/></linearGradient></defs><path d="M32 56S6 40 6 22c0-8 6-14 13-14 6 0 10 3 13 8 3-5 7-8 13-8 7 0 13 6 13 14 0 18-26 34-26 34z" fill="url(#h)"/><path d="M17 16c-4 1-6 5-6 8" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".6"/></svg>`,
  ),
  hype: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#047857"/><stop offset=".55" stop-color="#10B981"/><stop offset="1" stop-color="#A7F3D0"/></linearGradient></defs><path d="M32 4c4 12 18 18 18 34a18 18 0 0 1-36 0c0-9 5-14 8-18 1 6 4 9 7 10-2-10 0-19 3-26z" fill="url(#f)"/><path d="M32 30c3 6 9 9 9 17a9 9 0 0 1-18 0c0-5 3-8 5-10 0 3 2 5 4 5-1-5-1-8 0-12z" fill="#D1FAE5"/></svg>`,
  ),
  salute: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="34" r="26" fill="#FCD34D"/><circle cx="23" cy="32" r="3.5" fill="#3F2A0A"/><circle cx="41" cy="32" r="3.5" fill="#3F2A0A"/><path d="M22 44q10 7 20 0" stroke="#3F2A0A" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M8 14l22 10-4 6L6 20z" fill="#F59E0B" stroke="#B45309" stroke-width="2" stroke-linejoin="round"/></svg>`,
  ),
  lfg: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="14" width="56" height="36" rx="10" fill="#0F1417" stroke="#10B981" stroke-width="3"/><text x="32" y="40" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="20" fill="#34D399">LFG</text></svg>`,
  ),
} as const;

export const GEM_SVG_INLINE = GEM_PATHS;

/* ------------------------------------------------------------------ */
/* Server icons                                                         */
/* ------------------------------------------------------------------ */

export const SERVER_ICONS = {
  onyx: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><radialGradient id="bg" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#16312a"/><stop offset="1" stop-color="#090d0f"/></radialGradient></defs><rect width="96" height="96" fill="url(#bg)"/><g transform="translate(24 24) scale(2)">${GEM_PATHS}</g></svg>`,
  ),
  scrims: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient></defs><rect width="96" height="96" fill="url(#s)"/><path d="M48 18l26 10v18c0 16-11 27-26 32-15-5-26-16-26-32V28z" fill="none" stroke="#e9d5ff" stroke-width="5" stroke-linejoin="round"/><path d="M38 50l7 7 14-16" stroke="#fde047" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ),
  lateNight: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1a3a"/><stop offset="1" stop-color="#3b1d5e"/></linearGradient></defs><rect width="96" height="96" fill="url(#n)"/><circle cx="58" cy="38" r="18" fill="#fef3c7"/><circle cx="67" cy="32" r="16" fill="#132048"/><circle cx="24" cy="24" r="2" fill="#fff"/><circle cx="34" cy="60" r="1.5" fill="#fff"/><circle cx="76" cy="66" r="2" fill="#fff" opacity=".8"/><circle cx="18" cy="70" r="1.2" fill="#fff"/><path d="M0 78q24-12 48 0t48 0v18H0z" fill="#0a0f24"/></svg>`,
  ),
  valorant: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1a0d10"/><path d="M14 22l34 52h-20L14 52z" fill="#ff4655"/><path d="M82 22L56 62H40l42-40z" fill="#ff4655" opacity=".85"/></svg>`,
  ),
  smp: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#14532d"/><rect y="48" width="96" height="48" fill="#713f12"/><rect y="40" width="96" height="12" fill="#22c55e"/><rect x="16" y="56" width="12" height="12" fill="#854d0e"/><rect x="56" y="68" width="12" height="12" fill="#a16207"/><rect x="40" y="16" width="16" height="24" fill="#166534"/><rect x="32" y="8" width="32" height="16" fill="#15803d"/><rect x="72" y="20" width="8" height="8" fill="#fef9c3" opacity=".8"/></svg>`,
  ),
} as const;

/* ------------------------------------------------------------------ */
/* Sample images for messages and embeds                                */
/* ------------------------------------------------------------------ */

export const SAMPLE_IMAGES = {
  victory: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a5e"/><stop offset=".55" stop-color="#b4467a"/><stop offset="1" stop-color="#f7a35c"/></linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4d6"/><stop offset="1" stop-color="#ffb46a" stop-opacity="0"/></radialGradient>
    <linearGradient id="storm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".55"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#sky)"/>
  <circle cx="860" cy="380" r="220" fill="url(#sun)"/>
  <rect x="0" y="0" width="260" height="720" fill="url(#storm)"/>
  <path d="M0 470 L140 380 L260 430 L420 330 L560 420 L700 360 L860 440 L1010 350 L1160 420 L1280 380 V720 H0Z" fill="#3b2459"/>
  <path d="M0 540 L180 470 L330 520 L520 450 L700 520 L880 470 L1060 530 L1280 480 V720 H0Z" fill="#24183d"/>
  <path d="M0 620 L240 570 L520 610 L800 560 L1080 610 L1280 580 V720 H0Z" fill="#150f26"/>
  <rect x="1060" y="24" width="196" height="196" rx="14" fill="#0d0a18" opacity=".72" stroke="#ffffff" stroke-opacity=".25"/>
  <circle cx="1158" cy="122" r="64" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3"/>
  <circle cx="1170" cy="110" r="5" fill="#fde047"/>
  <rect x="40" y="636" width="300" height="16" rx="8" fill="#0d0a18" opacity=".7"/>
  <rect x="40" y="636" width="300" height="16" rx="8" fill="#4ade80"/>
  <rect x="40" y="662" width="300" height="16" rx="8" fill="#0d0a18" opacity=".7"/>
  <rect x="40" y="662" width="210" height="16" rx="8" fill="#60a5fa"/>
  <text x="640" y="250" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-style="italic" font-size="150" fill="#fff" stroke="#2a1a5e" stroke-width="6" paint-order="stroke">#1</text>
  <text x="640" y="330" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-style="italic" font-size="58" letter-spacing="6" fill="#fde047" stroke="#2a1a5e" stroke-width="4" paint-order="stroke">VICTORY IN THE FINAL</text>
  <text x="1236" y="252" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="26" fill="#fff">12 ELIMS · 1 LEFT</text>
</svg>`),
  dropMap: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700">
  <rect width="1000" height="700" fill="#0b2a3f"/>
  <g opacity=".18" stroke="#fff"><path d="M0 100H1000M0 200H1000M0 300H1000M0 400H1000M0 500H1000M0 600H1000M100 0V700M200 0V700M300 0V700M400 0V700M500 0V700M600 0V700M700 0V700M800 0V700M900 0V700"/></g>
  <path d="M170 160 Q300 70 480 110 T780 140 Q880 220 850 360 T760 590 Q600 650 430 610 T180 520 Q100 400 130 280 T170 160Z" fill="#3f7d4a" stroke="#c7e7b4" stroke-width="4"/>
  <path d="M300 250 Q380 200 470 260 T620 300 Q680 380 600 450 T420 470 Q330 420 300 250Z" fill="#5a9a52"/>
  <path d="M640 180 Q720 170 760 230 Q740 290 680 280 Q630 240 640 180Z" fill="#d9c58b"/>
  <path d="M220 470 Q300 440 360 500 Q330 560 260 540Z" fill="#8a9a9a"/>
  <path d="M120 80 L900 620" stroke="#fde047" stroke-width="5" stroke-dasharray="14 12"/>
  <g font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="22" fill="#fff" stroke="#0b2a3f" stroke-width="5" paint-order="stroke">
    <text x="660" y="232">DUSTVALE</text><text x="410" y="330">COOLING WORKS</text><text x="210" y="500">QUARRY</text><text x="560" y="560">HARBOR</text><text x="230" y="200">LIGHTHOUSE</text>
  </g>
  <g stroke="#fff" stroke-width="4"><circle cx="700" cy="250" r="22" fill="#10b981"/><circle cx="450" cy="350" r="22" fill="#f43f5e"/><circle cx="260" cy="520" r="22" fill="#3b82f6"/><circle cx="600" cy="580" r="22" fill="#f59e0b"/><circle cx="280" cy="220" r="22" fill="#a855f7"/></g>
  <g font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="18" fill="#fff" text-anchor="middle"><text x="700" y="257">1</text><text x="450" y="357">2</text><text x="260" y="527">3</text><text x="600" y="587">4</text><text x="280" y="227">5</text></g>
  <rect x="24" y="24" width="250" height="44" rx="10" fill="#06131d" opacity=".85"/>
  <text x="44" y="53" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="20" fill="#fff">Drop spots · Week 42</text>
</svg>`),
  setup: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
  <defs>
    <radialGradient id="glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#10b981" stop-opacity=".45"/><stop offset="1" stop-color="#10b981" stop-opacity="0"/></radialGradient>
    <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f3d31"/><stop offset="1" stop-color="#05140f"/></linearGradient>
    <linearGradient id="rgb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10b981"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>
  </defs>
  <rect width="1200" height="800" fill="#07090b"/>
  <rect width="1200" height="800" fill="url(#glow)"/>
  <rect x="0" y="560" width="1200" height="240" fill="#121417"/>
  <rect x="0" y="556" width="1200" height="8" fill="#1c2024"/>
  <rect x="300" y="150" width="600" height="340" rx="14" fill="#0a0c0e" stroke="#2a2f34" stroke-width="6"/>
  <rect x="318" y="168" width="564" height="304" rx="6" fill="url(#scr)"/>
  <g transform="translate(560 250) scale(3.4)">${GEM_PATHS}</g>
  <rect x="580" y="490" width="40" height="50" fill="#1c2024"/>
  <rect x="500" y="536" width="200" height="14" rx="6" fill="#23282d"/>
  <rect x="380" y="610" width="440" height="70" rx="12" fill="#16191c" stroke="#262b30" stroke-width="3"/>
  <rect x="380" y="676" width="440" height="6" rx="3" fill="url(#rgb)"/>
  <rect x="870" y="620" width="70" height="104" rx="34" fill="#16191c" stroke="#262b30" stroke-width="3"/>
  <rect x="900" y="636" width="10" height="22" rx="5" fill="#10b981"/>
  <rect x="120" y="300" width="110" height="260" rx="10" fill="#101316" stroke="#23282d" stroke-width="3"/>
  <circle cx="175" cy="360" r="30" fill="none" stroke="url(#rgb)" stroke-width="5"/>
  <circle cx="175" cy="450" r="30" fill="none" stroke="url(#rgb)" stroke-width="5"/>
  <path d="M1000 560 L1000 300 Q1000 270 1030 260 L1080 240" stroke="#2a2f34" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M1060 228 L1120 228 L1100 270 L1040 270Z" fill="#2a2f34"/>
  <path d="M1040 270 L1100 270 L1170 420 L970 420Z" fill="#fde68a" opacity=".08"/>
</svg>`),
  patchNotes: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 500">
  <defs>
    <radialGradient id="a" cx=".25" cy=".3" r=".8"><stop offset="0" stop-color="#10b981" stop-opacity=".55"/><stop offset=".6" stop-color="#10b981" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx=".85" cy=".9" r=".6"><stop offset="0" stop-color="#2dd4bf" stop-opacity=".35"/><stop offset="1" stop-color="#2dd4bf" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="500" fill="#090c0e"/>
  <rect width="1200" height="500" fill="url(#a)"/>
  <rect width="1200" height="500" fill="url(#b)"/>
  <g opacity=".08" stroke="#fff"><path d="M0 125H1200M0 250H1200M0 375H1200M300 0V500M600 0V500M900 0V500"/></g>
  <g transform="translate(140 150) scale(8.4)">${GEM_PATHS}</g>
  <text x="420" y="230" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-style="italic" font-size="110" letter-spacing="-4" fill="#fff">ONYX</text>
  <text x="426" y="300" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="40" fill="#6ee7b7">Version 0.1 · First preview</text>
  <text x="426" y="360" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="28" fill="#9aa7ad">Animated profiles · Custom emojis · Servers · Voice rooms</text>
</svg>`),
  shop: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1a16"/><stop offset="1" stop-color="#05080a"/></linearGradient>
    <radialGradient id="g1" cx=".8" cy=".2" r=".7"><stop offset="0" stop-color="#10b981" stop-opacity=".5"/><stop offset="1" stop-color="#10b981" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="520" fill="url(#bg)"/>
  <rect width="1200" height="520" fill="url(#g1)"/>
  <g transform="translate(70 70)">
    <rect width="300" height="380" rx="24" fill="#0f1417" stroke="#1f2a2f" stroke-width="3"/>
    <rect x="20" y="20" width="260" height="200" rx="16" fill="#152e27"/>
    <g transform="translate(110 80) scale(3.4)">${GEM_PATHS}</g>
    <rect x="20" y="246" width="180" height="20" rx="10" fill="#d3dadd"/>
    <rect x="20" y="280" width="120" height="16" rx="8" fill="#5e6a71"/>
    <rect x="20" y="320" width="110" height="40" rx="12" fill="#10b981"/>
  </g>
  <g transform="translate(450 110)" opacity=".9">
    <rect width="260" height="330" rx="22" fill="#0f1417" stroke="#1f2a2f" stroke-width="3"/>
    <rect x="18" y="18" width="224" height="170" rx="14" fill="#1b2340"/>
    <circle cx="130" cy="103" r="44" fill="none" stroke="#818cf8" stroke-width="10"/>
    <rect x="18" y="210" width="160" height="18" rx="9" fill="#d3dadd"/>
    <rect x="18" y="242" width="100" height="14" rx="7" fill="#5e6a71"/>
    <rect x="18" y="276" width="96" height="36" rx="11" fill="#1f2a2f"/>
  </g>
  <g transform="translate(790 150)" opacity=".75">
    <rect width="230" height="290" rx="20" fill="#0f1417" stroke="#1f2a2f" stroke-width="3"/>
    <rect x="16" y="16" width="198" height="150" rx="12" fill="#3a1d2a"/>
    <path d="M115 50l14 30 32 4-24 22 6 32-28-16-28 16 6-32-24-22 32-4z" fill="#fb7185"/>
    <rect x="16" y="186" width="140" height="16" rx="8" fill="#d3dadd"/>
    <rect x="16" y="214" width="90" height="12" rx="6" fill="#5e6a71"/>
  </g>
</svg>`),
  meme: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#111518"/>
  <rect x="0" y="0" width="800" height="400" fill="#1d2a24"/>
  <rect x="0" y="400" width="800" height="400" fill="#13221c"/>
  <text x="40" y="90" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="40" fill="#fff">Me: “just one more round”</text>
  <text x="40" y="490" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="40" fill="#fff">The clock:</text>
  <circle cx="400" cy="250" r="110" fill="#fcd34d"/><circle cx="360" cy="230" r="14" fill="#1f2937"/><circle cx="440" cy="230" r="14" fill="#1f2937"/><path d="M350 290q50 35 100 0" stroke="#1f2937" stroke-width="12" fill="none" stroke-linecap="round"/>
  <circle cx="400" cy="640" r="120" fill="#f8fafc" stroke="#94a3b8" stroke-width="10"/>
  <path d="M400 640 V560 M400 640 L455 668" stroke="#0f172a" stroke-width="12" stroke-linecap="round"/>
  <text x="400" y="545" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="28" fill="#0f172a">12</text>
  <text x="640" y="700" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="64" fill="#10b981">4:12</text>
</svg>`),
} as const;

/* ------------------------------------------------------------------ */
/* Server badges of the demo servers (server content, not ONYX badges)  */
/* ------------------------------------------------------------------ */

export const SERVER_BADGE_ART = {
  clip: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect x="6" y="6" width="52" height="52" rx="16" fill="url(#a)"/><rect x="15" y="20" width="26" height="24" rx="5" fill="#fff" opacity=".95"/><path d="M41 28l9-5v18l-9-5z" fill="#fff" opacity=".95"/><circle cx="23" cy="32" r="3" fill="#7c3aed"/></svg>`,
  ),
  helper: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><circle cx="32" cy="32" r="27" fill="url(#h)"/><circle cx="32" cy="32" r="16" fill="none" stroke="#fff" stroke-width="7"/><path d="M20 20l6 6M44 20l-6 6M20 44l6-6M44 44l-6-6" stroke="#bae6fd" stroke-width="7" stroke-linecap="round"/></svg>`,
  ),
  event: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><path d="M32 4l7.5 15.2 16.8 2.4-12.1 11.8 2.9 16.7L32 42.2 16.9 50.1l2.9-16.7L7.7 21.6l16.8-2.4z" fill="url(#e)" stroke="#fff7ed" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="28" r="6" fill="#fff7ed" opacity=".9"/></svg>`,
  ),
  champion: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs><path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z" fill="url(#t)"/><path d="M18 13H9c0 8 4 13 10 14M46 13h9c0 8-4 13-10 14" fill="none" stroke="#f59e0b" stroke-width="4"/><rect x="28" y="37" width="8" height="9" fill="#d97706"/><rect x="18" y="46" width="28" height="9" rx="3" fill="#a78bfa"/></svg>`,
  ),
  caster: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#831843"/><rect x="24" y="12" width="16" height="26" rx="8" fill="#f9a8d4"/><path d="M17 31c0 9 7 15 15 15s15-6 15-15" fill="none" stroke="#fbcfe8" stroke-width="4" stroke-linecap="round"/><path d="M32 46v7M24 53h16" stroke="#fbcfe8" stroke-width="4" stroke-linecap="round"/></svg>`,
  ),
} as const;
