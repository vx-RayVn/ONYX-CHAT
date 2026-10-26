/**
 * Illustrated banner scenes (SVG, 600×200, sliced to fit). Animated parts use
 * classes from styles/cosmetics.css and pause with the media preferences.
 */
import { memo, useId, useMemo, type ReactElement } from 'react';
import { hashString } from '../../lib/utils';

const W = 600;
const H = 200;

function useStars(n: number, key: string, maxY = H) {
  return useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const h = hashString(`${key}${i}`);
        return { x: h % W, y: (h >>> 9) % maxY, r: 0.5 + ((h >>> 18) % 10) / 10, d: ((h >>> 4) % 30) / 10 };
      }),
    [n, key, maxY],
  );
}

function Stars({ n, k, maxY, color = '#fff' }: { n: number; k: string; maxY?: number; color?: string }) {
  const stars = useStars(n, k, maxY);
  return (
    <g>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill={color}
          className={i % 3 === 0 ? 'bn-twinkle' : undefined}
          style={i % 3 === 0 ? { animationDelay: `${s.d}s` } : undefined}
          opacity={0.4 + (i % 5) * 0.12}
        />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */

function OnyxFracture({ u }: { u: string }) {
  const shards = [
    '0,200 0,90 70,40 120,200',
    '70,40 160,0 210,110 120,200',
    '160,0 300,0 250,90 210,110',
    '250,90 300,0 380,60 330,200 210,110',
    '330,200 380,60 470,120 430,200',
    '380,60 300,0 470,0 520,70 470,120',
    '470,120 520,70 600,40 600,200 430,200',
    '470,0 600,0 600,40 520,70',
  ];
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#11181c" />
          <stop offset="1" stopColor="#050709" />
        </linearGradient>
        <linearGradient id={`${u}sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34d399" stopOpacity="0" />
          <stop offset=".5" stopColor="#a7f3d0" stopOpacity=".35" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      {shards.map((p, i) => (
        <polygon key={i} points={p} fill={`hsl(165 ${10 + (i % 3) * 8}% ${6 + ((i * 7) % 5) * 2.4}%)`} stroke="#34d399" strokeOpacity={0.25 + (i % 3) * 0.15} strokeWidth="1.2" />
      ))}
      <path d="M70 40 L120 200 M210 110 L250 90 L380 60 L470 120" stroke="#6ee7b7" strokeWidth="1.6" strokeOpacity=".7" fill="none" />
      <rect className="bn-sweep" x="-200" y="0" width="200" height={H} fill={`url(#${u}sweep)`} transform="skewX(-20)" />
      <circle cx="380" cy="60" r="3" fill="#ecfdf5" className="bn-twinkle" />
      <circle cx="210" cy="110" r="2.4" fill="#ecfdf5" className="bn-twinkle" style={{ animationDelay: '1s' }} />
    </>
  );
}

function Celestial({ u }: { u: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0b2b" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
        <radialGradient id={`${u}moon`} cx=".4" cy=".4" r=".6">
          <stop offset="0" stopColor="#fefce8" />
          <stop offset="1" stopColor="#e5e7c8" />
        </radialGradient>
        <radialGradient id={`${u}halo`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fef9c3" stopOpacity=".35" />
          <stop offset="1" stopColor="#fef9c3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <Stars n={70} k="cel" />
      <ellipse cx="300" cy="140" rx="340" ry="60" fill="none" stroke="#a5b4fc" strokeOpacity=".2" strokeDasharray="2 6" />
      <ellipse cx="300" cy="150" rx="250" ry="40" fill="none" stroke="#a5b4fc" strokeOpacity=".15" />
      <circle cx="470" cy="70" r="80" fill={`url(#${u}halo)`} />
      <circle cx="470" cy="70" r="38" fill={`url(#${u}moon)`} />
      <circle cx="458" cy="60" r="6" fill="#d6d3a8" opacity=".5" />
      <circle cx="482" cy="84" r="4" fill="#d6d3a8" opacity=".5" />
      <circle cx="476" cy="52" r="3" fill="#d6d3a8" opacity=".4" />
      <g className="bn-meteor">
        <path d="M0 0 L-90 34" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".9" />
        <circle cx="0" cy="0" r="2.4" fill="#fff" />
      </g>
      <circle cx="120" cy="150" r="10" fill="#f59e0b" />
      <ellipse cx="120" cy="150" rx="18" ry="4.5" fill="none" stroke="#fde68a" strokeWidth="1.4" transform="rotate(-16 120 150)" />
    </>
  );
}

function SakuraSky({ u }: { u: string }) {
  const petals = useStars(14, 'sk');
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbcfe8" />
          <stop offset=".6" stopColor="#f5d0fe" />
          <stop offset="1" stopColor="#e9d5ff" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <circle cx="430" cy="80" r="44" fill="#fff1f2" opacity=".75" />
      <path d="M250 200 C300 160 360 110 388 92 Q400 84 412 92 C440 110 500 160 550 200Z" fill="#c4b5fd" opacity=".55" />
      <path d="M388 92 Q400 84 412 92 C418 96 424 101 430 106 C422 104 416 108 410 104 C404 109 398 104 392 108 C386 104 378 107 370 106 C376 101 382 96 388 92Z" fill="#fff" opacity=".95" />
      <path d="M0 200 Q150 150 300 190 T600 180 V200Z" fill="#a78bfa" opacity=".45" />
      <path d="M0 24 C80 30 140 48 190 90 C210 108 222 124 230 150" fill="none" stroke="#5b3a29" strokeWidth="7" strokeLinecap="round" />
      <path d="M60 30 C70 50 70 62 60 76 M150 60 C170 52 184 38 190 24" fill="none" stroke="#5b3a29" strokeWidth="3.4" strokeLinecap="round" />
      {[
        [60, 76, 12],
        [190, 24, 14],
        [150, 62, 10],
        [30, 26, 12],
        [224, 140, 11],
        [110, 40, 9],
        [200, 100, 10],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy={-r * 0.55} rx={r * 0.42} ry={r * 0.6} fill="#fdf2f8" stroke="#f9a8d4" strokeWidth=".6" transform={`rotate(${a})`} />
          ))}
          <circle r={r * 0.28} fill="#f472b6" />
        </g>
      ))}
      {petals.map((p, i) => (
        <ellipse
          key={i}
          cx={p.x}
          cy={-10}
          rx="5"
          ry="2.6"
          fill="#f9a8d4"
          className="bn-fall"
          style={{ animationDelay: `${-p.d * 2}s`, ['--fx-x' as string]: `${40 + (i % 5) * 20}px`, animationDuration: `${7 + (i % 4)}s` }}
        />
      ))}
    </>
  );
}

function PixelCity({ u }: { u: string }) {
  const buildings = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const h = hashString(`pc${i}`);
        return { x: i * 28, w: 24 + (h % 10), h: 50 + ((h >>> 6) % 90) };
      }),
    [],
  );
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e0b3b" />
          <stop offset=".7" stopColor="#4c1d95" />
          <stop offset="1" stopColor="#be185d" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <Stars n={40} k="px" maxY={90} />
      <g shapeRendering="crispEdges">
        <rect x="490" y="26" width="40" height="40" fill="#fde68a" />
        <rect x="498" y="34" width="8" height="8" fill="#fcd34d" />
        <rect x="512" y="48" width="6" height="6" fill="#fcd34d" />
        {buildings.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={H - b.h} width={b.w} height={b.h} fill={i % 2 ? '#0f0a1f' : '#1a1033'} />
            {Array.from({ length: Math.floor(b.h / 14) }, (_, r) =>
              [0, 1].map((c) => {
                const on = hashString(`w${i}${r}${c}`) % 3 === 0;
                return on ? (
                  <rect
                    key={`${r}${c}`}
                    x={b.x + 5 + c * 10}
                    y={H - b.h + 8 + r * 14}
                    width="5"
                    height="6"
                    fill={c ? '#22d3ee' : '#fde047'}
                    className={(i + r) % 4 === 0 ? 'bn-blink' : undefined}
                    style={{ animationDelay: `${(i + r) % 3}s` }}
                  />
                ) : null;
              }),
            )}
          </g>
        ))}
      </g>
    </>
  );
}

function Plasma({ u }: { u: string }) {
  const lines = [
    'M0 120 L80 100 L140 130 L220 80 L300 110 L380 60 L460 100 L540 70 L600 90',
    'M0 60 L70 80 L150 40 L230 70 L320 30 L400 70 L470 40 L600 60',
    'M0 170 L90 150 L170 175 L260 140 L350 165 L440 130 L520 160 L600 140',
  ];
  return (
    <>
      <defs>
        <radialGradient id={`${u}bg`} cx=".5" cy=".5" r=".8">
          <stop offset="0" stopColor="#0c1f3f" />
          <stop offset="1" stopColor="#020617" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      {lines.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#38bdf8" strokeWidth="6" strokeOpacity=".12" />
          <path d={d} fill="none" stroke="#7dd3fc" strokeWidth="1.6" strokeDasharray="40 260" className="bn-flow" style={{ animationDelay: `${i * -1.3}s` }} />
          <path d={d} fill="none" stroke="#38bdf8" strokeWidth=".8" strokeOpacity=".5" />
        </g>
      ))}
      {[
        [220, 80],
        [380, 60],
        [150, 40],
        [440, 130],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="10" fill="#38bdf8" opacity=".2" className="bn-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
          <circle cx={x} cy={y} r="3" fill="#e0f2fe" />
        </g>
      ))}
    </>
  );
}

function VoidRiftScene({ u }: { u: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${u}bg`} cx=".5" cy=".5" r=".8">
          <stop offset="0" stopColor="#1e0a3c" />
          <stop offset="1" stopColor="#030014" />
        </radialGradient>
        <radialGradient id={`${u}neb`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#c026d3" stopOpacity=".55" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}core`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".3" stopColor="#f5d0fe" />
          <stop offset=".7" stopColor="#c026d3" stopOpacity=".8" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <Stars n={60} k="void" color="#f5d0fe" />
      <g className="bn-swirl" style={{ transformOrigin: '300px 100px' }}>
        <ellipse cx="250" cy="90" rx="200" ry="70" fill={`url(#${u}neb)`} />
        <ellipse cx="380" cy="120" rx="160" ry="50" fill={`url(#${u}neb)`} opacity=".7" />
      </g>
      <g className="bn-rift" style={{ transformOrigin: '300px 100px' }}>
        <path d="M200 100 C250 80 270 60 300 30 C330 60 350 80 400 100 C350 120 330 140 300 170 C270 140 250 120 200 100Z" fill={`url(#${u}core)`} />
        <path d="M210 100 L250 92 L300 44 L350 92 L390 100 L350 108 L300 156 L250 108Z" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1" />
      </g>
    </>
  );
}

function DragonScales({ u }: { u: string }) {
  const embers = useStars(18, 'de');
  return (
    <>
      <defs>
        <pattern id={`${u}scale`} width="28" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 18 Q14 0 28 18" fill="none" stroke="#f97316" strokeOpacity=".35" strokeWidth="1.6" />
          <path d="M-14 9 Q0 -9 14 9 M14 9 Q28 -9 42 9" fill="none" stroke="#b45309" strokeOpacity=".25" strokeWidth="1.2" />
        </pattern>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#450a0a" />
          <stop offset=".6" stopColor="#1c0505" />
          <stop offset="1" stopColor="#0c0303" />
        </linearGradient>
        <radialGradient id={`${u}glow`} cx=".5" cy="1" r=".7">
          <stop offset="0" stopColor="#f97316" stopOpacity=".6" />
          <stop offset="1" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <rect width={W} height={H} fill={`url(#${u}scale)`} />
      <rect width={W} height={H} fill={`url(#${u}glow)`} className="bn-pulse-soft" />
      <path d="M40 40 C120 10 200 60 300 30 C400 0 480 50 560 30" fill="none" stroke="#fbbf24" strokeWidth="2" strokeOpacity=".7" />
      <circle cx="300" cy="30" r="6" fill="#dc2626" stroke="#fbbf24" strokeWidth="2" />
      {embers.map((e, i) => (
        <circle
          key={i}
          cx={e.x}
          cy={H + 6}
          r={1 + (i % 3)}
          fill={i % 2 ? '#fde047' : '#fb923c'}
          className="bn-rise"
          style={{ animationDelay: `${-e.d * 1.6}s`, animationDuration: `${3 + (i % 4)}s` }}
        />
      ))}
    </>
  );
}

function HarvestMoon({ u }: { u: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e0b3b" />
          <stop offset=".65" stopColor="#7c2d12" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <radialGradient id={`${u}moon`} cx=".4" cy=".4" r=".6">
          <stop offset="0" stopColor="#fff7ed" />
          <stop offset="1" stopColor="#fdba74" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <Stars n={30} k="hh" maxY={80} />
      <circle cx="430" cy="78" r="52" fill={`url(#${u}moon)`} />
      <path d="M0 200 L0 150 Q120 120 240 150 T480 140 T600 150 V200Z" fill="#140a1f" />
      <path
        d="M88 152 C90 132 91 116 89 100 M89 118 C82 110 76 106 68 104 M89 110 C96 100 104 94 114 92 M90 128 C98 122 104 120 110 121 M76 106 C72 100 70 96 70 90 M104 95 C106 89 110 86 114 84"
        stroke="#140a1f"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      {[
        [180, 150, 1],
        [210, 156, 0.7],
        [520, 146, 0.9],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="-8" cy="-8" rx="9" ry="11" fill="#c2410c" />
          <ellipse cx="8" cy="-8" rx="9" ry="11" fill="#c2410c" />
          <ellipse cx="0" cy="-8" rx="9" ry="11.5" fill="#ea580c" />
          <path d="M-7 -10 l4 -3 1 4z M7 -10 l-4 -3 -1 4z M-7 -4 Q0 2 7 -4" fill="#fde047" className="bn-flicker" />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} className="bn-bat" style={{ animationDelay: `${i * 2.2}s`, top: 0 }}>
          <g transform={`translate(0 ${40 + i * 22}) scale(${1.4 - i * 0.3})`}>
            <path className="bn-wings" d="M0 0 C-3 -3 -6 -3 -10 -6 C-9 -2 -11 0 -14 1 C-10 1 -7 3 -5 5 C-3 3 -1 3 0 4 C1 3 3 3 5 5 C7 3 10 1 14 1 C11 0 9 -2 10 -6 C6 -3 3 -3 0 0Z" fill="#0f0a1a" />
          </g>
        </g>
      ))}
      <rect className="bn-fog" x="-300" y="150" width="1200" height="50" fill="#c4b5fd" opacity=".12" />
    </>
  );
}

function FrozenPeaks({ u }: { u: string }) {
  const flakes = useStars(26, 'fz');
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#020a24" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id={`${u}aur`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34d399" stopOpacity="0" />
          <stop offset=".4" stopColor="#5eead4" stopOpacity=".55" />
          <stop offset=".7" stopColor="#38bdf8" stopOpacity=".35" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <Stars n={40} k="fzs" maxY={110} />
      <path className="bn-aurora" d="M-50 60 C80 20 160 90 300 50 C440 10 500 70 650 40 L650 80 C500 110 440 50 300 90 C160 130 80 60 -50 100Z" fill={`url(#${u}aur)`} />
      <path d="M0 200 L90 90 L140 140 L220 60 L300 150 L370 80 L450 160 L520 100 L600 170 V200Z" fill="#cbd5e1" />
      <path d="M90 90 L110 115 L95 112 L80 120Z M220 60 L245 92 L225 88 L205 98Z M370 80 L392 108 L372 104 L356 112Z M520 100 L540 124 L522 120 L506 126Z" fill="#fff" />
      <path d="M0 200 L60 160 L120 190 L200 150 L280 195 L360 160 L440 190 L520 155 L600 190 V200Z" fill="#94a3b8" />
      {[60, 130, 470, 540].map((x, i) => (
        <path key={x} d={`M${x} 200 L${x + 10} 172 L${x + 4} 174 L${x + 12} 156 L${x + 20} 174 L${x + 14} 172 L${x + 24} 200Z`} fill="#0f2e2a" transform={`translate(0 ${i % 2 ? 0 : -4})`} />
      ))}
      {flakes.map((f, i) => (
        <circle
          key={i}
          cx={f.x}
          cy={-6}
          r={1 + (i % 3) * 0.6}
          fill="#fff"
          className="bn-fall"
          style={{ animationDelay: `${-f.d * 2.4}s`, ['--fx-x' as string]: `${(i % 7) * 6 - 18}px`, animationDuration: `${6 + (i % 5)}s` }}
        />
      ))}
    </>
  );
}

/** Calm, symmetric sunset: the sun sits on the horizon in the centre and its
 *  reflection forms a tapering column of light on the water. */
function SunsetSea({ u }: { u: string }) {
  const horizon = 122;
  const streaks = Array.from({ length: 9 }, (_, i) => {
    const y = horizon + 6 + i * 8;
    const w = 26 + i * 15;
    return { y, w, o: 0.75 - i * 0.07, d: (i % 3) * 0.45 };
  });
  return (
    <>
      <defs>
        <linearGradient id={`${u}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b4b" />
          <stop offset=".38" stopColor="#6d28d9" />
          <stop offset=".72" stopColor="#db2777" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id={`${u}sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c2d55" />
          <stop offset=".25" stopColor="#3b1d5c" />
          <stop offset="1" stopColor="#0b1030" />
        </linearGradient>
        <linearGradient id={`${u}sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset=".6" stopColor="#fde68a" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
        <radialGradient id={`${u}glow`} cx=".5" cy="1" r=".55">
          <stop offset="0" stopColor="#fde68a" stopOpacity=".7" />
          <stop offset=".45" stopColor="#fb7185" stopOpacity=".25" />
          <stop offset="1" stopColor="#fb7185" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${u}clip`}>
          <rect width={W} height={horizon} />
        </clipPath>
      </defs>
      <rect width={W} height={horizon} fill={`url(#${u}sky)`} />
      <Stars n={26} k="sunset" maxY={56} />
      <ellipse cx="300" cy={horizon} rx="260" ry="110" fill={`url(#${u}glow)`} />
      {/* Thin clouds lit from below, mirrored left and right. */}
      {[
        [150, 70, 120],
        [450, 70, 120],
        [210, 92, 90],
        [390, 92, 90],
      ].map(([x, y, w], i) => (
        <rect key={i} x={x - w / 2} y={y} width={w} height="3.4" rx="1.7" fill="#fecdd3" opacity={0.35 - (i > 1 ? 0.1 : 0)} />
      ))}
      <g clipPath={`url(#${u}clip)`}>
        <circle cx="300" cy={horizon + 6} r="44" fill={`url(#${u}sun)`} />
        {[0, 1, 2].map((i) => (
          <rect key={i} x="240" y={horizon - 18 + i * 7} width="120" height={2 + i} fill="#db2777" opacity=".35" />
        ))}
      </g>
      <rect y={horizon} width={W} height={H - horizon} fill={`url(#${u}sea)`} />
      <rect y={horizon} width={W} height="1.2" fill="#fde68a" opacity=".55" />
      {streaks.map((s, i) => (
        <rect key={i} x={300 - s.w / 2} y={s.y} width={s.w} height="2.4" rx="1.2" fill="#fde68a" opacity={s.o} className="bn-glitter" style={{ animationDelay: `${s.d}s` }} />
      ))}
      <g className="bn-wave-x" opacity=".35">
        {[150, 172, 190].map((y) => (
          <path key={y} d={`M-100 ${y} ${Array.from({ length: 16 }, (_, i) => `q25 ${i % 2 ? 3 : -3} 50 0`).join(' ')}`} stroke="#c4b5fd" strokeWidth="1" fill="none" />
        ))}
      </g>
    </>
  );
}

/** Silk ribbons flowing slowly across a dark emerald field. */
function SilkFlow({ u }: { u: string }) {
  const ribbons = [
    { d: 'M-40 150 C80 60 200 200 320 110 S520 40 660 120', w: 26, c: `url(#${u}r1)`, dur: 14 },
    { d: 'M-40 120 C100 40 220 170 340 90 S540 20 660 90', w: 14, c: `url(#${u}r2)`, dur: 18 },
    { d: 'M-40 175 C120 120 240 210 360 150 S540 100 660 160', w: 8, c: `url(#${u}r3)`, dur: 11 },
  ];
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#03130d" />
          <stop offset="1" stopColor="#061a22" />
        </linearGradient>
        <linearGradient id={`${u}r1`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#10b981" stopOpacity="0" />
          <stop offset=".3" stopColor="#10b981" stopOpacity=".55" />
          <stop offset=".6" stopColor="#5eead4" stopOpacity=".7" />
          <stop offset="1" stopColor="#0d9488" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}r2`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a7f3d0" stopOpacity="0" />
          <stop offset=".5" stopColor="#ecfdf5" stopOpacity=".5" />
          <stop offset="1" stopColor="#a7f3d0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}r3`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset=".5" stopColor="#67e8f9" stopOpacity=".6" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <filter id={`${u}soft`} x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <g filter={`url(#${u}soft)`} opacity=".8">
        {ribbons.map((r, i) => (
          <path key={i} d={r.d} stroke={r.c} strokeWidth={r.w * 1.8} fill="none" strokeLinecap="round" />
        ))}
      </g>
      {ribbons.map((r, i) => (
        <g key={i} className="bn-silk" style={{ animationDuration: `${r.dur}s`, animationDelay: `${-i * 3}s` }}>
          <path d={r.d} stroke={r.c} strokeWidth={r.w} fill="none" strokeLinecap="round" />
          <path d={r.d} stroke="#ecfdf5" strokeOpacity=".35" strokeWidth=".8" fill="none" transform={`translate(0 ${-r.w / 2 + 1})`} />
        </g>
      ))}
    </>
  );
}

/** Layered mountain ridges under a moonlit sky with drifting mist. */
function NightRidge({ u }: { u: string }) {
  const ridge = (base: number, amp: number, seed: number) => {
    const p: string[] = [`M0 ${H}`, `L0 ${base}`];
    for (let x = 0; x <= W; x += 12) {
      const h = Math.sin(x / 80 + seed) * amp * 0.55 + Math.abs(Math.sin(x / 41 + seed * 2.3)) * amp * 0.8 + Math.sin(x / 11 + seed * 5) * amp * 0.08;
      p.push(`L${x} ${(base - h).toFixed(1)}`);
    }
    p.push(`L${W} ${H}Z`);
    return p.join(' ');
  };
  return (
    <>
      <defs>
        <linearGradient id={`${u}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#020617" />
          <stop offset=".7" stopColor="#1e3a5f" />
          <stop offset="1" stopColor="#3b5a86" />
        </linearGradient>
        <radialGradient id={`${u}moon`}>
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset=".7" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#cbd5e1" />
        </radialGradient>
        <radialGradient id={`${u}halo`}>
          <stop offset="0" stopColor="#e0f2fe" stopOpacity=".35" />
          <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfdbfe" stopOpacity="0" />
          <stop offset=".5" stopColor="#bfdbfe" stopOpacity=".16" />
          <stop offset="1" stopColor="#bfdbfe" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}sky)`} />
      <Stars n={60} k="ridge" maxY={110} />
      <circle cx="430" cy="58" r="70" fill={`url(#${u}halo)`} />
      <circle cx="430" cy="58" r="22" fill={`url(#${u}moon)`} />
      <path d={ridge(118, 22, 1.2)} fill="#24406a" />
      <rect className="bn-fog" x="-300" y="104" width="1200" height="40" fill={`url(#${u}mist)`} />
      <path d={ridge(146, 18, 2.6)} fill="#172c4d" />
      <rect className="bn-fog" x="-300" y="138" width="1200" height="36" fill={`url(#${u}mist)`} style={{ animationDuration: '18s' }} />
      <path d={ridge(172, 14, 4.1)} fill="#0b1830" />
      <path d={ridge(194, 8, 5.3)} fill="#050c1c" />
    </>
  );
}

/** A dark skyline with neon rain streaks and glowing reflections. */
function NeonRain({ u }: { u: string }) {
  const drops = useStars(46, 'rain');
  const towers = useMemo(() => [72, 112, 58, 96, 134, 64, 88, 122, 52, 104, 78, 142, 60, 92, 118, 66, 84, 100].map((h, i) => ({ x: i * 34 - 6, w: 26 + (hashString(`tw${i}`) % 10), h })), []);
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0420" />
          <stop offset=".75" stopColor="#1e0b3b" />
          <stop offset="1" stopColor="#3b0a3f" />
        </linearGradient>
        <linearGradient id={`${u}drop`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset="1" stopColor="#67e8f9" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id={`${u}drop2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f472b6" stopOpacity="0" />
          <stop offset="1" stopColor="#f9a8d4" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id={`${u}haze`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ec4899" stopOpacity=".35" />
          <stop offset="1" stopColor="#ec4899" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      <rect y="90" width={W} height="110" fill={`url(#${u}haze)`} />
      {towers.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={H - t.h} width={t.w} height={t.h} fill={i % 2 ? '#0a0618' : '#120a26'} />
          {i % 3 === 0 && <rect x={t.x + 4} y={H - t.h + 6} width={t.w - 8} height="2" fill={i % 2 ? '#22d3ee' : '#f472b6'} className="bn-blink" style={{ animationDelay: `${i * 0.4}s` }} />}
          {t.h > 110 && <rect x={t.x + t.w / 2 - 0.6} y={H - t.h - 14} width="1.2" height="14" fill="#1e1338" />}
          {Array.from({ length: Math.floor((t.h - 14) / 10) }, (_, r) =>
            hashString(`nw${i}-${r}`) % 3 === 0 ? <rect key={r} x={t.x + 5 + (r % 2) * 9} y={H - t.h + 14 + r * 10} width="4" height="3" fill={r % 3 ? '#fde68a' : '#67e8f9'} opacity=".55" /> : null,
          )}
        </g>
      ))}
      {drops.map((d, i) => (
        <rect
          key={i}
          x={d.x}
          y={-30}
          width="1.2"
          height={14 + (i % 4) * 6}
          fill={i % 3 ? `url(#${u}drop)` : `url(#${u}drop2)`}
          className="bn-rain"
          style={{ animationDelay: `${-d.d * 0.6}s`, animationDuration: `${0.9 + (i % 5) * 0.18}s` }}
        />
      ))}
    </>
  );
}

/** Faceted glass with soft refractions and a slow light sweep. */
function PrismGlass({ u }: { u: string }) {
  const facets = [
    { p: '0,0 180,0 120,120 0,90', c: '#1e1b4b' },
    { p: '180,0 360,0 300,90 120,120', c: '#312e81' },
    { p: '360,0 600,0 600,70 470,130 300,90', c: '#1e1b4b' },
    { p: '0,90 120,120 90,200 0,200', c: '#0f172a' },
    { p: '120,120 300,90 340,200 90,200', c: '#1e293b' },
    { p: '300,90 470,130 520,200 340,200', c: '#172554' },
    { p: '470,130 600,70 600,200 520,200', c: '#0f172a' },
  ];
  return (
    <>
      <defs>
        <linearGradient id={`${u}sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}spec`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f9a8d4" stopOpacity=".6" />
          <stop offset=".35" stopColor="#a5f3fc" stopOpacity=".45" />
          <stop offset=".7" stopColor="#fde68a" stopOpacity=".4" />
          <stop offset="1" stopColor="#c4b5fd" stopOpacity=".5" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="#0b1026" />
      {facets.map((fc, i) => (
        <polygon key={i} points={fc.p} fill={fc.c} stroke="#c7d2fe" strokeOpacity=".22" strokeWidth="1" />
      ))}
      <polygon points="120,120 300,90 340,200 90,200" fill={`url(#${u}spec)`} opacity=".35" />
      <polygon points="360,0 600,0 600,70 470,130 300,90" fill={`url(#${u}spec)`} opacity=".22" />
      <path d="M120 120 L300 90 L470 130" stroke="#e0e7ff" strokeOpacity=".55" strokeWidth="1.2" fill="none" />
      <rect className="bn-sweep" x="-200" y="0" width="180" height={H} fill={`url(#${u}sheen)`} transform="skewX(-20)" />
    </>
  );
}

/** Woven carbon fibre with a slow emerald sheen. */
function CarbonWeave({ u }: { u: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#11171a" />
          <stop offset=".5" stopColor="#2a3438" />
          <stop offset="1" stopColor="#11171a" />
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c1113" />
          <stop offset=".5" stopColor="#222b2f" />
          <stop offset="1" stopColor="#0c1113" />
        </linearGradient>
        <pattern id={`${u}w`} width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill={`url(#${u}a)`} />
          <rect x="8" y="8" width="8" height="8" fill={`url(#${u}a)`} />
          <rect x="8" width="8" height="8" fill={`url(#${u}b)`} />
          <rect y="8" width="8" height="8" fill={`url(#${u}b)`} />
        </pattern>
        <linearGradient id={`${u}sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34d399" stopOpacity="0" />
          <stop offset=".5" stopColor="#6ee7b7" stopOpacity=".16" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}v`} cx=".5" cy=".5" r=".75">
          <stop offset=".4" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}w)`} />
      <rect className="bn-sweep" x="-260" y="0" width="240" height={H} fill={`url(#${u}sheen)`} transform="skewX(-20)" />
      <rect width={W} height={H} fill={`url(#${u}v)`} />
      <rect y={H - 3} width={W} height="3" fill="#10b981" opacity=".55" />
    </>
  );
}

/** Contour lines of two hills, like a topographic map. */
function Topography({ u }: { u: string }) {
  const contours = useMemo(() => {
    const ring = (cx: number, cy: number, r: number, k: number) => {
      const p: string[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const rr = r * (1 + 0.16 * Math.sin(3 * a + k * 0.45) + 0.08 * Math.sin(5 * a + 1.3 + k * 0.2));
        p.push(`${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr * 1.6).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
      }
      return `${p.join(' ')}Z`;
    };
    return [...Array.from({ length: 9 }, (_, k) => ({ d: ring(170, 120, 14 + k * 15, k), k })), ...Array.from({ length: 7 }, (_, k) => ({ d: ring(470, 70, 12 + k * 14, k + 3), k }))];
  }, []);
  return (
    <>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b1714" />
          <stop offset="1" stopColor="#071010" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}bg)`} />
      {contours.map((c, i) => (
        <path key={i} d={c.d} fill="none" stroke="#34d399" strokeOpacity={c.k % 4 === 0 ? 0.42 : 0.18} strokeWidth={c.k % 4 === 0 ? 1.3 : 0.8} />
      ))}
      <circle cx="170" cy="120" r="3" fill="#6ee7b7" className="bn-pulse-soft" />
      <circle cx="470" cy="70" r="2.4" fill="#6ee7b7" className="bn-pulse-soft" style={{ animationDelay: '1.2s' }} />
    </>
  );
}

export const BANNER_SCENES: Record<string, (p: { u: string }) => ReactElement> = {
  'onyx-fracture-banner': OnyxFracture,
  celestial: Celestial,
  'sakura-banner': SakuraSky,
  'pixel-city': PixelCity,
  plasma: Plasma,
  'void-rift-banner': VoidRiftScene,
  'dragon-ember-banner': DragonScales,
  'haunted-banner': HarvestMoon,
  'winter-banner': FrozenPeaks,
  'summer-banner': SunsetSea,
  'silk-flow': SilkFlow,
  'night-ridge': NightRidge,
  'neon-rain': NeonRain,
  'prism-glass': PrismGlass,
  carbon: CarbonWeave,
  topography: Topography,
};

export const BannerScene = memo(function BannerScene({ id }: { id: string }) {
  const u = useId().replace(/:/g, '');
  const Scene = BANNER_SCENES[id];
  if (!Scene) return null;
  return (
    <svg className="banner-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <Scene u={u} />
    </svg>
  );
});
