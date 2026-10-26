/**
 * Profile effects: animated overlays above the profile card. Each one is its
 * own small scene rather than a recoloured particle system.
 */
import { memo, useId, useMemo, type CSSProperties, type ReactElement } from 'react';
import { cn, hashString } from '../../lib/utils';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function seeded(n: number, key: string) {
  return Array.from({ length: n }, (_, i) => {
    const h = hashString(`${key}${i}`);
    return {
      i,
      a: (h % 1000) / 1000,
      b: ((h >>> 10) % 1000) / 1000,
      c: ((h >>> 20) % 1000) / 1000,
    };
  });
}

/* ---- Classic particles (essentials) -------------------------------- */
function Particles({ kind }: { kind: 'sparks' | 'stars' | 'snow' }) {
  const list = useMemo(() => seeded(kind === 'snow' ? 22 : 16, kind), [kind]);
  return (
    <>
      {list.map((p) => (
        <span
          key={p.i}
          className="fx-particle"
          style={{ left: `${p.a * 100}%`, scale: String(0.6 + p.b * 0.6), '--fx-delay': `${-p.c * 5}s`, '--fx-dur': `${4 + p.b * 3}s`, '--fx-x': `${(p.a - 0.5) * 60}px` } as Vars}
        />
      ))}
    </>
  );
}

/* ---- Crystal shatter -------------------------------------------------- */
function CrystalShatter() {
  const shards = useMemo(() => seeded(14, 'shard'), []);
  return (
    <>
      <span className="fxs-flash" />
      {shards.map((p) => {
        const angle = p.a * Math.PI * 2;
        const dist = 90 + p.b * 110;
        return (
          <span
            key={p.i}
            className="fxs-shard"
            style={
              {
                '--dx': `${Math.cos(angle) * dist}px`,
                '--dy': `${Math.sin(angle) * dist * 0.8}px`,
                '--rot': `${(p.c - 0.5) * 540}deg`,
                '--size': `${6 + p.b * 10}px`,
                animationDelay: `${p.c * 0.25}s`,
              } as Vars
            }
          />
        );
      })}
    </>
  );
}

/* ---- Plasma storm ----------------------------------------------------- */
const BOLTS = ['M20 0 L28 40 L18 46 L30 92 L22 98 L34 150', 'M140 0 L132 34 L144 40 L128 86 L140 92 L126 140', 'M250 0 L258 30 L246 38 L262 80 L250 86 L266 128', 'M300 20 L290 48 L304 54 L286 96'];
function PlasmaStorm() {
  return (
    <>
      <span className="fxp-haze" />
      <svg className="fxp-svg" viewBox="0 0 340 300" preserveAspectRatio="none">
        {BOLTS.map((d, i) => (
          <g key={i} className="fxp-bolt" style={{ animationDelay: `${i * 0.9}s` }}>
            <path d={d} fill="none" stroke="#38bdf8" strokeWidth="6" strokeOpacity=".35" strokeLinejoin="round" />
            <path d={d} fill="none" stroke="#f0f9ff" strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        ))}
      </svg>
    </>
  );
}

/* ---- Void rift opening ----------------------------------------------- */
/**
 * A tear opens across the right part of the banner – away from avatar, name
 * and badges: a crack draws itself, splits into a glowing lens that shows a
 * deep starfield behind it, pulls in motes of light and seals again.
 * Drawn along the x axis and rotated, so the lens opens perpendicular to it.
 */
function lensPath(half: number, width: number, jag: number) {
  const n = 14;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -half + t * half * 2;
    const w = Math.sin(Math.PI * t) ** 0.8 * width;
    const j = i === 0 || i === n ? 0 : ((i * 37) % 7) / 7 - 0.5;
    top.push(`${x.toFixed(1)} ${(-w - j * jag).toFixed(1)}`);
    bottom.unshift(`${x.toFixed(1)} ${(w - (((i * 53) % 5) / 5) * jag + jag / 2).toFixed(1)}`);
  }
  return `M${top.join(' L')} L${bottom.join(' L')}Z`;
}

const RIFT_LENS = lensPath(80, 15, 3.2);
const RIFT_CRACK = lensPath(80, 0, 3.2).split('L').slice(0, 15).join('L');

function VoidOpen() {
  const u = useId().replace(/:/g, '');
  const stars = useMemo(() => seeded(26, 'riftstars'), []);
  const motes = useMemo(() => seeded(10, 'riftmotes'), []);
  return (
    <svg className="fxv-stage" viewBox="0 0 200 100" aria-hidden>
      <defs>
        <radialGradient id={`${u}in`} cx=".5" cy=".5" r=".6">
          <stop offset="0" stopColor="#05010d" />
          <stop offset=".55" stopColor="#1e0b3b" />
          <stop offset="1" stopColor="#7c3aed" />
        </radialGradient>
        <linearGradient id={`${u}rim`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c026d3" stopOpacity="0" />
          <stop offset=".2" stopColor="#f0abfc" />
          <stop offset=".5" stopColor="#ffffff" />
          <stop offset=".8" stopColor="#f0abfc" />
          <stop offset="1" stopColor="#c026d3" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}spill`}>
          <stop offset="0" stopColor="#e879f9" stopOpacity=".55" />
          <stop offset=".5" stopColor="#7c3aed" stopOpacity=".22" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}glow`} x="-100" y="-60" width="200" height="120" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <clipPath id={`${u}clip`}>
          <path d={RIFT_LENS} />
        </clipPath>
      </defs>
      <g transform="translate(104 48) rotate(-21)">
        <ellipse className="fxv-spill" rx="96" ry="40" fill={`url(#${u}spill)`} />
        <path className="fxv-crack" d={RIFT_CRACK} fill="none" stroke="#f5d0fe" strokeWidth="1.1" strokeLinejoin="round" pathLength={160} />
        <g className="fxv-lens">
          <path d={RIFT_LENS} fill={`url(#${u}in)`} />
          <g clipPath={`url(#${u}clip)`}>
            <g className="fxv-drift">
              {stars.map((s) => (
                <circle key={s.i} cx={-90 + s.a * 200} cy={-16 + s.b * 32} r={0.35 + s.c * 0.8} fill={s.i % 4 ? '#f5d0fe' : '#fff'} opacity={0.4 + s.c * 0.6} />
              ))}
            </g>
            <ellipse rx="40" ry="5" fill="#c084fc" opacity=".25" />
          </g>
          <path d={RIFT_LENS} fill="none" stroke={`url(#${u}rim)`} strokeWidth="3" filter={`url(#${u}glow)`} />
          <path d={RIFT_LENS} fill="none" stroke={`url(#${u}rim)`} strokeWidth=".9" strokeLinejoin="round" />
        </g>
        {motes.map((p) => {
          const x = (p.a - 0.5) * 170;
          const y = (p.b > 0.5 ? 1 : -1) * (14 + p.c * 22);
          return (
            <circle
              key={p.i}
              className="fxv-mote"
              r={0.8 + p.c}
              fill="#f5d0fe"
              style={{ '--x': `${x.toFixed(1)}px`, '--y': `${y.toFixed(1)}px`, animationDelay: `${(p.a * 0.9).toFixed(2)}s` } as Vars}
            />
          );
        })}
        <ellipse className="fxv-flash" rx="70" ry="6" fill="#fff" filter={`url(#${u}glow)`} />
      </g>
    </svg>
  );
}

/* ---- Aurora veil ---------------------------------------------------- */
function AuroraVeil() {
  return (
    <>
      <span className="fxa-ribbon fxa-1" />
      <span className="fxa-ribbon fxa-2" />
      <span className="fxa-ribbon fxa-3" />
    </>
  );
}

/* ---- Fireflies ------------------------------------------------------ */
function Fireflies() {
  const list = useMemo(() => seeded(16, 'firefly'), []);
  return (
    <>
      {list.map((p) => {
        // Keep them along the edges and the lower part, not over the name.
        const left = p.i % 3 === 0 ? 4 + p.a * 18 : p.i % 3 === 1 ? 78 + p.a * 18 : 10 + p.a * 80;
        const top = p.i % 3 === 2 ? 70 + p.b * 26 : 12 + p.b * 80;
        return (
          <span
            key={p.i}
            className="fxf-fly"
            style={{ left: `${left}%`, top: `${top}%`, '--fx-dur': `${5 + p.c * 5}s`, '--fx-x': `${(p.b - 0.5) * 40}px`, '--fx-y': `${(p.c - 0.5) * 34}px`, animationDelay: `${-p.a * 8}s` } as Vars}
          />
        );
      })}
    </>
  );
}

/* ---- Rising embers ---------------------------------------------------- */
function EmberRise() {
  const list = useMemo(() => seeded(20, 'ember'), []);
  return (
    <>
      <span className="fxe-heat" />
      {list.map((p) => (
        <span
          key={p.i}
          className="fxe-ember"
          style={{ left: `${p.a * 100}%`, '--fx-dur': `${2.6 + p.b * 2.4}s`, '--fx-x': `${(p.c - 0.5) * 70}px`, '--size': `${2 + p.b * 4}px`, animationDelay: `${-p.c * 5}s` } as Vars}
        />
      ))}
    </>
  );
}

/* ---- Shooting stars --------------------------------------------------- */
function ShootingStars() {
  const twinkles = useMemo(() => seeded(14, 'tw'), []);
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span key={i} className="fxc-meteor" style={{ top: `${6 + i * 14}%`, left: `${20 + i * 25}%`, animationDelay: `${i * 1.7}s` }} />
      ))}
      {twinkles.map((p) => (
        <span key={p.i} className="fxc-twinkle" style={{ left: `${p.a * 100}%`, top: `${p.b * 45}%`, animationDelay: `${-p.c * 3}s` }} />
      ))}
    </>
  );
}

/* ---- Sakura petals ---------------------------------------------------- */
function SakuraPetals() {
  const list = useMemo(() => seeded(16, 'petal'), []);
  return (
    <>
      {list.map((p) => (
        <span
          key={p.i}
          className="fxk-petal"
          style={
            {
              left: `${p.a * 110 - 10}%`,
              '--fx-dur': `${6 + p.b * 5}s`,
              '--fx-x': `${60 + p.c * 120}px`,
              '--rot': `${p.c * 720}deg`,
              animationDelay: `${-p.b * 10}s`,
              scale: String(0.6 + p.c * 0.7),
            } as Vars
          }
        />
      ))}
    </>
  );
}

/* ---- Winter snowfall ------------------------------------------------- */
function WinterSnowfall() {
  const list = useMemo(() => seeded(20, 'flake'), []);
  return (
    <>
      <span className="fxw-frost" />
      {list.map((p) => (
        <span
          key={p.i}
          className="fxw-flake"
          style={{ left: `${p.a * 100}%`, '--fx-dur': `${5 + p.b * 6}s`, '--fx-x': `${(p.c - 0.5) * 50}px`, animationDelay: `${-p.b * 11}s`, fontSize: `${8 + p.c * 10}px` } as Vars}
        >
          ❄
        </span>
      ))}
    </>
  );
}

/* ---- Haunted night ---------------------------------------------------- */
function HauntedNight() {
  return (
    <>
      <span className="fxh-fog fxh-fog-a" />
      <span className="fxh-fog fxh-fog-b" />
      {[0, 1, 2, 3].map((i) => (
        <svg key={i} className="fxh-bat" viewBox="-15 -8 30 16" style={{ top: `${8 + i * 9}%`, animationDelay: `${i * 1.6}s`, width: `${26 - i * 4}px` } as Vars}>
          <g className="fxh-wings">
            <path d="M0 0 C-3 -3 -6 -3 -10 -6 C-9 -2 -11 0 -14 1 C-10 1 -7 3 -5 5 C-3 3 -1 3 0 4 C1 3 3 3 5 5 C7 3 10 1 14 1 C11 0 9 -2 10 -6 C6 -3 3 -3 0 0Z" fill="#0f0a1a" />
          </g>
        </svg>
      ))}
      <span className="fxh-moonglow" />
    </>
  );
}

/* ---- Summer shimmer -------------------------------------------------- */
function SummerShimmer() {
  const bubbles = useMemo(() => seeded(12, 'bubble'), []);
  return (
    <>
      <span className="fxu-caustics" />
      <span className="fxu-flare" />
      {bubbles.map((p) => (
        <span key={p.i} className="fxu-bubble" style={{ left: `${p.a * 100}%`, '--fx-dur': `${4 + p.b * 4}s`, '--size': `${4 + p.c * 8}px`, animationDelay: `${-p.b * 8}s` } as Vars} />
      ))}
    </>
  );
}

/* ---- Pixel confetti ------------------------------------------------- */
const PIXEL_COLORS = ['#22d3ee', '#a855f7', '#f43f5e', '#fde047', '#4ade80'];
function PixelConfetti() {
  const list = useMemo(() => seeded(22, 'px'), []);
  return (
    <>
      {list.map((p) => (
        <span
          key={p.i}
          className="fxx-pixel"
          style={{ left: `${p.a * 100}%`, background: PIXEL_COLORS[p.i % PIXEL_COLORS.length], '--fx-dur': `${3 + p.b * 3}s`, animationDelay: `${-p.c * 6}s` } as Vars}
        />
      ))}
    </>
  );
}

const EFFECTS: Record<string, () => ReactElement> = {
  sparks: () => <Particles kind="sparks" />,
  'aurora-veil': AuroraVeil,
  fireflies: Fireflies,
  stars: () => <Particles kind="stars" />,
  snow: () => <Particles kind="snow" />,
  'crystal-shatter': CrystalShatter,
  'plasma-storm': PlasmaStorm,
  'void-open': VoidOpen,
  'ember-rise': EmberRise,
  'shooting-stars': ShootingStars,
  'sakura-petals': SakuraPetals,
  'winter-snowfall': WinterSnowfall,
  'haunted-night': HauntedNight,
  'summer-shimmer': SummerShimmer,
  'pixel-confetti': PixelConfetti,
};

export const ProfileEffect = memo(function ProfileEffect({ effect, className }: { effect: string; className?: string }) {
  const Scene = EFFECTS[effect];
  if (!Scene) return null;
  return (
    <div className={cn('profile-effect media-anim', `fx-${effect}`, className)} aria-hidden>
      <Scene />
    </div>
  );
});
