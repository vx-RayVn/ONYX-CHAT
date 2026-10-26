/**
 * Small SVG flags for the registration country (4:3, drawn in a 24×18 box).
 * Countries without a drawing use the flag emoji, which renders everywhere
 * thanks to the flag font fallback (lib/flagEmoji.ts).
 */
import type { ReactElement } from 'react';
import { countryName } from '../../i18n';
import { flagEmoji } from '../../lib/flagEmoji';
import { canonicalCountryCode } from '../../lib/countries';
import { Tooltip } from './Tooltip';

const h3 = (a: string, b: string, c: string) => (
  <>
    <rect width="24" height="6" fill={a} />
    <rect y="6" width="24" height="6" fill={b} />
    <rect y="12" width="24" height="6" fill={c} />
  </>
);
const v3 = (a: string, b: string, c: string) => (
  <>
    <rect width="8" height="18" fill={a} />
    <rect x="8" width="8" height="18" fill={b} />
    <rect x="16" width="8" height="18" fill={c} />
  </>
);

const FLAGS: Record<string, ReactElement> = {
  DE: h3('#111', '#dd0000', '#ffce00'),
  AT: h3('#ed2939', '#fff', '#ed2939'),
  NL: h3('#ae1c28', '#fff', '#21468b'),
  UA: (
    <>
      <rect width="24" height="9" fill="#0057b7" />
      <rect y="9" width="24" height="9" fill="#ffd700" />
    </>
  ),
  PL: (
    <>
      <rect width="24" height="9" fill="#fff" />
      <rect y="9" width="24" height="9" fill="#dc143c" />
    </>
  ),
  IT: v3('#009246', '#fff', '#ce2b37'),
  FR: v3('#002395', '#fff', '#ed2939'),
  ES: (
    <>
      <rect width="24" height="18" fill="#aa151b" />
      <rect y="4.5" width="24" height="9" fill="#f1bf00" />
    </>
  ),
  CH: (
    <>
      <rect width="24" height="18" fill="#da291c" />
      <rect x="10.2" y="4" width="3.6" height="10" fill="#fff" />
      <rect x="7" y="7.2" width="10" height="3.6" fill="#fff" />
    </>
  ),
  SE: (
    <>
      <rect width="24" height="18" fill="#006aa7" />
      <rect x="7" width="3.2" height="18" fill="#fecc00" />
      <rect y="7.4" width="24" height="3.2" fill="#fecc00" />
    </>
  ),
  JP: (
    <>
      <rect width="24" height="18" fill="#fff" />
      <circle cx="12" cy="9" r="4.8" fill="#bc002d" />
    </>
  ),
  TR: (
    <>
      <rect width="24" height="18" fill="#e30a17" />
      <circle cx="9.5" cy="9" r="4.6" fill="#fff" />
      <circle cx="10.7" cy="9" r="3.7" fill="#e30a17" />
      <path d="M15.6 9 l-2.6.85 1.6-2.2v2.7l-1.6-2.2z" fill="#fff" />
    </>
  ),
  US: (
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={i * 2.58} width="24" height="1.29" fill="#b22234" />
      ))}
      <rect y="1.29" width="24" height="1.29" fill="#fff" opacity="0" />
      <rect width="10.5" height="9.7" fill="#3c3b6e" />
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={1.6 + (i % 4) * 2.4} cy={1.7 + Math.floor(i / 4) * 3} r=".55" fill="#fff" />
      ))}
    </>
  ),
  GB: (
    <>
      <rect width="24" height="18" fill="#012169" />
      <path d="M0 0 L24 18 M24 0 L0 18" stroke="#fff" strokeWidth="3.6" />
      <path d="M0 0 L24 18 M24 0 L0 18" stroke="#c8102e" strokeWidth="1.2" />
      <path d="M12 0 V18 M0 9 H24" stroke="#fff" strokeWidth="5" />
      <path d="M12 0 V18 M0 9 H24" stroke="#c8102e" strokeWidth="3" />
    </>
  ),
  BR: (
    <>
      <rect width="24" height="18" fill="#009c3b" />
      <path d="M12 2 L22 9 L12 16 L2 9Z" fill="#ffdf00" />
      <circle cx="12" cy="9" r="4" fill="#002776" />
      <path d="M8.2 8.2 Q12 7.2 15.8 9.6" stroke="#fff" strokeWidth=".7" fill="none" />
    </>
  ),
  KR: (
    <>
      <rect width="24" height="18" fill="#fff" />
      <path d="M8 9 A4 4 0 0 1 16 9 A2 2 0 0 1 12 9 A2 2 0 0 0 8 9Z" fill="#cd2e3a" />
      <path d="M8 9 A2 2 0 0 0 12 9 A2 2 0 0 1 16 9 A4 4 0 0 1 8 9Z" fill="#0047a0" />
      <g stroke="#000" strokeWidth=".9">
        <path d="M3 4 l2.4 -1.6 M3.6 4.9 l2.4 -1.6 M4.2 5.8 l2.4 -1.6" />
        <path d="M18 2.4 l2.4 1.6 M17.4 3.3 l2.4 1.6 M16.8 4.2 l2.4 1.6" />
        <path d="M3 14 l2.4 1.6 M3.6 13.1 l2.4 1.6 M4.2 12.2 l2.4 1.6" />
        <path d="M18 15.6 l2.4 -1.6 M17.4 14.7 l2.4 -1.6 M16.8 13.8 l2.4 -1.6" />
      </g>
    </>
  ),
};

export function Flag({ code, size = 18, withTooltip = true, label }: { code: string; size?: number; withTooltip?: boolean; label?: string }) {
  code = canonicalCountryCode(code);
  const art = FLAGS[code];
  const name = countryName(code);
  const flag = (
    <span className="flag" role="img" aria-label={name} tabIndex={withTooltip ? 0 : undefined}>
      {art ? (
        <svg width={size} height={(size * 3) / 4} viewBox="0 0 24 18">
          {art}
          <rect width="24" height="18" fill="none" stroke="#00000040" strokeWidth=".8" />
        </svg>
      ) : (
        <span className="flag-emoji" style={{ fontSize: size * 0.9 }} aria-hidden>
          {flagEmoji(code) || code}
        </span>
      )}
    </span>
  );
  if (!withTooltip) return flag;
  return <Tooltip content={label ?? name}>{flag}</Tooltip>;
}
