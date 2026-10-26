/**
 * Avatar decorations. Each is an SVG drawn in a 120×120 box in which the
 * avatar occupies the centre circle (r = 48), so the overlay is 125 % of the
 * avatar size. Everything is vector art (no CSS masks), which keeps edges and
 * gradients smooth at every size. Animations are CSS classes from
 * styles/cosmetics.css and pause with the "animated media" / reduced-motion
 * preferences.
 */
import { memo, useId, type CSSProperties, type ReactElement } from 'react';

const C = 60; // centre
const R = 48; // avatar radius

const polar = (angleDeg: number, r: number) => {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

const f = (n: number) => n.toFixed(2);
const pts = (list: (readonly [number, number])[]) => list.map((p) => p.map(f).join(',')).join(' ');

/** Arc path along the circle around the avatar, angles in degrees (0 = top). */
const arc = (r: number, a1: number, a2: number) => {
  const [x1, y1] = polar(a1, r);
  const [x2, y2] = polar(a2, r);
  return `M${f(x1)} ${f(y1)} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${f(x2)} ${f(y2)}`;
};

/** Soft glow filter that works for rings touching the box edge. */
function Glow({ id, blur = 2.4 }: { id: string; blur?: number }) {
  return (
    <filter id={id} x="-20" y="-20" width="160" height="160" filterUnits="userSpaceOnUse">
      <feGaussianBlur stdDeviation={blur} />
    </filter>
  );
}

/** Five-petal blossom centred at (x, y). */
function Blossom({ x, y, r, fill, center = '#fde68a', rot = 0 }: { x: number; y: number; r: number; fill: string; center?: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={`M0 0 C${-r * 0.5} ${-r * 0.3} ${-r * 0.55} ${-r * 0.95} 0 ${-r} C${r * 0.55} ${-r * 0.95} ${r * 0.5} ${-r * 0.3} 0 0Z`} fill={fill} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.24} fill={center} />
    </g>
  );
}

function Star4({ x, y, s, fill, className, style }: { x: number; y: number; s: number; fill: string; className?: string; style?: CSSProperties }) {
  return (
    <path
      className={className}
      style={style}
      d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z`}
      fill={fill}
    />
  );
}

function Snowflake({ x, y, s, stroke, className, style }: { x: number; y: number; s: number; stroke: string; className?: string; style?: CSSProperties }) {
  return (
    <g className={className} style={style} transform={`translate(${x} ${y})`} stroke={stroke} strokeWidth={s * 0.14} strokeLinecap="round" fill="none">
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d={`M0 ${-s} V${s}`} />
          <path d={`M${-s * 0.3} ${-s * 0.7} L0 ${-s * 0.45} L${s * 0.3} ${-s * 0.7} M${-s * 0.3} ${s * 0.7} L0 ${s * 0.45} L${s * 0.3} ${s * 0.7}`} />
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Essentials                                                           */
/* ------------------------------------------------------------------ */

/** Two flowing aurora bands with a soft glow – smooth vector edges. */
function AuroraRing({ u }: { u: string }) {
  const r = 52;
  const len = 2 * Math.PI * r;
  return (
    <>
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset=".45" stopColor="#5eead4" />
          <stop offset="1" stopColor="#a5b4fc" />
        </linearGradient>
        <linearGradient id={`${u}b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0abfc" />
          <stop offset=".5" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <Glow id={`${u}g`} blur={2.6} />
      </defs>
      <circle cx={C} cy={C} r={r} fill="none" stroke="#04150f" strokeOpacity=".55" strokeWidth="6" />
      <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${u}a)`} strokeOpacity=".35" strokeWidth="2.4" />
      <g filter={`url(#${u}g)`}>
        <g className="dk-spin-slow">
          <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${u}a)`} strokeWidth="6" strokeDasharray={`${len * 0.46} ${len * 0.54}`} strokeLinecap="round" />
        </g>
        <g className="dk-spin-rev">
          <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${u}b)`} strokeWidth="6" strokeDasharray={`${len * 0.28} ${len * 0.72}`} strokeLinecap="round" />
        </g>
      </g>
      <g className="dk-spin-slow">
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${u}a)`} strokeWidth="3.2" strokeDasharray={`${len * 0.46} ${len * 0.54}`} strokeLinecap="round" />
      </g>
      <g className="dk-spin-rev">
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${u}b)`} strokeWidth="2.8" strokeDasharray={`${len * 0.28} ${len * 0.72}`} strokeLinecap="round" />
      </g>
      <circle cx={C} cy={C} r={r + 2.2} fill="none" stroke="#ecfdf5" strokeOpacity=".14" strokeWidth=".6" />
    </>
  );
}

/** Octagonal, faceted emerald bezel lit from the top left. */
function Facet({ u }: { u: string }) {
  const apothem = 57;
  const ro = apothem / Math.cos(Math.PI / 8);
  const ri = R + 1.5;
  const light = -45;
  const facets = Array.from({ length: 8 }, (_, i) => {
    const a1 = -22.5 + i * 45;
    const a2 = a1 + 45;
    const mid = a1 + 22.5;
    const shade = 0.5 + 0.5 * Math.cos(((mid - light) * Math.PI) / 180);
    const [ox1, oy1] = polar(a1, ro);
    const [ox2, oy2] = polar(a2, ro);
    const [ix2, iy2] = polar(a2, ri);
    const [ix1, iy1] = polar(a1, ri);
    return { d: `M${f(ox1)} ${f(oy1)} L${f(ox2)} ${f(oy2)} L${f(ix2)} ${f(iy2)} A${ri} ${ri} 0 0 0 ${f(ix1)} ${f(iy1)}Z`, shade, i };
  });
  const tone = (s: number) => {
    const dark = [6, 78, 59];
    const lite = [167, 243, 208];
    const c = dark.map((d, k) => Math.round(d + (lite[k] - d) * s));
    return `rgb(${c.join(',')})`;
  };
  const top = polar(0, apothem);
  return (
    <>
      <defs>
        <linearGradient id={`${u}gem`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ecfdf5" />
          <stop offset=".5" stopColor="#34d399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      {facets.map((fc) => (
        <path key={fc.i} d={fc.d} fill={tone(fc.shade)} />
      ))}
      {facets.map((fc) => {
        const [x1, y1] = polar(-22.5 + fc.i * 45, ro);
        const [x2, y2] = polar(-22.5 + fc.i * 45, ri);
        return <path key={`l${fc.i}`} d={`M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}`} stroke="#ecfdf5" strokeOpacity=".35" strokeWidth=".6" />;
      })}
      <polygon points={pts(Array.from({ length: 8 }, (_, i) => polar(-22.5 + i * 45, ro)))} fill="none" stroke="#6ee7b7" strokeWidth=".9" strokeLinejoin="round" />
      <circle cx={C} cy={C} r={ri} fill="none" stroke="#022c22" strokeWidth="1.2" />
      <g transform={`translate(${f(top[0])} ${f(top[1] - 0.5)})`}>
        <path d="M-5 0 L0 -5 L5 0 L0 5Z" fill={`url(#${u}gem)`} stroke="#064e3b" strokeWidth=".6" />
        <path d="M-5 0 L0 -5 L0 0Z" fill="#fff" opacity=".45" />
      </g>
    </>
  );
}

/** A thin track with a comet that leaves a fading trail. */
function Orbit({ u }: { u: string }) {
  const r = 54;
  const [tx, ty] = polar(-70, r);
  const [hx, hy] = polar(0, r);
  return (
    <>
      <defs>
        <linearGradient id={`${u}t`} gradientUnits="userSpaceOnUse" x1={tx} y1={ty} x2={hx} y2={hy}>
          <stop offset="0" stopColor="#34d399" stopOpacity="0" />
          <stop offset="1" stopColor="#ecfdf5" />
        </linearGradient>
        <radialGradient id={`${u}h`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset=".35" stopColor="#a7f3d0" />
          <stop offset="1" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={r} fill="none" stroke="#6ee7b7" strokeOpacity=".28" strokeWidth="1" />
      <circle cx={C} cy={C} r={r - 4} fill="none" stroke="#6ee7b7" strokeOpacity=".12" strokeWidth=".6" strokeDasharray="1 4" />
      <g className="dk-spin">
        <path d={arc(r, -70, 0)} fill="none" stroke={`url(#${u}t)`} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx={hx} cy={hy} r="7" fill={`url(#${u}h)`} />
        <circle cx={hx} cy={hy} r="2.2" fill="#fff" />
      </g>
      <g className="dk-spin-rev">
        <circle cx={C} cy={C - r} r="1.4" fill="#a7f3d0" opacity=".8" />
      </g>
    </>
  );
}

function Pulse() {
  return (
    <>
      <circle cx={C} cy={C} r={51} fill="none" stroke="#10b981" strokeWidth="2.4" />
      <circle cx={C} cy={C} r={51} fill="none" stroke="#6ee7b7" strokeWidth="1.6" className="dk-ring-out" />
      <circle cx={C} cy={C} r={51} fill="none" stroke="#6ee7b7" strokeWidth="1.2" className="dk-ring-out dk-delay-1" />
    </>
  );
}

/** Glowing coal ring with slowly travelling sparks. */
function EmberRing({ u }: { u: string }) {
  const r = 52;
  return (
    <>
      <defs>
        <linearGradient id={`${u}e`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset=".45" stopColor="#f97316" />
          <stop offset="1" stopColor="#b91c1c" />
        </linearGradient>
        <Glow id={`${u}g`} blur={3} />
      </defs>
      <circle cx={C} cy={C} r={r} fill="none" stroke="#f97316" strokeWidth="5" opacity=".55" filter={`url(#${u}g)`} className="dk-glow" />
      <circle cx={C} cy={C} r={r} fill="none" stroke="#2a0c05" strokeWidth="4.5" />
      <g className="dk-spin-slow">
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${u}e)`} strokeWidth="3" strokeDasharray="9 2.5 3 2.5 14 2.5" strokeLinecap="round" />
      </g>
      {[24, 70, 128, 200, 300].map((a, i) => {
        const [x, y] = polar(a, r + 1);
        return <circle key={a} cx={x} cy={y} r={1.1 + (i % 2) * 0.5} fill="#fde047" className="dk-ember" style={{ animationDelay: `${i * 0.7}s` }} />;
      })}
    </>
  );
}

function Laurel({ u }: { u: string }) {
  const leaves: ReactElement[] = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 9; i++) {
      const angle = 180 + side * (22 + i * 15);
      const [x, y] = polar(angle, R + 6);
      const tangent = angle + (side === 1 ? 90 : -90);
      const tilt = tangent + side * -35 + (i % 2 ? 18 : -18) * side;
      leaves.push(
        <path
          key={`${side}-${i}`}
          d={`M${f(x)} ${f(y - 7.6)} C${f(x + 3.8)} ${f(y - 3)} ${f(x + 3.8)} ${f(y + 3)} ${f(x)} ${f(y + 7.6)} C${f(x - 3.8)} ${f(y + 3)} ${f(x - 3.8)} ${f(y - 3)} ${f(x)} ${f(y - 7.6)}Z`}
          transform={`rotate(${tilt} ${f(x)} ${f(y)})`}
          fill={`url(#${u}g)`}
          stroke="#92400e"
          strokeWidth=".5"
        />,
      );
    }
  }
  return (
    <>
      <defs>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset=".45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path d={arc(R + 6, 158, 202)} fill="none" stroke="#b45309" strokeWidth="1.3" />
      {leaves}
      <path d="M53 112 L60 106.5 L67 112 L63.5 117.5 L60 114 L56.5 117.5Z" fill="#10b981" stroke="#065f46" strokeWidth=".8" strokeLinejoin="round" />
      <circle cx="60" cy="108.6" r="2.2" fill="#fde68a" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Prestige                                                              */
/* ------------------------------------------------------------------ */

/** A gold crown resting on the avatar, slightly tilted. */
function Crown({ u }: { u: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset=".35" stopColor="#fbbf24" />
          <stop offset=".75" stopColor="#d97706" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id={`${u}r`} cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#fecdd3" />
          <stop offset=".5" stopColor="#e11d48" />
          <stop offset="1" stopColor="#881337" />
        </radialGradient>
        <radialGradient id={`${u}s`} cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#bfdbfe" />
          <stop offset=".5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </radialGradient>
      </defs>
      <g transform="translate(66 -2) rotate(16 24 24)">
        <path d="M5 34 L2 10 L13.5 20 L24 4 L34.5 20 L46 10 L43 34Z" fill={`url(#${u}g)`} stroke="#78350f" strokeWidth=".9" strokeLinejoin="round" />
        <path d="M5 34 L2 10 L13.5 20 L24 4 L24 34Z" fill="#fff" opacity=".12" />
        <rect x="4" y="31" width="40" height="8" rx="2.4" fill={`url(#${u}b)`} stroke="#78350f" strokeWidth=".9" />
        <path d="M7 33.6 H41" stroke="#fef3c7" strokeOpacity=".6" strokeWidth=".8" strokeLinecap="round" />
        <circle cx="2" cy="10" r="2.6" fill="#fde68a" stroke="#92400e" strokeWidth=".6" />
        <circle cx="24" cy="4" r="3" fill="#fde68a" stroke="#92400e" strokeWidth=".6" />
        <circle cx="46" cy="10" r="2.6" fill="#fde68a" stroke="#92400e" strokeWidth=".6" />
        <ellipse cx="24" cy="35" rx="3.6" ry="2.6" fill={`url(#${u}r)`} />
        <circle cx="13" cy="35" r="2" fill={`url(#${u}s)`} />
        <circle cx="35" cy="35" r="2" fill={`url(#${u}s)`} />
        <path d="M24 16 L27.5 22.5 L24 29 L20.5 22.5Z" fill="#10b981" stroke="#064e3b" strokeWidth=".6" />
        <path d="M24 16 L24 29 L20.5 22.5Z" fill="#a7f3d0" opacity=".55" />
      </g>
      <Star4 x={110} y={8} s={4} fill="#fff" className="dk-twinkle" />
      <Star4 x={64} y={10} s={2.6} fill="#fef3c7" className="dk-twinkle" style={{ animationDelay: '1.2s' }} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Neon Nights                                                           */
/* ------------------------------------------------------------------ */

/** Over-ear gaming headset with RGB cups and a boom mic. */
function Headset({ u }: { u: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b4a50" />
          <stop offset="1" stopColor="#0b0f12" />
        </linearGradient>
        <linearGradient id={`${u}cup`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a363c" />
          <stop offset="1" stopColor="#05080a" />
        </linearGradient>
        <linearGradient id={`${u}rgb`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset=".5" stopColor="#10b981" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
        <Glow id={`${u}g`} blur={2} />
      </defs>
      <path d={arc(55, -78, 78)} fill="none" stroke="#05080a" strokeWidth="9" strokeLinecap="round" />
      <path d={arc(55, -78, 78)} fill="none" stroke={`url(#${u}band)`} strokeWidth="7" strokeLinecap="round" />
      <path d={arc(57.5, -40, 40)} fill="none" stroke="#5b6b72" strokeOpacity=".6" strokeWidth="1.2" strokeLinecap="round" />
      {[-1, 1].map((side) => {
        const x = side === -1 ? 1 : 103;
        return (
          <g key={side}>
            <rect x={x} y="44" width="16" height="34" rx="7" fill={`url(#${u}cup)`} stroke="#000" strokeWidth=".8" />
            <rect x={x + 3} y="49" width="10" height="24" rx="5" fill="none" stroke={`url(#${u}rgb)`} strokeWidth="2.6" filter={`url(#${u}g)`} className="dk-glow" />
            <rect x={x + 3} y="49" width="10" height="24" rx="5" fill="none" stroke={`url(#${u}rgb)`} strokeWidth="1.4" />
            <rect x={x + 5.5} y="40" width="5" height="7" rx="1.6" fill="#1f2a2f" />
          </g>
        );
      })}
      <path d="M8 76 C8 94 18 104 34 107" fill="none" stroke="#05080a" strokeWidth="4" strokeLinecap="round" />
      <path d="M8 76 C8 94 18 104 34 107" fill="none" stroke="#3b4a50" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="31" y="102.5" width="11" height="8" rx="4" fill="#1f2a2f" stroke="#000" strokeWidth=".8" />
      <circle cx="39.5" cy="106.5" r="1.4" fill="#10b981" className="dk-glow" />
    </>
  );
}

/** Neon cat ears that flicker like a sign. */
function NeonEars({ u }: { u: string }) {
  const ear = (side: -1 | 1) => {
    const [bx1, by1] = polar(side * 58, R - 2);
    const [bx2, by2] = polar(side * 18, R - 2);
    const [tx, ty] = polar(side * 40, 74);
    const [ix1, iy1] = polar(side * 52, R + 2);
    const [ix2, iy2] = polar(side * 25, R + 2);
    const [itx, ity] = polar(side * 40, 66);
    return (
      <g key={side}>
        <path d={`M${f(bx1)} ${f(by1)} Q${f(tx - side * 2)} ${f(ty + 6)} ${f(tx)} ${f(ty)} Q${f(tx + side * 6)} ${f(ty + 10)} ${f(bx2)} ${f(by2)}`} fill="#140a1f" fillOpacity=".75" />
        <path d={`M${f(ix1)} ${f(iy1)} Q${f(itx)} ${f(ity + 5)} ${f(itx)} ${f(ity)} Q${f(itx + side * 3)} ${f(ity + 8)} ${f(ix2)} ${f(iy2)}`} fill={`url(#${u}in)`} opacity=".85" />
        <g className="dk-flicker">
          <path
            d={`M${f(bx1)} ${f(by1)} Q${f(tx - side * 2)} ${f(ty + 6)} ${f(tx)} ${f(ty)} Q${f(tx + side * 6)} ${f(ty + 10)} ${f(bx2)} ${f(by2)}`}
            fill="none"
            stroke="#f472b6"
            strokeWidth="4"
            strokeLinecap="round"
            filter={`url(#${u}g)`}
          />
          <path
            d={`M${f(bx1)} ${f(by1)} Q${f(tx - side * 2)} ${f(ty + 6)} ${f(tx)} ${f(ty)} Q${f(tx + side * 6)} ${f(ty + 10)} ${f(bx2)} ${f(by2)}`}
            fill="none"
            stroke="#fdf2f8"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      </g>
    );
  };
  return (
    <>
      <defs>
        <linearGradient id={`${u}in`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity=".2" />
        </linearGradient>
        <Glow id={`${u}g`} blur={2.2} />
      </defs>
      {ear(-1)}
      {ear(1)}
    </>
  );
}

/** Sci-fi HUD: tick ring, counter-rotating arcs and a scanning sweep. */
function HoloScan({ u }: { u: string }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  const [sx, sy] = polar(0, 57);
  const [ex, ey] = polar(40, 57);
  return (
    <>
      <defs>
        <linearGradient id={`${u}s`} gradientUnits="userSpaceOnUse" x1={ex} y1={ey} x2={sx} y2={sy}>
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset="1" stopColor="#a5f3fc" stopOpacity=".55" />
        </linearGradient>
        <Glow id={`${u}g`} blur={1.6} />
      </defs>
      <g className="dk-spin-slower">
        {ticks.map((a) => {
          const long = a % 30 === 0;
          const [x1, y1] = polar(a, 56.5);
          const [x2, y2] = polar(a, long ? 52 : 54.5);
          return <path key={a} d={`M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}`} stroke="#67e8f9" strokeOpacity={long ? 0.9 : 0.45} strokeWidth={long ? 1.3 : 0.8} strokeLinecap="round" />;
        })}
      </g>
      <circle cx={C} cy={C} r={57.5} fill="none" stroke="#22d3ee" strokeOpacity=".35" strokeWidth=".7" />
      <g filter={`url(#${u}g)`}>
        <g className="dk-spin">
          <path d={arc(50.5, 20, 95)} fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" />
          <path d={arc(50.5, 200, 275)} fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </g>
      <g className="dk-spin">
        <path d={arc(50.5, 20, 95)} fill="none" stroke="#ecfeff" strokeWidth="1" strokeLinecap="round" />
        <path d={arc(50.5, 200, 275)} fill="none" stroke="#ecfeff" strokeWidth="1" strokeLinecap="round" />
      </g>
      <g className="dk-spin-fast-slow">
        <path d={`M${C} ${C} L${f(sx)} ${f(sy)} A57 57 0 0 1 ${f(ex)} ${f(ey)}Z`} fill={`url(#${u}s)`} opacity=".7" mask={`url(#${u}m)`} />
      </g>
      <mask id={`${u}m`}>
        <rect width="120" height="120" fill="#fff" />
        <circle cx={C} cy={C} r={R + 0.5} fill="#000" />
      </mask>
      {[45, 135, 225, 315].map((a) => {
        const [x, y] = polar(a, 66);
        return <path key={a} d="M-5 0 H0 V-5" transform={`translate(${f(x)} ${f(y)}) rotate(${a + 45})`} fill="none" stroke="#a5f3fc" strokeWidth="1.4" strokeLinecap="round" />;
      })}
    </>
  );
}

function NeonHalo({ u }: { u: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}n`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <Glow id={`${u}g`} blur={2.4} />
      </defs>
      <g className="dk-flicker">
        <circle cx={C} cy={C} r={R + 5} fill="none" stroke={`url(#${u}n)`} strokeWidth="4" filter={`url(#${u}g)`} opacity=".8" />
        <circle cx={C} cy={C} r={R + 5} fill="none" stroke={`url(#${u}n)`} strokeWidth="2" strokeDasharray="210 40 18 34" strokeLinecap="round" />
      </g>
      <g className="dk-spin-slow">
        <circle cx={C} cy={C - R - 9} r="5" fill="#22d3ee" opacity=".3" />
        <circle cx={C} cy={C - R - 9} r="2.4" fill="#fff" />
      </g>
      <g className="dk-spin-rev">
        <circle cx={C} cy={C + R + 9} r="4.4" fill="#f472b6" opacity=".3" />
        <circle cx={C} cy={C + R + 9} r="2" fill="#fdf2f8" />
      </g>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Collections                                                           */
/* ------------------------------------------------------------------ */

function OnyxFracture({ u }: { u: string }) {
  const shards: { a: number; r: number; s: number; rot: number }[] = [
    { a: 12, r: 55, s: 11, rot: 10 },
    { a: 48, r: 57, s: 8, rot: -20 },
    { a: 96, r: 55, s: 12, rot: 35 },
    { a: 140, r: 58, s: 7, rot: 0 },
    { a: 196, r: 55, s: 13, rot: -25 },
    { a: 238, r: 57, s: 9, rot: 15 },
    { a: 285, r: 55, s: 11, rot: -10 },
    { a: 326, r: 58, s: 7, rot: 40 },
  ];
  return (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b4a50" />
          <stop offset=".55" stopColor="#141b1f" />
          <stop offset="1" stopColor="#070a0c" />
        </linearGradient>
        <linearGradient id={`${u}e`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34d399" stopOpacity="0" />
          <stop offset=".5" stopColor="#ecfdf5" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 2} fill="none" stroke="#0b0f12" strokeWidth="4" />
      <circle cx={C} cy={C} r={R + 2} fill="none" stroke="#34d399" strokeOpacity=".55" strokeWidth="1" />
      {shards.map((sh, i) => {
        const [x, y] = polar(sh.a, sh.r);
        const p: [number, number][] = [
          [0, -sh.s],
          [sh.s * 0.45, -sh.s * 0.1],
          [sh.s * 0.18, sh.s * 0.9],
          [-sh.s * 0.4, sh.s * 0.25],
        ];
        return (
          <g key={i} transform={`translate(${f(x)} ${f(y)}) rotate(${sh.a + sh.rot})`}>
            <polygon points={pts(p)} fill={`url(#${u}s)`} stroke="#34d399" strokeWidth="0.9" strokeLinejoin="round" />
            <path d={`M0 ${-sh.s} L${sh.s * 0.18} ${sh.s * 0.9}`} stroke="#a7f3d0" strokeOpacity=".7" strokeWidth=".6" />
          </g>
        );
      })}
      <g className="dk-float">
        <polygon points="96,18 103,24 99,34 92,27" fill={`url(#${u}s)`} stroke="#6ee7b7" strokeWidth=".9" strokeLinejoin="round" />
      </g>
      <g className="dk-float dk-delay-2">
        <polygon points="20,92 27,96 24,105 17,100" fill={`url(#${u}s)`} stroke="#6ee7b7" strokeWidth=".9" strokeLinejoin="round" />
      </g>
      <g className="dk-spin-slow">
        <circle cx={C} cy={C} r={R + 2} fill="none" stroke={`url(#${u}e)`} strokeWidth="2" strokeDasharray="34 268" strokeLinecap="round" />
      </g>
    </>
  );
}

function PlasmaArc({ u }: { u: string }) {
  const arcs = ['M22 34 l6 4 -3 3 7 5 -2 2 6 4', 'M98 30 l-5 5 4 2 -6 5 3 2 -5 6', 'M104 82 l-7 2 2 4 -7 1 1 4 -7 2', 'M18 86 l7 1 -2 4 7 0 -1 4 7 1', 'M58 6 l3 6 -4 1 4 6 -3 1 3 6'];
  return (
    <>
      <defs>
        <radialGradient id={`${u}o`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".4" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <Glow id={`${u}g`} blur={2.2} />
      </defs>
      <circle cx={C} cy={C} r={R + 3} fill="none" stroke="#38bdf8" strokeOpacity=".5" strokeWidth="5" filter={`url(#${u}g)`} />
      <circle cx={C} cy={C} r={R + 3} fill="none" stroke="#7dd3fc" strokeOpacity=".85" strokeWidth="1.2" strokeDasharray="3 5" className="dk-spin-fast" />
      {arcs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#e0f2fe" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" className="dk-zap" style={{ animationDelay: `${i * 0.47}s` }} />
      ))}
      <g className="dk-spin">
        <circle cx={C} cy={C - R - 3} r="7" fill={`url(#${u}o)`} />
      </g>
      <g className="dk-spin-rev">
        <circle cx={C} cy={C + R + 3} r="5" fill={`url(#${u}o)`} />
      </g>
    </>
  );
}

function VoidRift({ u }: { u: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset=".6" stopColor="#7c3aed" stopOpacity=".6" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}r`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".35" stopColor="#f0abfc" />
          <stop offset=".7" stopColor="#c026d3" stopOpacity=".7" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 4} fill="none" stroke="#1e1033" strokeWidth="6" />
      <g className="dk-spin">
        <path d={arc(R + 4, 0, 150)} fill="none" stroke={`url(#${u}a)`} strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <g className="dk-spin-rev">
        <path d={arc(R + 8, 180, 290)} fill="none" stroke={`url(#${u}a)`} strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <g className="dk-rift" style={{ transformOrigin: '95px 26px' }}>
        <path d="M84 14 C92 20 96 22 106 36 C98 32 92 30 84 14Z" fill={`url(#${u}r)`} />
        <path d="M86 16 L92 22 L95 25 L101 31 L105 35" fill="none" stroke="#fff" strokeWidth=".9" strokeOpacity=".9" />
      </g>
      {[
        [76, 20],
        [110, 46],
        [104, 18],
        [70, 10],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="#f5d0fe" className="dk-pull" style={{ animationDelay: `${i * 0.6}s`, ['--dx' as string]: `${95 - x}px`, ['--dy' as string]: `${26 - y}px` }} />
      ))}
    </>
  );
}

function DragonEmber({ u }: { u: string }) {
  const flames = [
    { x: 38, h: 13, d: 0 },
    { x: 48, h: 18, d: 0.3 },
    { x: 60, h: 21, d: 0.15 },
    { x: 72, h: 18, d: 0.45 },
    { x: 82, h: 13, d: 0.2 },
  ];
  return (
    <>
      <defs>
        <linearGradient id={`${u}f`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#dc2626" />
          <stop offset=".5" stopColor="#f97316" />
          <stop offset="1" stopColor="#fde047" />
        </linearGradient>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset=".5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 3} fill="none" stroke="#7f1d1d" strokeWidth="4" />
      <circle cx={C} cy={C} r={R + 3} fill="none" stroke={`url(#${u}g)`} strokeWidth="1.2" />
      {flames.map((fl) => (
        <path
          key={fl.x}
          className="dk-flame"
          style={{ animationDelay: `${fl.d}s`, transformOrigin: `${fl.x}px 118px` }}
          d={`M${fl.x} 118 C${fl.x - 6} ${118 - fl.h * 0.5} ${fl.x - 2} ${118 - fl.h * 0.75} ${fl.x} ${118 - fl.h} C${fl.x + 2} ${118 - fl.h * 0.75} ${fl.x + 6} ${118 - fl.h * 0.5} ${fl.x} 118Z`}
          fill={`url(#${u}f)`}
        />
      ))}
      <path d="M22 30 C10 22 12 8 20 4 C18 12 22 18 30 20 C26 24 24 26 22 30Z" fill={`url(#${u}g)`} stroke="#78350f" strokeWidth=".7" strokeLinejoin="round" />
      <path d="M98 30 C110 22 108 8 100 4 C102 12 98 18 90 20 C94 24 96 26 98 30Z" fill={`url(#${u}g)`} stroke="#78350f" strokeWidth=".7" strokeLinejoin="round" />
      <path d="M26 24 C30 16 36 12 44 12 M94 24 C90 16 84 12 76 12" fill="none" stroke="#fbbf24" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="60" cy="9" r="3.2" fill="#dc2626" stroke={`url(#${u}g)`} strokeWidth="1.4" />
      {[30, 48, 66, 82, 92].map((x, i) => (
        <circle key={x} cx={x} cy="104" r="1.3" fill="#fde047" className="dk-ember" style={{ animationDelay: `${i * 0.55}s` }} />
      ))}
    </>
  );
}

function CelestialOrbit({ u }: { u: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${u}p`} cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 6} fill="none" stroke="#c7d2fe" strokeOpacity=".35" strokeWidth=".8" strokeDasharray="1.5 3.5" />
      <ellipse cx={C} cy={C} rx={R + 12} ry={R - 24} fill="none" stroke="#a5b4fc" strokeOpacity=".5" strokeWidth=".9" transform={`rotate(-24 ${C} ${C})`} />
      <g className="dk-spin-slow">
        <circle cx={C} cy={C - R - 6} r="4.6" fill={`url(#${u}p)`} />
        <ellipse cx={C} cy={C - R - 6} rx="8" ry="2" fill="none" stroke="#fde68a" strokeWidth=".9" transform={`rotate(-18 ${C} ${C - R - 6})`} />
      </g>
      <g className="dk-spin-rev">
        <circle cx={C + R + 6} cy={C} r="2.2" fill="#e0e7ff" />
      </g>
      <path d="M18 22 A13 13 0 1 0 34 8 A10 10 0 1 1 18 22Z" fill="#fef9c3" />
      <circle cx="21" cy="14" r="1.2" fill="#fde68a" opacity=".8" />
      <Star4 x={104} y={20} s={4.5} fill="#fff" className="dk-twinkle" />
      <Star4 x={110} y={86} s={3} fill="#c7d2fe" className="dk-twinkle" style={{ animationDelay: '.8s' }} />
      <Star4 x={14} y={96} s={3.6} fill="#fef3c7" className="dk-twinkle" style={{ animationDelay: '1.6s' }} />
      <Star4 x={86} y={110} s={2.4} fill="#fff" className="dk-twinkle" style={{ animationDelay: '2.2s' }} />
    </>
  );
}

function Sakura({ u }: { u: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${u}p`} cx=".5" cy=".5" r=".6">
          <stop offset="0" stopColor="#fff1f7" />
          <stop offset="1" stopColor="#f9a8d4" />
        </radialGradient>
      </defs>
      <path d="M12 104 C6 80 6 52 18 32 C26 18 40 8 58 6" fill="none" stroke="#5b3a29" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M14 70 C22 66 26 60 26 52 M24 30 C32 32 38 28 42 22 M10 92 C18 92 22 88 24 82" fill="none" stroke="#5b3a29" strokeWidth="1.8" strokeLinecap="round" />
      <Blossom x={58} y={7} r={7} fill={`url(#${u}p)`} rot={10} />
      <Blossom x={28} y={52} r={6} fill={`url(#${u}p)`} rot={40} />
      <Blossom x={43} y={21} r={5.5} fill={`url(#${u}p)`} rot={-20} />
      <Blossom x={16} y={33} r={7.5} fill={`url(#${u}p)`} />
      <Blossom x={9} y={72} r={6} fill={`url(#${u}p)`} rot={25} />
      <Blossom x={25} y={83} r={5} fill={`url(#${u}p)`} rot={-30} />
      <circle cx="72" cy="6" r="2.4" fill="#f472b6" />
      <circle cx="6" cy="54" r="2.2" fill="#f472b6" />
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx={40 + i * 22} cy={18 + i * 6} rx="3" ry="1.7" fill="#fbcfe8" className="dk-petal" style={{ animationDelay: `${i * 1.3}s` }} />
      ))}
    </>
  );
}

function PixelHearts() {
  const squares: ReactElement[] = [];
  const n = 32;
  for (let i = 0; i < n; i++) {
    const [x, y] = polar((360 / n) * i, R + 5);
    squares.push(<rect key={i} x={x - 2.3} y={y - 2.3} width="4.6" height="4.6" fill={i % 2 ? '#22d3ee' : '#a855f7'} className="dk-chase" style={{ animationDelay: `${(i / n) * 2}s` }} />);
  }
  const heart = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  const Heart = ({ x, y, d }: { x: number; y: number; d: number }) => (
    <g className="dk-bob" style={{ animationDelay: `${d}s` }} transform={`translate(${x} ${y})`}>
      {heart.flatMap((row, ry) =>
        row.split('').map((c, rx) => (c === 'X' ? <rect key={`${rx}-${ry}`} x={rx * 2} y={ry * 2} width="2.05" height="2.05" fill={ry === 1 && rx === 1 ? '#fecdd3' : '#f43f5e'} /> : null)),
      )}
    </g>
  );
  return (
    <g shapeRendering="crispEdges">
      {squares}
      <Heart x={36} y={0} d={0} />
      <Heart x={53} y={-3} d={0.25} />
      <Heart x={70} y={0} d={0.5} />
      <g className="dk-coin" style={{ transformOrigin: '104px 104px' }}>
        <circle cx="104" cy="104" r="7" fill="#fbbf24" stroke="#b45309" strokeWidth="1.4" shapeRendering="geometricPrecision" />
        <rect x="102.6" y="99.5" width="2.8" height="9" fill="#fef3c7" />
      </g>
    </g>
  );
}

function HauntedHarvest({ u }: { u: string }) {
  const Pumpkin = ({ x, y, s }: { x: number; y: number; s: number }) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="-7" cy="0" rx="8" ry="10" fill={`url(#${u}p)`} />
      <ellipse cx="7" cy="0" rx="8" ry="10" fill={`url(#${u}p)`} />
      <ellipse cx="0" cy="0" rx="8" ry="10.5" fill={`url(#${u}p)`} stroke="#9a3412" strokeWidth=".6" />
      <path d="M-1 -10 C-1 -14 1 -16 4 -17" stroke="#365314" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <g className="dk-glow">
        <path d="M-7 -3 L-3 -6 L-2 -1Z M7 -3 L3 -6 L2 -1Z" fill="#fde047" />
        <path d="M-8 3 Q0 10 8 3 L5 4 L3 2 L1 5 L-1 2 L-3 5 L-5 2Z" fill="#fde047" />
      </g>
    </g>
  );
  const Bat = ({ x, y, s, d }: { x: number; y: number; s: number; d: number }) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="dk-bat" style={{ animationDelay: `${d}s` }}>
        <path d="M0 0 C-3 -3 -6 -3 -10 -6 C-9 -2 -11 0 -14 1 C-10 1 -7 3 -5 5 C-3 3 -1 3 0 4 C1 3 3 3 5 5 C7 3 10 1 14 1 C11 0 9 -2 10 -6 C6 -3 3 -3 0 0Z" fill="#1e1033" />
        <circle cx="-1.5" cy="0" r=".7" fill="#fde047" />
        <circle cx="1.5" cy="0" r=".7" fill="#fde047" />
      </g>
    </g>
  );
  return (
    <>
      <defs>
        <radialGradient id={`${u}p`} cx=".4" cy=".35" r=".75">
          <stop offset="0" stopColor="#fdba74" />
          <stop offset=".6" stopColor="#f97316" />
          <stop offset="1" stopColor="#9a3412" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 3} fill="none" stroke="#2e1065" strokeWidth="4" />
      <circle cx={C} cy={C} r={R + 3} fill="none" stroke="#f97316" strokeOpacity=".6" strokeWidth="1" strokeDasharray="6 4" />
      <path d="M104 14 L104 30" stroke="#cbd5e1" strokeWidth=".5" />
      <g className="dk-spider" style={{ transformOrigin: '104px 14px' }}>
        <circle cx="104" cy="32" r="3" fill="#0f0a1a" />
        <path d="M100 30 l-3 -2 M100 33 l-3 1 M108 30 l3 -2 M108 33 l3 1" stroke="#0f0a1a" strokeWidth=".9" />
      </g>
      <g className="dk-fog">
        <ellipse cx="60" cy="112" rx="40" ry="6" fill="#c4b5fd" opacity=".22" />
      </g>
      <Pumpkin x={20} y={102} s={1} />
      <Pumpkin x={38} y={111} s={0.62} />
      <path d="M26 110 C34 115 44 117 52 113" stroke="#365314" strokeWidth="1.4" fill="none" />
      <Bat x={30} y={16} s={0.9} d={0} />
      <Bat x={84} y={8} s={0.7} d={0.4} />
      <Bat x={108} y={64} s={0.55} d={0.8} />
    </>
  );
}

function WinterCrystal({ u }: { u: string }) {
  const spikes = [
    { a: -40, h: 12, w: 5 },
    { a: -22, h: 18, w: 6 },
    { a: 0, h: 24, w: 7 },
    { a: 22, h: 18, w: 6 },
    { a: 40, h: 12, w: 5 },
    { a: -58, h: 8, w: 4 },
    { a: 58, h: 8, w: 4 },
  ];
  return (
    <>
      <defs>
        <linearGradient id={`${u}i`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 2.5} fill="none" stroke={`url(#${u}i)`} strokeWidth="3" />
      <circle cx={C} cy={C} r={R + 5.5} fill="none" stroke="#e0f2fe" strokeOpacity=".4" strokeWidth=".8" strokeDasharray="2 3" />
      {spikes.map((sp, i) => {
        const [bx1, by1] = polar(sp.a - sp.w / 2.4, R + 2);
        const [bx2, by2] = polar(sp.a + sp.w / 2.4, R + 2);
        const [tx, ty] = polar(sp.a, R + 2 + sp.h);
        return (
          <g key={i}>
            <polygon
              points={pts([
                [bx1, by1],
                [tx, ty],
                [bx2, by2],
              ])}
              fill={`url(#${u}i)`}
              stroke="#e0f2fe"
              strokeWidth=".6"
              strokeLinejoin="round"
            />
            <path d={`M${f(tx)} ${f(ty)} L${f((bx1 + bx2) / 2)} ${f((by1 + by2) / 2)}`} stroke="#fff" strokeOpacity=".8" strokeWidth=".6" />
          </g>
        );
      })}
      <Snowflake x={12} y={60} s={6} stroke="#e0f2fe" className="dk-spin-self" />
      <Snowflake x={108} y={60} s={5} stroke="#bae6fd" className="dk-spin-self" style={{ animationDelay: '-2s' }} />
      <Star4 x={92} y={14} s={3} fill="#fff" className="dk-twinkle" />
      <Star4 x={30} y={108} s={2.4} fill="#e0f2fe" className="dk-twinkle" style={{ animationDelay: '1.4s' }} />
    </>
  );
}

/** A ring of rolling water with foam, glints and a shell – no sun disc. */
function SummerTide({ u }: { u: string }) {
  const r = 52;
  const wave = (rr: number, amp: number, n: number) => {
    const steps = 144;
    const p: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 360;
      const [x, y] = polar(a, rr + Math.sin(((a * n) / 180) * Math.PI) * amp);
      p.push(`${i ? 'L' : 'M'}${f(x)} ${f(y)}`);
    }
    return `${p.join(' ')}Z`;
  };
  return (
    <>
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset=".5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
        <radialGradient id={`${u}sh`} cx=".3" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff7ed" />
          <stop offset=".6" stopColor="#fdba74" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={r} fill="none" stroke="#083344" strokeOpacity=".6" strokeWidth="7" />
      <g className="dk-spin-slower">
        <path d={wave(r, 0.9, 16)} fill="none" stroke={`url(#${u}w)`} strokeWidth="3.4" strokeLinejoin="round" />
      </g>
      <g className="dk-spin-rev-slow">
        <path d={wave(r + 3.4, 0.7, 16)} fill="none" stroke="#ecfeff" strokeOpacity=".7" strokeWidth=".9" strokeDasharray="7 5" strokeLinecap="round" />
      </g>
      {[30, 150, 250, 330].map((a, i) => {
        const [x, y] = polar(a, r + 0.5);
        return <Star4 key={a} x={x} y={y} s={2.6} fill="#fff" className="dk-twinkle" style={{ animationDelay: `${i * 0.6}s` }} />;
      })}
      <g transform="translate(96 98) rotate(-24)">
        <path d="M0 -10 C6 -10 10 -4 10 2 C10 6 6 9 0 9 C-6 9 -10 6 -10 2 C-10 -4 -6 -10 0 -10Z" fill={`url(#${u}sh)`} stroke="#9a3412" strokeWidth=".7" />
        <path
          d="M0 -9 V8 M-5 -7 C-3 -2 -2 4 -2.4 8.4 M5 -7 C3 -2 2 4 2.4 8.4 M-8.6 -2 C-6 2 -5.6 5 -6 7.6 M8.6 -2 C6 2 5.6 5 6 7.6"
          fill="none"
          stroke="#9a3412"
          strokeOpacity=".55"
          strokeWidth=".7"
        />
        <path d="M-3.6 9 H3.6 L2.4 12 H-2.4Z" fill="#fdba74" stroke="#9a3412" strokeWidth=".6" />
      </g>
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={16 + i * 6}
          cy={96 - i * 7}
          r={1.6 - i * 0.3}
          fill="none"
          stroke="#ecfeff"
          strokeOpacity=".8"
          strokeWidth=".7"
          className="dk-bubble"
          style={{ animationDelay: `${i * 0.9}s` }}
        />
      ))}
    </>
  );
}

const SVG_DECOS: Record<string, (p: { u: string }) => ReactElement> = {
  aurora: AuroraRing,
  facet: Facet,
  orbit: Orbit,
  pulse: Pulse,
  ember: EmberRing,
  laurel: Laurel,
  crown: Crown,
  headset: Headset,
  'neon-ears': NeonEars,
  'holo-scan': HoloScan,
  'neon-halo': NeonHalo,
  'onyx-fracture': OnyxFracture,
  'plasma-arc': PlasmaArc,
  'void-rift': VoidRift,
  'dragon-ember': DragonEmber,
  'celestial-orbit': CelestialOrbit,
  sakura: Sakura,
  'pixel-hearts': PixelHearts,
  'haunted-harvest': HauntedHarvest,
  'winter-crystal': WinterCrystal,
  'summer-tide': SummerTide,
};

export const AvatarDecoration = memo(function AvatarDecoration({ id }: { id: string }) {
  const u = useId().replace(/:/g, '');
  const Deco = SVG_DECOS[id];
  if (!Deco) return null;
  return (
    <span className="avatar-deco media-anim" aria-hidden>
      <svg viewBox="0 0 120 120" overflow="visible">
        <Deco u={u} />
      </svg>
    </span>
  );
});

export const isDecoration = (id: string | undefined) => !!id && id in SVG_DECOS;
