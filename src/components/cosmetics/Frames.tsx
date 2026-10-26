/**
 * Frames around the whole profile card, plus the animated "Border Line"
 * that flows along the contour of the card or the avatar.
 *
 * Corner ornaments are drawn in pixel units for a card with a 16 px corner
 * radius (the border line runs 1.25 px inside the edge). Parts are scaled with
 * --pf-scale, so the same artwork fits small previews exactly.
 */
import { memo, useId, type CSSProperties, type ReactElement } from 'react';
import type { BorderLine as BorderLineStyle } from '../../types';
import { cn } from '../../lib/utils';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/* ---- Gilded: gold band hugging the rounded corner ------------------- */

function GildedCorner({ u }: { u: string }) {
  return (
    <svg viewBox="0 0 56 56">
      <defs>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset=".4" stopColor="#fbbf24" />
          <stop offset=".75" stopColor="#b45309" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
        <radialGradient id={`${u}r`} cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#d1fae5" />
          <stop offset=".5" stopColor="#10b981" />
          <stop offset="1" stopColor="#064e3b" />
        </radialGradient>
      </defs>
      {/* Thick band exactly on the card's corner arc (r 16 → centre line r 13.5). */}
      <path d="M2.5 38 V16 A13.5 13.5 0 0 1 16 2.5 H38" fill="none" stroke={`url(#${u}g)`} strokeWidth="5" strokeLinecap="round" />
      <path d="M5 38 V16.5 A11.5 11.5 0 0 1 16.5 5 H38" fill="none" stroke="#78350f" strokeOpacity=".45" strokeWidth=".6" />
      {/* Inner filigree, parallel to the corner, with leaf accents. */}
      <path d="M10 44 V20 A10 10 0 0 1 20 10 H44" fill="none" stroke={`url(#${u}g)`} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M44 10 c3.4 0 5 2.6 3.4 4.6 c-1.3 1.5 -3.4 .5 -2.7 -1.1" fill="none" stroke={`url(#${u}g)`} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M10 44 c0 3.4 2.6 5 4.6 3.4 c1.5 -1.3 .5 -3.4 -1.1 -2.7" fill="none" stroke={`url(#${u}g)`} strokeWidth="1.1" strokeLinecap="round" />
      {[
        [30, 10, 0],
        [10, 30, 90],
      ].map(([x, y, r], i) => (
        <path key={i} d="M0 0 C2 -3 5 -3.4 7 -2.6 C5 -1 2.4 .2 0 0Z" fill={`url(#${u}g)`} transform={`translate(${x} ${y}) rotate(${r})`} />
      ))}
      {/* Finials at the band ends. */}
      <path d="M38 2.5 l3.4 -2.4 l3.4 2.4 l-3.4 2.4Z" fill={`url(#${u}g)`} />
      <path d="M2.5 38 l-2.4 3.4 l2.4 3.4 l2.4 -3.4Z" fill={`url(#${u}g)`} />
      {/* Rosette on the corner diagonal, sitting on the filigree. */}
      <g transform="translate(12.9 12.9)">
        {[0, 90, 180, 270].map((a) => (
          <path key={a} d="M0 -7 C2.3 -5 2.3 -2.4 0 -1.4 C-2.3 -2.4 -2.3 -5 0 -7Z" fill={`url(#${u}g)`} stroke="#78350f" strokeOpacity=".5" strokeWidth=".4" transform={`rotate(${a + 45})`} />
        ))}
        {[0, 90, 180, 270].map((a) => (
          <circle key={a} cx="0" cy="-4.6" r=".9" fill="#fef3c7" transform={`rotate(${a})`} />
        ))}
        <circle r="3.1" fill={`url(#${u}r)`} stroke="#78350f" strokeWidth=".6" />
        <circle cx="-1" cy="-1" r=".8" fill="#fff" opacity=".75" />
      </g>
    </svg>
  );
}

/* ---- Dragon Crest: horns curling along the corner, layered flames ------ */

function DragonHorn({ u }: { u: string }) {
  return (
    <svg viewBox="0 0 80 80">
      <defs>
        <linearGradient id={`${u}h`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a2405" />
          <stop offset=".3" stopColor="#b45309" />
          <stop offset=".65" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#fef3c7" />
        </linearGradient>
        <radialGradient id={`${u}j`} cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#fecaca" />
          <stop offset=".5" stopColor="#dc2626" />
          <stop offset="1" stopColor="#7f1d1d" />
        </radialGradient>
      </defs>
      {/* Horn rooted on the top edge, wrapping the corner, tip curling inward. */}
      <path
        d="M60 2.5 H24 C10 2.5 2.5 10 2.5 24 V40 C3 50 8 58 17 62 C12 54 10.5 46 11.5 38 C12.5 26 18 17 28 13.5 C37 10.5 47 10.5 56 12.5 Z"
        fill={`url(#${u}h)`}
        stroke="#451a03"
        strokeWidth=".8"
        strokeLinejoin="round"
      />
      {/* Growth ridges across the horn. */}
      {[
        'M48 2.8 C47 6 47.5 9 49.5 11.6',
        'M37 2.8 C35.5 6.5 36 9.5 38 11.6',
        'M26 2.9 C23 6.8 23 10.5 25 14.6',
        'M14 6.5 C14 11 16 14.6 19.6 19',
        'M6 15 C8 19 10.6 22 14.6 25',
        'M2.6 27 C6 30 9 31.4 12.4 32',
        'M3.2 40 C6 41.6 8.6 42 11.4 41.6',
      ].map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#451a03" strokeOpacity=".5" strokeWidth=".8" strokeLinecap="round" />
      ))}
      <path d="M56 5 C40 4.4 26 5 17 9.6 C10 13.4 6.4 20 5.6 30" fill="none" stroke="#fef3c7" strokeOpacity=".5" strokeWidth=".9" strokeLinecap="round" />
      <path d="M66 2.5 l4.2 3.4 l-4.2 3.4 l-4.2 -3.4Z" fill={`url(#${u}j)`} stroke="#fbbf24" strokeWidth=".9" />
    </svg>
  );
}

function FlameEdge({ u }: { u: string }) {
  const layer = (n: number, h: number, w: number, off: number, cls: string, fill: string, key: string) => (
    <g key={key}>
      {Array.from({ length: n }, (_, i) => {
        const x = off + i * w;
        const hh = h * (0.7 + 0.3 * Math.abs(Math.sin(i * 1.7 + off)));
        return (
          <path
            key={i}
            className={cls}
            style={{ animationDelay: `${((i * 0.37 + off) % 1).toFixed(2)}s`, transformOrigin: `${x}px 30px` }}
            d={`M${x - w * 0.6} 30 C${x - w * 0.62} ${30 - hh * 0.5} ${x - w * 0.05} ${30 - hh * 0.55} ${x + w * 0.08} ${30 - hh} C${x + w * 0.3} ${30 - hh * 0.62} ${x + w * 0.62} ${30 - hh * 0.4} ${x + w * 0.6} 30Z`}
            fill={fill}
          />
        );
      })}
    </g>
  );
  return (
    <svg viewBox="0 0 640 30" preserveAspectRatio="xMidYMax slice" className="pf-pattern">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="1" stopColor="#dc2626" stopOpacity=".7" />
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ea580c" />
          <stop offset=".7" stopColor="#f97316" />
          <stop offset="1" stopColor="#fdba74" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id={`${u}c`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fbbf24" stopOpacity=".95" />
          <stop offset="1" stopColor="#fef9c3" stopOpacity=".35" />
        </linearGradient>
        <filter id={`${u}blur`} x="-5%" y="-100%" width="110%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <linearGradient id={`${u}fade`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#450a0a" stopOpacity=".6" />
          <stop offset="1" stopColor="#450a0a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect y="12" width="640" height="18" fill={`url(#${u}fade)`} />
      <rect y="20" width="640" height="14" fill="#f97316" opacity=".55" filter={`url(#${u}blur)`} />
      {layer(30, 28, 22, 4, 'pf-flame', `url(#${u}a)`, 'a')}
      {layer(36, 21, 18, 11, 'pf-flame pf-flame-b', `url(#${u}b)`, 'b')}
      {layer(44, 12, 15, 2, 'pf-flame pf-flame-c', `url(#${u}c)`, 'c')}
    </svg>
  );
}

/* ---- Icicles: snow cap and icicles clustered at the top corners -------- */

const ICICLES: [number, number, number][] = [
  // x, length, width
  [12, 18, 5],
  [19, 30, 6.2],
  [27, 15, 5],
  [34, 25, 5.6],
  [42, 12, 4.6],
  [50, 19, 5],
  [59, 9, 4],
  [68, 14, 4.5],
  [79, 7, 3.5],
  [92, 5, 3],
];

function IcicleCorner({ u }: { u: string }) {
  return (
    <svg viewBox="0 0 110 40">
      <defs>
        <linearGradient id={`${u}i`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#bae6fd" stopOpacity=".95" />
          <stop offset="1" stopColor="#7dd3fc" stopOpacity=".15" />
        </linearGradient>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>
      {ICICLES.map(([x, l, w], i) => (
        <g key={i}>
          <path
            d={`M${x - w / 2} 4 C${x - w / 2} ${4 + l * 0.45} ${x - w * 0.15} ${4 + l * 0.8} ${x} ${4 + l} C${x + w * 0.1} ${4 + l * 0.8} ${x + w / 2} ${4 + l * 0.45} ${x + w / 2} 4Z`}
            fill={`url(#${u}i)`}
          />
          <path
            d={`M${x - w * 0.22} 6 C${x - w * 0.22} ${4 + l * 0.4} ${x - w * 0.08} ${4 + l * 0.7} ${x - w * 0.02} ${4 + l * 0.86}`}
            fill="none"
            stroke="#fff"
            strokeOpacity=".8"
            strokeWidth=".6"
            strokeLinecap="round"
          />
        </g>
      ))}
      {/* Glints that slide down two icicles. */}
      <circle cx="19" cy="8" r="1.1" fill="#fff" className="pf-drip" />
      <circle cx="34" cy="8" r="0.9" fill="#fff" className="pf-drip pf-drip-b" />
      {/* Snow cap following the rounded corner. */}
      <path
        d="M0 30 V16 A16 16 0 0 1 16 0 H108 C103 3.6 96 5 89 5.4 C81 5.8 75 8 66 7.6 C58 7.2 52 9.6 44 8.6 C36 7.8 30 10.6 22 9.8 C15 9.2 11 12.6 8.6 17.6 C6.6 22 5.2 27 0 30Z"
        fill={`url(#${u}s)`}
      />
      <path d="M2 22 C4 16 8 11 14 8.8" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6 15 C9 10.5 13 8.6 20 8.6" fill="none" stroke="#bae6fd" strokeWidth=".8" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

function FrostCorner({ u }: { u: string }) {
  const fern = (x: number, y: number, a: number, len: number, depth: number, key: string): ReactElement[] => {
    const rad = (a * Math.PI) / 180;
    const x2 = x + Math.cos(rad) * len;
    const y2 = y + Math.sin(rad) * len;
    const out = [<path key={key} d={`M${x.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`} />];
    if (depth > 0) {
      for (let k = 1; k <= 3; k++) {
        const px = x + Math.cos(rad) * len * (k / 4);
        const py = y + Math.sin(rad) * len * (k / 4);
        out.push(...fern(px, py, a - 55, len * 0.38, depth - 1, `${key}l${k}`), ...fern(px, py, a + 55, len * 0.38, depth - 1, `${key}r${k}`));
      }
    }
    return out;
  };
  return (
    <svg viewBox="0 0 56 56">
      <defs>
        <radialGradient id={`${u}f`} cx="0" cy="1" r="1">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity=".35" />
          <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M0 0 H56 V56 H0Z" fill={`url(#${u}f)`} />
      <g stroke="#f0f9ff" strokeOpacity=".7" strokeWidth=".7" strokeLinecap="round" fill="none">
        {fern(3, 53, -60, 30, 2, 'a')}
        {fern(3, 53, -22, 22, 1, 'b')}
      </g>
      <path className="pf-twinkle" d="M24 34 l1 -3 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1Z" fill="#fff" />
    </svg>
  );
}

/* ---- Shoreline: layered water with foam, starfish and shell ------------ */

function ShoreWater({ u }: { u: string }) {
  const wave = (y: number, amp: number) => `M-80 ${y} ${Array.from({ length: 22 }, (_, i) => `q20 ${i % 2 ? amp : -amp} 40 0`).join(' ')} V40 H-80Z`;
  return (
    <svg viewBox="0 0 720 40" preserveAspectRatio="xMidYMax slice" className="pf-pattern">
      <defs>
        <linearGradient id={`${u}w1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67e8f9" stopOpacity=".55" />
          <stop offset="1" stopColor="#0891b2" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id={`${u}w2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity=".85" />
          <stop offset="1" stopColor="#155e75" />
        </linearGradient>
      </defs>
      <g className="pf-wave-slow">
        <path d={wave(16, 4)} fill={`url(#${u}w1)`} />
      </g>
      <g className="pf-wave">
        <path d={wave(24, 3.4)} fill={`url(#${u}w2)`} />
        <path
          d={`M-80 24 ${Array.from({ length: 22 }, (_, i) => `q20 ${i % 2 ? 3.4 : -3.4} 40 0`).join(' ')}`}
          fill="none"
          stroke="#ecfeff"
          strokeOpacity=".85"
          strokeWidth="1.2"
          strokeDasharray="10 6 3 6"
          strokeLinecap="round"
        />
      </g>
      {[60, 170, 290, 400, 520, 640].map((x, i) => (
        <path key={x} className="pf-twinkle" style={{ animationDelay: `${i * 0.7}s` }} d={`M${x} 31 l.8 -2.2 l.8 2.2 l2.2 .8 l-2.2 .8 l-.8 2.2 l-.8 -2.2 l-2.2 -.8Z`} fill="#fff" />
      ))}
    </svg>
  );
}

function Starfish({ u }: { u: string }) {
  const arm = (a: number) => {
    const r1 = 13;
    const r2 = 4.6;
    const p = (ang: number, r: number) => [32 + r * Math.sin((ang * Math.PI) / 180), 32 - r * Math.cos((ang * Math.PI) / 180)];
    const [tx, ty] = p(a, r1);
    const [lx, ly] = p(a - 36, r2);
    const [rx, ry] = p(a + 36, r2);
    return `L${lx.toFixed(1)} ${ly.toFixed(1)} Q${p(a - 8, r1 * 0.75)[0].toFixed(1)} ${p(a - 8, r1 * 0.75)[1].toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${p(a + 8, r1 * 0.75)[0].toFixed(1)} ${p(a + 8, r1 * 0.75)[1].toFixed(1)} ${rx.toFixed(1)} ${ry.toFixed(1)}`;
  };
  return (
    <svg viewBox="0 0 64 64">
      <defs>
        <radialGradient id={`${u}s`} cx=".45" cy=".4" r=".7">
          <stop offset="0" stopColor="#fed7aa" />
          <stop offset=".6" stopColor="#fb923c" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
        <radialGradient id={`${u}c`} cx=".3" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff7ed" />
          <stop offset=".6" stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </radialGradient>
      </defs>
      <g transform="translate(14 14) rotate(-14 32 32)">
        <path d={`M32 32 ${[0, 72, 144, 216, 288].map(arm).join(' ')}Z`} fill={`url(#${u}s)`} stroke="#9a3412" strokeWidth=".7" strokeLinejoin="round" />
        {[0, 72, 144, 216, 288].map((a) => (
          <g key={a} transform={`rotate(${a} 32 32)`}>
            <circle cx="32" cy="26" r=".7" fill="#fff7ed" opacity=".8" />
            <circle cx="32" cy="22.5" r=".55" fill="#fff7ed" opacity=".7" />
          </g>
        ))}
      </g>
      <g transform="translate(4 40) rotate(-20)">
        <path d="M8 2 C13 2 16 6 16 10 C16 13 13 15 8 15 C3 15 0 13 0 10 C0 6 3 2 8 2Z" fill={`url(#${u}c)`} stroke="#92400e" strokeWidth=".6" />
        <path d="M8 2.6 V14.4 M4.2 4.4 C5.2 7.6 5.4 11 5 14.6 M11.8 4.4 C10.8 7.6 10.6 11 11 14.6" fill="none" stroke="#92400e" strokeOpacity=".5" strokeWidth=".6" />
      </g>
    </svg>
  );
}

/* ---- Other corner art --------------------------------------------------- */

function ShardCluster({ u }: { u: string }) {
  return (
    <svg viewBox="0 0 74 74">
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b4a50" />
          <stop offset="1" stopColor="#070a0c" />
        </linearGradient>
      </defs>
      <polygon points="2,14 14,2 30,6 18,20 6,30" fill={`url(#${u}s)`} stroke="#34d399" strokeWidth="1" strokeLinejoin="round" />
      <polygon points="30,6 44,3 38,16 22,22" fill={`url(#${u}s)`} stroke="#6ee7b7" strokeWidth=".8" strokeLinejoin="round" />
      <polygon points="6,30 18,20 14,42 3,44" fill={`url(#${u}s)`} stroke="#6ee7b7" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M14 2 L18 20 L30 6 M18 20 L14 42" stroke="#a7f3d0" strokeOpacity=".6" strokeWidth=".7" fill="none" />
      <polygon className="pf-float" points="40,28 46,32 42,40 36,35" fill={`url(#${u}s)`} stroke="#34d399" strokeWidth=".8" strokeLinejoin="round" />
    </svg>
  );
}

function StarCorner() {
  return (
    <svg viewBox="0 0 74 74">
      <path d="M62 14 A13 13 0 1 0 48 32 A10 10 0 1 1 62 14Z" fill="#fef9c3" />
      {[
        [30, 12, 3],
        [16, 28, 2],
        [58, 48, 2.4],
        [40, 30, 1.6],
      ].map(([x, y, s], i) => (
        <path
          key={i}
          className="pf-twinkle"
          style={{ animationDelay: `${i * 0.7}s` }}
          d={`M${x} ${y - s * 2} L${x + s * 0.5} ${y - s * 0.5} L${x + s * 2} ${y} L${x + s * 0.5} ${y + s * 0.5} L${x} ${y + s * 2} L${x - s * 0.5} ${y + s * 0.5} L${x - s * 2} ${y} L${x - s * 0.5} ${y - s * 0.5}Z`}
          fill="#fff"
        />
      ))}
    </svg>
  );
}

function BlossomBranch() {
  const flower = (x: number, y: number, r: number, k: number) => (
    <g key={k} transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          d={`M0 0 C${-r * 0.5} ${-r * 0.3} ${-r * 0.55} ${-r * 0.95} 0 ${-r} C${r * 0.55} ${-r * 0.95} ${r * 0.5} ${-r * 0.3} 0 0Z`}
          fill="#fbcfe8"
          stroke="#f9a8d4"
          strokeWidth=".4"
          transform={`rotate(${a})`}
        />
      ))}
      <circle r={r * 0.24} fill="#fde68a" />
    </g>
  );
  return (
    <svg viewBox="0 0 74 74">
      <path d="M2 8 C20 9 33 16 44 29 C51 38 55 50 57 68" fill="none" stroke="#5b3a29" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M21 11 C25 18 25 24 21 30 M40 25 C48 23 53 17 55 11" fill="none" stroke="#5b3a29" strokeWidth="1.5" strokeLinecap="round" />
      {flower(21, 30, 6, 1)}
      {flower(55, 11, 7, 2)}
      {flower(43, 31, 5, 3)}
      {flower(10, 9, 6.5, 4)}
      {flower(57, 62, 5, 5)}
      <ellipse className="pf-petal" cx="28" cy="42" rx="2.6" ry="1.5" fill="#fbcfe8" />
    </svg>
  );
}

function PixelCorner() {
  const cells = ['XXXXX', 'X....', 'X.XX.', 'X.X..', 'X....'];
  return (
    <svg viewBox="0 0 74 74" shapeRendering="crispEdges">
      {cells.flatMap((row, y) =>
        row.split('').map((c, x) => (c === 'X' ? <rect key={`${x}${y}`} x={4 + x * 8} y={4 + y * 8} width="7.4" height="7.4" fill={(x + y) % 2 ? '#a855f7' : '#22d3ee'} /> : null)),
      )}
    </svg>
  );
}

function Cobweb() {
  return (
    <svg viewBox="0 0 74 74">
      <g stroke="#e2e8f0" strokeOpacity=".55" strokeWidth=".8" fill="none">
        <path d="M74 0 L18 0 M74 0 L74 56 M74 0 L28 28 M74 0 L46 46 M74 0 L59 59" />
        <path d="M59 0 Q61 9 74 15 M44 0 Q48 20 74 30 M31 0 Q37 31 74 43" />
      </g>
      <g className="pf-spider" style={{ transformOrigin: '52px 0px' }}>
        <path d="M52 0 V28" stroke="#e2e8f0" strokeWidth=".5" />
        <circle cx="52" cy="31" r="3.2" fill="#0f0a1a" stroke="#f97316" strokeWidth=".5" />
        <path d="M48 29 l-4 -2 M48 32 l-4 1 M56 29 l4 -2 M56 32 l4 1" stroke="#0f0a1a" strokeWidth="1" />
      </g>
    </svg>
  );
}

function PumpkinCorner() {
  return (
    <svg viewBox="0 0 74 74">
      <g transform="translate(22 54)">
        <ellipse cx="-8" cy="0" rx="9" ry="12" fill="#ea580c" />
        <ellipse cx="8" cy="0" rx="9" ry="12" fill="#ea580c" />
        <ellipse cx="0" cy="0" rx="9" ry="12.5" fill="#f97316" stroke="#9a3412" strokeWidth=".7" />
        <path d="M-1 -12 C-1 -16 2 -18 5 -19" stroke="#365314" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <g className="pf-glow">
          <path d="M-8 -3 L-3 -7 L-2 -1Z M8 -3 L3 -7 L2 -1Z" fill="#fde047" />
          <path d="M-9 4 Q0 12 9 4 L6 5 L3 3 L1 6 L-1 3 L-3 6 L-6 3Z" fill="#fde047" />
        </g>
      </g>
    </svg>
  );
}

function RiftCrack() {
  return (
    <svg viewBox="0 0 120 40">
      <defs>
        <radialGradient id="pf-rift" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".4" stopColor="#f0abfc" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="pf-rift" style={{ transformOrigin: '60px 6px' }}>
        <path d="M30 2 C46 10 52 12 60 26 C68 12 74 10 90 2 C74 6 66 6 60 14 C54 6 46 6 30 2Z" fill="url(#pf-rift)" />
        <path d="M34 3 L48 8 L60 22 L72 8 L86 3" fill="none" stroke="#fff" strokeWidth=".8" />
      </g>
    </svg>
  );
}

function Arcs() {
  return (
    <svg viewBox="0 0 74 74">
      <path className="pf-zap" d="M6 30 l8 -4 -2 6 9 -4 -3 6 10 -5" fill="none" stroke="#e0f2fe" strokeWidth="1.6" strokeLinejoin="round" />
      <path className="pf-zap" style={{ animationDelay: '.7s' }} d="M30 6 l-3 9 6 -2 -4 9 6 -2 -5 10" fill="none" stroke="#bae6fd" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Circuit traces with light pulses travelling to the pads. */
function CircuitCorner({ u }: { u: string }) {
  const traces = ['M2.5 30 V22 L12 12.5 H30 L36 6.5 H52', 'M8 44 V28 L16 20 H22', 'M22 2.5 V8 L28 14 H40', 'M14 54 V40 L19 35'];
  return (
    <svg viewBox="0 0 64 64">
      <defs>
        <filter id={`${u}g`} x="-10" y="-10" width="84" height="84" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {traces.map((d, i) => (
          <path key={i} d={d} stroke="#10b981" strokeOpacity=".55" strokeWidth="1" />
        ))}
        {traces.map((d, i) => (
          <path key={`p${i}`} d={d} stroke="#a7f3d0" strokeWidth="1.6" strokeDasharray="4 60" className="pf-pulse" style={{ animationDelay: `${i * 0.6}s` }} filter={`url(#${u}g)`} />
        ))}
        {traces.map((d, i) => (
          <path key={`q${i}`} d={d} stroke="#ecfdf5" strokeWidth=".9" strokeDasharray="4 60" className="pf-pulse" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
      </g>
      {[
        [52, 6.5],
        [22, 20],
        [40, 14],
        [19, 35],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="2.4" fill="#05150f" stroke="#34d399" strokeWidth="1" />
          <circle cx={x} cy={y} r=".9" fill="#a7f3d0" />
        </g>
      ))}
    </svg>
  );
}

/** Small diamond notch for the twin line frame. */
function Notch() {
  return (
    <svg viewBox="0 0 40 14">
      <path d="M20 1.5 L26 7 L20 12.5 L14 7Z" fill="#0b0f12" stroke="#a7f3d0" strokeWidth="1" />
      <path d="M20 4.4 L22.6 7 L20 9.6 L17.4 7Z" fill="#34d399" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

type At = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'top-center' | 'top-mid' | 'bottom-mid';

interface FrameDef {
  /** Border style class (styles/cosmetics.css) */
  border: string;
  /** Ornaments placed at positions; size = box size in px at scale 1. */
  parts?: { at: At; size?: [number, number]; flip?: 'x' | 'y' | 'xy'; render: (u: string) => ReactElement }[];
  /** Adds extra layers (sheen, inner line …). */
  extra?: ('sheen' | 'inner')[];
}

const FRAMES: Record<string, FrameDef> = {
  'emerald-edge': { border: 'pf-b-emerald' },
  'twin-line': {
    border: 'pf-b-twin',
    extra: ['inner'],
    parts: [
      { at: 'top-mid', size: [40, 14], render: () => <Notch /> },
      { at: 'bottom-mid', size: [40, 14], render: () => <Notch /> },
    ],
  },
  glass: { border: 'pf-b-glass' },
  gilded: {
    border: 'pf-b-gold',
    parts: [
      { at: 'tl', size: [56, 56], render: (u) => <GildedCorner u={`${u}a`} /> },
      { at: 'tr', size: [56, 56], flip: 'x', render: (u) => <GildedCorner u={`${u}b`} /> },
      { at: 'bl', size: [56, 56], flip: 'y', render: (u) => <GildedCorner u={`${u}c`} /> },
      { at: 'br', size: [56, 56], flip: 'xy', render: (u) => <GildedCorner u={`${u}d`} /> },
    ],
  },
  'holo-foil': { border: 'pf-b-holo', extra: ['sheen'] },
  circuit: {
    border: 'pf-b-circuit',
    parts: [
      { at: 'tl', size: [64, 64], render: (u) => <CircuitCorner u={`${u}a`} /> },
      { at: 'br', size: [64, 64], flip: 'xy', render: (u) => <CircuitCorner u={`${u}b`} /> },
    ],
  },
  'onyx-fracture-frame': {
    border: 'pf-b-onyx',
    parts: [
      { at: 'tl', render: (u) => <ShardCluster u={`${u}a`} /> },
      { at: 'br', flip: 'xy', render: (u) => <ShardCluster u={`${u}b`} /> },
    ],
  },
  'celestial-frame': { border: 'pf-b-celestial', parts: [{ at: 'tr', render: () => <StarCorner /> }] },
  'sakura-frame': { border: 'pf-b-sakura', parts: [{ at: 'tl', render: () => <BlossomBranch /> }] },
  'pixel-frame': {
    border: 'pf-b-pixel',
    parts: [
      { at: 'tl', render: () => <PixelCorner /> },
      { at: 'tr', flip: 'x', render: () => <PixelCorner /> },
      { at: 'bl', flip: 'y', render: () => <PixelCorner /> },
      { at: 'br', flip: 'xy', render: () => <PixelCorner /> },
    ],
  },
  'plasma-frame': {
    border: 'pf-b-plasma',
    parts: [
      { at: 'tl', render: () => <Arcs /> },
      { at: 'br', flip: 'xy', render: () => <Arcs /> },
    ],
  },
  'void-frame': { border: 'pf-b-void', parts: [{ at: 'top-center', render: () => <RiftCrack /> }] },
  'dragon-frame': {
    border: 'pf-b-dragon',
    parts: [
      { at: 'tl', size: [80, 80], render: (u) => <DragonHorn u={`${u}a`} /> },
      { at: 'tr', size: [80, 80], flip: 'x', render: (u) => <DragonHorn u={`${u}b`} /> },
      { at: 'bottom', render: (u) => <FlameEdge u={`${u}f`} /> },
    ],
  },
  'haunted-frame': {
    border: 'pf-b-haunted',
    parts: [
      { at: 'tr', render: () => <Cobweb /> },
      { at: 'bl', render: () => <PumpkinCorner /> },
    ],
  },
  'winter-frame': {
    border: 'pf-b-winter',
    parts: [
      { at: 'tl', size: [124, 45], render: (u) => <IcicleCorner u={`${u}a`} /> },
      { at: 'tr', size: [124, 45], flip: 'x', render: (u) => <IcicleCorner u={`${u}b`} /> },
      { at: 'bl', size: [56, 56], render: (u) => <FrostCorner u={`${u}c`} /> },
      { at: 'br', size: [56, 56], flip: 'x', render: (u) => <FrostCorner u={`${u}d`} /> },
    ],
  },
  'summer-frame': {
    border: 'pf-b-summer',
    parts: [
      { at: 'bottom', render: (u) => <ShoreWater u={`${u}w`} /> },
      { at: 'br', size: [64, 64], render: (u) => <Starfish u={`${u}s`} /> },
    ],
  },
};

export const frameHasBottom = (id: string | undefined) => !!id && !!FRAMES[id]?.parts?.some((p) => p.at === 'bottom');
export const isFrame = (id: string | undefined) => !!id && id in FRAMES;

export const ProfileFrame = memo(function ProfileFrame({ id, className }: { id: string; className?: string }) {
  const u = useId().replace(/:/g, '');
  const def = FRAMES[id];
  if (!def) return null;
  return (
    <div className={cn('pframe media-anim', def.border, className)} aria-hidden>
      <span className="pframe-border" />
      {def.extra?.includes('inner') && <span className="pframe-inner" />}
      {def.extra?.includes('sheen') && <span className="pframe-sheen" />}
      {def.parts?.map((p, i) => (
        <span key={i} className={cn('pframe-part', `at-${p.at}`, p.flip && `flip-${p.flip}`)} style={p.size ? ({ '--pw': `${p.size[0]}px`, '--ph': `${p.size[1]}px` } as Vars) : undefined}>
          {p.render(`${u}${i}`)}
        </span>
      ))}
    </div>
  );
});

const SPEED = { slow: '7s', normal: '4s', fast: '2.2s' };

/** Animated light line along the contour of the card or the avatar. */
export function BorderLine({ style, shape, className }: { style: BorderLineStyle; shape: 'rect' | 'circle'; className?: string }) {
  return (
    <span
      className={cn('border-line media-anim', `bl-${shape}`, style.hoverOnly && 'bl-hover', className)}
      style={{ '--bl-c1': style.color, '--bl-c2': style.color2, '--bl-speed': SPEED[style.speed] } as Vars}
      aria-hidden
    />
  );
}
