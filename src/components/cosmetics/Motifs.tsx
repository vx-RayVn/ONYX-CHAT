/** Illustrated avatar presets (100×100). Animated parts use `am-*` classes. */
import type { ReactElement } from 'react';
import type { AvatarMotif } from '../../types';
import { cn } from '../../lib/utils';

interface P {
  u: string;
  a?: boolean;
}

const Crystal = ({ u, a }: P) => (
  <>
    <defs>
      <radialGradient id={`${u}bg`} cx=".5" cy=".4" r=".7">
        <stop offset="0" stopColor="#163a30" />
        <stop offset="1" stopColor="#050909" />
      </radialGradient>
      <linearGradient id={`${u}sh`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".5" stopColor="#fff" stopOpacity=".7" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <clipPath id={`${u}gem`}>
        <path d="M34 18 H66 L82 36 V64 L66 82 H34 L18 64 V36Z" />
      </clipPath>
    </defs>
    <rect width="100" height="100" fill={`url(#${u}bg)`} />
    <path d="M34 18 H66 L82 36 V64 L66 82 H34 L18 64 V36Z" fill="#10b981" />
    <path d="M34 18 H66 L60 32 H40Z" fill="#6ee7b7" />
    <path d="M18 36 L32 42 V58 L18 64Z" fill="#34d399" />
    <path d="M82 36 L68 42 V58 L82 64Z" fill="#047857" />
    <path d="M34 82 H66 L60 68 H40Z" fill="#065f46" />
    <path d="M40 32 H60 L68 42 V58 L60 68 H40 L32 58 V42Z" fill="#10b981" />
    <path d="M40 32 H60 L68 42 H32Z" fill="#a7f3d0" opacity=".5" />
    <g clipPath={`url(#${u}gem)`}>
      <rect className={cn(a && 'am-sweep')} x="-40" y="0" width="30" height="100" fill={`url(#${u}sh)`} transform="skewX(-20)" />
    </g>
  </>
);

const Moon = ({ u, a }: P) => (
  <>
    <defs>
      <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1e1b4b" />
        <stop offset="1" stopColor="#312e81" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${u}bg)`} />
    <path d="M62 22 A30 30 0 1 0 78 70 A24 24 0 1 1 62 22Z" fill="#fef9c3" />
    <circle cx="44" cy="58" r="3" fill="#e7e5bd" />
    <circle cx="50" cy="40" r="2" fill="#e7e5bd" />
    {[
      [76, 24, 2.4],
      [84, 46, 1.6],
      [22, 22, 1.8],
      [20, 80, 1.4],
    ].map(([x, y, r], i) => (
      <circle key={i} cx={x} cy={y} r={r} fill="#fff" className={cn(a && 'am-twinkle')} style={{ animationDelay: `${i * 0.6}s` }} />
    ))}
  </>
);

const Blossom = ({ u }: P) => (
  <>
    <defs>
      <radialGradient id={`${u}bg`} cx=".5" cy=".5" r=".7">
        <stop offset="0" stopColor="#fce7f3" />
        <stop offset="1" stopColor="#f472b6" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${u}bg)`} />
    <g transform="translate(50 52)">
      {[0, 72, 144, 216, 288].map((r) => (
        <path key={r} d="M0 0 C-14 -10 -14 -30 -4 -36 L0 -32 L4 -36 C14 -30 14 -10 0 0Z" fill="#fff1f7" stroke="#f9a8d4" strokeWidth="1.2" transform={`rotate(${r})`} />
      ))}
      <circle r="7" fill="#f472b6" />
      {[0, 60, 120, 180, 240, 300].map((r) => (
        <circle key={r} cx="0" cy="-9" r="1.6" fill="#fde68a" transform={`rotate(${r})`} />
      ))}
    </g>
  </>
);

const PixelHeart = ({ a }: P) => {
  const grid = ['..XX..XX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...', '....XX....'];
  return (
    <>
      <rect width="100" height="100" fill="#1e0b3b" />
      <g className={cn(a && 'am-beat')} style={{ transformOrigin: '50px 52px' }} shapeRendering="crispEdges">
        {grid.flatMap((row, y) =>
          row.split('').map((c, x) => (c === 'X' ? <rect key={`${x}${y}`} x={20 + x * 6} y={28 + y * 6} width="6.1" height="6.1" fill={y < 2 && x > 1 && x < 4 ? '#fecdd3' : '#f43f5e'} /> : null)),
        )}
      </g>
    </>
  );
};

const PlasmaCore = ({ u, a }: P) => (
  <>
    <defs>
      <radialGradient id={`${u}o`} cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#fff" />
        <stop offset=".35" stopColor="#7dd3fc" />
        <stop offset="1" stopColor="#1d4ed8" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="#030b1f" />
    <circle cx="50" cy="50" r="36" fill={`url(#${u}o)`} />
    <g className={cn(a && 'am-spin')} style={{ transformOrigin: '50px 50px' }}>
      <path d="M50 14 l-4 10 6 0 -6 12 M86 50 l-10 -4 0 6 -12 -6 M50 86 l4 -10 -6 0 6 -12 M14 50 l10 4 0 -6 12 6" fill="none" stroke="#e0f2fe" strokeWidth="2" strokeLinejoin="round" />
    </g>
  </>
);

const Void = ({ u, a }: P) => (
  <>
    <defs>
      <radialGradient id={`${u}acc`} cx=".5" cy=".5" r=".5">
        <stop offset=".45" stopColor="#000" />
        <stop offset=".55" stopColor="#f0abfc" />
        <stop offset=".75" stopColor="#7c3aed" stopOpacity=".6" />
        <stop offset="1" stopColor="#1e0a3c" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="#0a0216" />
    <g className={cn(a && 'am-spin')} style={{ transformOrigin: '50px 50px' }}>
      <ellipse cx="50" cy="50" rx="44" ry="16" fill="none" stroke="#c084fc" strokeOpacity=".6" strokeWidth="3" transform="rotate(-20 50 50)" />
    </g>
    <circle cx="50" cy="50" r="30" fill={`url(#${u}acc)`} />
    <circle cx="50" cy="50" r="14" fill="#000" />
  </>
);

const Flame = ({ u, a }: P) => (
  <>
    <defs>
      <linearGradient id={`${u}f`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#dc2626" />
        <stop offset=".55" stopColor="#f97316" />
        <stop offset="1" stopColor="#fde047" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="#1c0505" />
    <g className={cn(a && 'am-flicker')} style={{ transformOrigin: '50px 86px' }}>
      <path d="M50 12 C58 30 76 40 76 62 A26 26 0 0 1 24 62 C24 48 32 40 38 32 C40 42 44 46 48 48 C44 34 46 22 50 12Z" fill={`url(#${u}f)`} />
      <path d="M50 44 C55 54 64 58 64 68 A14 14 0 0 1 36 68 C36 62 40 58 43 55 C43 60 46 62 48 62 C46 56 47 50 50 44Z" fill="#fef3c7" />
    </g>
  </>
);

const Pumpkin = ({ u, a }: P) => (
  <>
    <defs>
      <radialGradient id={`${u}p`} cx=".4" cy=".35" r=".75">
        <stop offset="0" stopColor="#fdba74" />
        <stop offset=".6" stopColor="#f97316" />
        <stop offset="1" stopColor="#9a3412" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="#2e1065" />
    <circle cx="80" cy="20" r="9" fill="#fef3c7" opacity=".85" />
    <g transform="translate(50 58)">
      <ellipse cx="-14" cy="0" rx="16" ry="22" fill={`url(#${u}p)`} />
      <ellipse cx="14" cy="0" rx="16" ry="22" fill={`url(#${u}p)`} />
      <ellipse cx="0" cy="0" rx="16" ry="23" fill={`url(#${u}p)`} stroke="#9a3412" strokeWidth="1" />
      <path d="M-2 -22 C-2 -30 3 -34 9 -36" stroke="#365314" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <g className={cn(a && 'am-glow')}>
        <path d="M-15 -6 L-6 -13 L-4 -3Z M15 -6 L6 -13 L4 -3Z" fill="#fde047" />
        <path d="M-17 6 Q0 22 17 6 L11 8 L7 4 L3 10 L-1 4 L-5 10 L-9 4 L-13 8Z" fill="#fde047" />
      </g>
    </g>
  </>
);

const SnowflakeArt = ({ u, a }: P) => (
  <>
    <defs>
      <radialGradient id={`${u}bg`} cx=".5" cy=".5" r=".7">
        <stop offset="0" stopColor="#7dd3fc" />
        <stop offset="1" stopColor="#1e3a8a" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${u}bg)`} />
    <g className={cn(a && 'am-spin-slow')} style={{ transformOrigin: '50px 50px' }} stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none">
      {[0, 60, 120].map((r) => (
        <g key={r} transform={`rotate(${r} 50 50)`}>
          <path d="M50 16 V84" />
          <path d="M40 24 L50 32 L60 24 M40 76 L50 68 L60 76 M44 38 L50 42 L56 38 M44 62 L50 58 L56 62" strokeWidth="3" />
        </g>
      ))}
    </g>
    <circle cx="50" cy="50" r="5" fill="#fff" />
  </>
);

const SunWave = ({ u, a }: P) => (
  <>
    <defs>
      <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7c3aed" />
        <stop offset=".55" stopColor="#f97316" />
        <stop offset=".56" stopColor="#0e7490" />
        <stop offset="1" stopColor="#083344" />
      </linearGradient>
      <clipPath id={`${u}sky`}>
        <rect width="100" height="56" />
      </clipPath>
    </defs>
    <rect width="100" height="100" fill={`url(#${u}bg)`} />
    <circle cx="50" cy="56" r="24" fill="#fde047" clipPath={`url(#${u}sky)`} />
    <g className={cn(a && 'am-wave')}>
      <path d="M-30 68 Q-22 63 -15 68 T0 68 T15 68 T30 68 T45 68 T60 68 T75 68 T90 68 T105 68 T120 68 T135 68" stroke="#a5f3fc" strokeWidth="2.4" fill="none" />
      <path d="M-30 80 Q-22 75 -15 80 T0 80 T15 80 T30 80 T45 80 T60 80 T75 80 T90 80 T105 80 T120 80 T135 80" stroke="#67e8f9" strokeOpacity=".7" strokeWidth="2" fill="none" />
    </g>
  </>
);

const MOTIFS: Record<AvatarMotif, (p: P) => ReactElement> = {
  crystal: Crystal,
  moon: Moon,
  blossom: Blossom,
  'pixel-heart': PixelHeart,
  plasma: PlasmaCore,
  void: Void,
  flame: Flame,
  pumpkin: Pumpkin,
  snowflake: SnowflakeArt,
  'sun-wave': SunWave,
};

export function MotifArt({ motif, u, animated }: { motif: AvatarMotif; u: string; animated?: boolean }) {
  const M = MOTIFS[motif];
  return M ? <M u={u} a={animated} /> : null;
}
