import { memo, useId, useMemo, type ReactElement } from 'react';
import type { AvatarArtStyle, AvatarMotif } from '../../types';
import { MotifArt } from '../cosmetics/Motifs';
import { rng } from '../../lib/utils';

interface Props {
  style: AvatarArtStyle;
  hue: number;
  hue2?: number;
  seed: number;
  animated?: boolean;
  motif?: AvatarMotif;
}

/**
 * Procedural avatar artwork. Stands in for uploaded pictures in the demo and
 * doubles as free, built-in avatar presets (including animated ones).
 */
export const AvatarArt = memo(function AvatarArt({ style, hue, hue2, seed, animated, motif }: Props) {
  const uid = useId().replace(/:/g, '');
  const h2 = hue2 ?? (hue + 40) % 360;
  const content = useMemo(() => {
    const rand = rng(seed * 9973 + hue);
    switch (style) {
      case 'pixel': {
        const cells: ReactElement[] = [];
        for (let y = 0; y < 5; y++) {
          for (let x = 0; x < 3; x++) {
            if (rand() > 0.48) {
              const light = rand() > 0.75;
              const fill = light ? `hsl(${hue} 85% 74%)` : `hsl(${hue} 72% 56%)`;
              [x, 4 - x].forEach((cx, i) => {
                if (i === 1 && cx === x) return;
                cells.push(<rect key={`${x}-${y}-${i}`} x={20 + cx * 12} y={20 + y * 12} width="12.4" height="12.4" fill={fill} />);
              });
            }
          }
        }
        return (
          <>
            <defs>
              <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={`hsl(${hue} 32% 17%)`} />
                <stop offset="1" stopColor={`hsl(${hue} 38% 9%)`} />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}bg)`} />
            {cells}
          </>
        );
      }
      case 'orb':
        return (
          <>
            <defs>
              <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={`hsl(${hue} 55% 24%)`} />
                <stop offset="1" stopColor={`hsl(${h2} 55% 10%)`} />
              </linearGradient>
              <radialGradient id={`${uid}a`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor={`hsl(${hue} 90% 66%)`} />
                <stop offset="1" stopColor={`hsl(${hue} 90% 50%)`} stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${uid}b`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor={`hsl(${h2} 85% 62%)`} />
                <stop offset="1" stopColor={`hsl(${h2} 85% 50%)`} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}bg)`} />
            <circle cx={30 + rand() * 12} cy={30 + rand() * 12} r="44" fill={`url(#${uid}a)`} />
            <circle cx={66 + rand() * 10} cy={68 + rand() * 10} r="34" fill={`url(#${uid}b)`} opacity=".9" />
            <ellipse cx="34" cy="28" rx="10" ry="6" fill="#fff" opacity=".22" transform="rotate(-30 34 28)" />
          </>
        );
      case 'facet': {
        const pts: [number, number][][] = [];
        const n = 4;
        for (let y = 0; y <= n; y++) {
          pts.push([]);
          for (let x = 0; x <= n; x++) {
            const edgeX = x === 0 || x === n;
            const edgeY = y === 0 || y === n;
            pts[y].push([(x / n) * 100 + (edgeX ? 0 : (rand() - 0.5) * 18), (y / n) * 100 + (edgeY ? 0 : (rand() - 0.5) * 18)]);
          }
        }
        const tris: ReactElement[] = [];
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const a = pts[y][x], b = pts[y][x + 1], c = pts[y + 1][x], d = pts[y + 1][x + 1];
            const t1 = [a, b, d], t2 = [a, d, c];
            [t1, t2].forEach((t, i) => {
              const light = 16 + rand() * 30 + (1 - (x + y) / (2 * n)) * 14;
              tris.push(<polygon key={`${x}${y}${i}`} points={t.map((p) => p.join(',')).join(' ')} fill={`hsl(${hue + (rand() - 0.5) * 16} ${48 + rand() * 20}% ${light}%)`} />);
            });
          }
        }
        return <>{tris}</>;
      }
      case 'wave': {
        const waves = [0, 1, 2, 3].map((i) => {
          const y = 34 + i * 16;
          const amp = 6 + rand() * 6;
          const ph = rand() * 40;
          const hh = hue + ((h2 - hue) * i) / 3;
          return <path key={i} d={`M-10 ${y} C ${20 + ph} ${y - amp * 2}, ${50 - ph / 2} ${y + amp * 2}, 110 ${y - amp} V110 H-10 Z`} fill={`hsl(${hh} 65% ${52 - i * 9}%)`} opacity={0.95} />;
        });
        return (
          <>
            <rect width="100" height="100" fill={`hsl(${hue} 45% 14%)`} />
            <circle cx="72" cy="24" r="10" fill={`hsl(${hue} 90% 85%)`} opacity=".7" />
            {waves}
          </>
        );
      }
      case 'rings': {
        const cx = 40 + rand() * 20;
        const cy = 40 + rand() * 20;
        return (
          <>
            <rect width="100" height="100" fill={`hsl(${hue} 40% 12%)`} />
            {[78, 62, 46, 30, 14].map((r, i) => (
              <circle key={r} cx={cx} cy={cy} r={r} fill={`hsl(${hue + i * 6} ${55 + i * 5}% ${18 + i * 9}%)`} />
            ))}
            <circle cx={cx} cy={cy} r="6" fill={`hsl(${hue} 90% 80%)`} />
          </>
        );
      }
      case 'aurora':
      default:
        return (
          <>
            <defs>
              <radialGradient id={`${uid}a`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor={`hsl(${hue} 90% 60%)`} />
                <stop offset="1" stopColor={`hsl(${hue} 90% 60%)`} stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${uid}b`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor={`hsl(${h2} 90% 62%)`} />
                <stop offset="1" stopColor={`hsl(${h2} 90% 62%)`} stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${uid}c`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor={`hsl(${(hue + 300) % 360} 80% 70%)`} />
                <stop offset="1" stopColor={`hsl(${(hue + 300) % 360} 80% 70%)`} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100" height="100" fill={`hsl(${hue} 45% 8%)`} />
            <g className={animated ? 'art-spin' : undefined}>
              <circle cx="32" cy="34" r="46" fill={`url(#${uid}a)`} />
              <circle cx="72" cy="62" r="42" fill={`url(#${uid}b)`} />
            </g>
            <g className={animated ? 'art-spin-rev' : undefined}>
              <circle cx="60" cy="20" r="26" fill={`url(#${uid}c)`} opacity=".55" />
            </g>
            <path d="M8 70 Q 50 52 92 74" stroke="#fff" strokeOpacity=".25" strokeWidth="2" fill="none" />
          </>
        );
    }
  }, [style, hue, h2, seed, uid, animated]);

  if (style === 'motif' && motif) {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="avatar-art" aria-hidden>
        <MotifArt motif={motif} u={uid} animated={animated} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="avatar-art" aria-hidden>
      {content}
    </svg>
  );
});
