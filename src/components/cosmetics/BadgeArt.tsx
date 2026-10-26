/** Badge artwork (24×24 viewBox, readable from 16 px to 64 px). */
import { useId, type ReactElement } from 'react';
import type { BadgeId } from '../../types';
import { GemMark } from '../ui/icons';

type Art = (u: string) => ReactElement;

const medal = (u: string, c1: string, c2: string, ribbon: string, label: string, size = 6.2): ReactElement => (
  <>
    <defs>
      <linearGradient id={`${u}m`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={c1} />
        <stop offset="1" stopColor={c2} />
      </linearGradient>
    </defs>
    <path d="M7 1.5 L10.5 9 L8.5 10 L5 2.8Z" fill={ribbon} />
    <path d="M17 1.5 L13.5 9 L15.5 10 L19 2.8Z" fill={ribbon} opacity=".8" />
    <circle cx="12" cy="14.5" r="8" fill={`url(#${u}m)`} stroke="#00000033" strokeWidth=".6" />
    <circle cx="12" cy="14.5" r="6.3" fill="none" stroke="#ffffff55" strokeWidth=".7" />
    <text x="12" y="16.9" textAnchor="middle" fontFamily="Inter Variable, Arial, sans-serif" fontWeight="900" fontSize={size} fill="#1c1917">
      {label}
    </text>
  </>
);

const ART: Record<BadgeId, Art> = {
  founder: () => <GemMark size={24} />,
  team: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5EEAD4" />
          <stop offset="1" stopColor="#0F766E" />
        </linearGradient>
      </defs>
      <path d="M12 2l8 3v6.5c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5V5z" fill={`url(#${u}t)`} />
      <path d="M9.4 6.8h5.2l1.9 1.9v5.6l-1.9 1.9H9.4l-1.9-1.9V8.7z" fill="#042f2e" opacity=".85" />
      <path d="M10.2 8.3h3.6l1.1 1.1v4.2l-1.1 1.1h-3.6l-1.1-1.1V9.4z" fill="#5EEAD4" />
    </>
  ),
  verified: () => (
    <>
      <path d="M12 1.8l2.5 1.9 3.1-.2 1 2.9 2.6 1.8-.9 3 .9 3-2.6 1.8-1 2.9-3.1-.2L12 20.6l-2.5-1.9-3.1.2-1-2.9-2.6-1.8.9-3-.9-3 2.6-1.8 1-2.9 3.1.2z" fill="#4DA3F0" />
      <path d="M8 11.4l2.7 2.7L16.2 8.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'founding-member': (u) => (
    <>
      <defs>
        <linearGradient id={`${u}k`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path d="M3 21 V11 A9 9 0 0 1 21 11 V21 H16.5 V12 A4.5 4.5 0 0 0 7.5 12 V21Z" fill={`url(#${u}k)`} stroke="#78350f" strokeWidth=".6" />
      <path d="M9.6 4.4 L12 2 L14.4 4.4 L13.6 7.6 H10.4Z" fill="#10b981" stroke="#065f46" strokeWidth=".6" />
      <path d="M3 21 H21" stroke="#78350f" strokeWidth="1.2" />
    </>
  ),
  'first-100': (u) => medal(u, '#fef3c7', '#d97706', '#10b981', '100'),
  'first-1000': (u) => medal(u, '#f1f5f9', '#94a3b8', '#3b82f6', '1K', 7),
  'first-10000': (u) => medal(u, '#fed7aa', '#c2410c', '#8b5cf6', '10K', 5.6),
  'closed-beta': (u) => (
    <>
      <defs>
        <linearGradient id={`${u}l`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <path d="M9 2.5 H15 M10 2.5 V9 L4.5 18.5 A2 2 0 0 0 6.3 21.5 H17.7 A2 2 0 0 0 19.5 18.5 L14 9 V2.5" fill="#1f2a2f" stroke="#cbd5e1" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.3 14.5 H16.7 L19 18.6 A1.6 1.6 0 0 1 17.6 21 H6.4 A1.6 1.6 0 0 1 5 18.6Z" fill={`url(#${u}l)`} />
      <circle cx="10" cy="17.5" r="1.2" fill="#ecfdf5" />
      <circle cx="13.6" cy="16" r=".8" fill="#ecfdf5" />
      <circle cx="12.4" cy="12" r=".7" fill="#6ee7b7" />
    </>
  ),
  'halloween-2026': (u) => (
    <>
      <defs>
        <radialGradient id={`${u}p`} cx=".4" cy=".35" r=".75">
          <stop offset="0" stopColor="#fdba74" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <ellipse cx="7.5" cy="14" rx="5" ry="7" fill={`url(#${u}p)`} />
      <ellipse cx="16.5" cy="14" rx="5" ry="7" fill={`url(#${u}p)`} />
      <ellipse cx="12" cy="14" rx="5.4" ry="7.4" fill={`url(#${u}p)`} stroke="#9a3412" strokeWidth=".5" />
      <path d="M11.5 6.8 C11.5 4.5 13 3 15 2.5" stroke="#365314" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M7.5 12 L10 10.5 L10.4 13Z M16.5 12 L14 10.5 L13.6 13Z M7 16 Q12 21 17 16 L15 16.6 L13.8 15.6 L12.6 17 L11.4 15.6 L10.2 17 L9 15.6Z" fill="#fde047" />
    </>
  ),
  'winter-2026': (u) => (
    <>
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path d="M12 1.5 L21 6.7 V17.3 L12 22.5 L3 17.3 V6.7Z" fill={`url(#${u}w)`} stroke="#1e40af" strokeWidth=".6" />
      <g stroke="#fff" strokeWidth="1.3" strokeLinecap="round" fill="none">
        {[0, 60, 120].map((r) => (
          <g key={r} transform={`rotate(${r} 12 12)`}>
            <path d="M12 5.5 V18.5" />
            <path d="M10.2 7 L12 8.4 L13.8 7 M10.2 17 L12 15.6 L13.8 17" />
          </g>
        ))}
      </g>
    </>
  ),
  'summer-2027': (u) => (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f97316" />
          <stop offset=".55" stopColor="#fb7185" />
          <stop offset=".56" stopColor="#0891b2" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
        <clipPath id={`${u}c`}>
          <circle cx="12" cy="12" r="10" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="10" fill={`url(#${u}s)`} />
      <g clipPath={`url(#${u}c)`}>
        <path d="M5 13 A7 7 0 0 1 19 13Z" fill="#fde047" />
        <path d="M1 15.5 Q4 14 7 15.5 T13 15.5 T19 15.5 T25 15.5 M1 18.5 Q4 17 7 18.5 T13 18.5 T19 18.5 T25 18.5" stroke="#a5f3fc" strokeWidth="1.1" fill="none" />
      </g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#fde68a" strokeWidth=".8" />
    </>
  ),
  'bug-hunter': () => (
    <>
      <circle cx="12" cy="12" r="10" fill="#365314" />
      <ellipse cx="12" cy="13.5" rx="4" ry="5" fill="#A3E635" />
      <circle cx="12" cy="7.6" r="2.4" fill="#A3E635" />
      <path d="M8 11H5.5M8 14.5H5M8.5 17.5l-2 1.5M16 11h2.5M16 14.5h3M15.5 17.5l2 1.5" stroke="#A3E635" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 9.3v8.7" stroke="#365314" strokeWidth="1.2" />
    </>
  ),
  'community-builder': (u) => (
    <>
      <defs>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fda4af" />
          <stop offset="1" stopColor="#be123c" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="15" width="9" height="5.5" rx="1" fill="#d97706" />
      <rect x="12.5" y="15" width="9" height="5.5" rx="1" fill="#b45309" />
      <rect x="7.5" y="9" width="9" height="5.5" rx="1" fill="#f59e0b" />
      <path d="M12 7.5 C9 5.4 7.6 4 7.6 2.9 C7.6 1.9 8.4 1.2 9.3 1.2 C10.4 1.2 11.3 2 12 2.9 C12.7 2 13.6 1.2 14.7 1.2 C15.6 1.2 16.4 1.9 16.4 2.9 C16.4 4 15 5.4 12 7.5Z" fill={`url(#${u}b)`} />
    </>
  ),
  regular: () => (
    <>
      <path d="M3 5.5 A2.5 2.5 0 0 1 5.5 3 H14 A2.5 2.5 0 0 1 16.5 5.5 V10 A2.5 2.5 0 0 1 14 12.5 H8 L4.5 15.5 V12.4 A2.5 2.5 0 0 1 3 10Z" fill="#10b981" />
      <path d="M9.5 13.5 V14 A2.5 2.5 0 0 0 12 16.5 H17 L20 19.5 V16.3 A2.5 2.5 0 0 0 21 14 V9.5 A2.5 2.5 0 0 0 18.5 7 H17.5 V10 A3.5 3.5 0 0 1 14 13.5Z" fill="#38bdf8" />
      <circle cx="7" cy="7.8" r="1" fill="#ecfdf5" />
      <circle cx="9.8" cy="7.8" r="1" fill="#ecfdf5" />
      <circle cx="12.6" cy="7.8" r="1" fill="#ecfdf5" />
    </>
  ),
  supporter: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DBEAFE" />
          <stop offset=".45" stopColor="#60A5FA" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path d="M12 2.5l8.5 7L12 21.5 3.5 9.5z" fill={`url(#${u}c)`} />
      <path d="M3.5 9.5h17L12 21.5z" fill="#1e3a8a" opacity=".35" />
      <path d="M12 2.5l3.6 7H8.4z" fill="#fff" opacity=".6" />
      <path d="M8.4 9.5 12 21.5l3.6-12" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth=".6" />
    </>
  ),
  creator: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E9D5FF" />
          <stop offset="1" stopColor="#9333EA" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="5" width="19" height="14" rx="4" fill={`url(#${u}p)`} />
      <path d="M10 9.2v5.6l4.8-2.8z" fill="#fff" />
    </>
  ),
  'onyx-og': (u) => (
    <>
      <defs>
        <linearGradient id={`${u}o`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a363c" />
          <stop offset="1" stopColor="#070a0c" />
        </linearGradient>
        <linearGradient id={`${u}e`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a7f3d0" />
          <stop offset=".5" stopColor="#10b981" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <path d="M8.2 1.8h7.6l5.4 5.4v9.6l-5.4 5.4H8.2l-5.4-5.4V7.2z" fill={`url(#${u}o)`} stroke={`url(#${u}e)`} strokeWidth="1.3" />
      <path d="M8.9 3.6h6.2" stroke="#fff" strokeOpacity=".22" strokeWidth=".8" strokeLinecap="round" />
      <text x="12" y="15.6" textAnchor="middle" fontFamily="Inter Variable, Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="8.4" letterSpacing="-.3" fill={`url(#${u}e)`}>
        OG
      </text>
    </>
  ),
};

export function BadgeArt({ badge, size = 20, locked }: { badge: BadgeId; size?: number; locked?: boolean }) {
  const u = useId().replace(/:/g, '');
  const art = ART[badge];
  if (!art) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={locked ? { filter: 'grayscale(1) brightness(.55)', opacity: 0.7 } : undefined}>
      {art(u)}
    </svg>
  );
}
