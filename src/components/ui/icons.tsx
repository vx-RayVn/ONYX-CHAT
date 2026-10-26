import { useCommunity,knownBadge } from '../../backend/community';
import { useId, type SVGProps } from 'react';
import { Hash, Lock, Megaphone, Volume2 } from 'lucide-react';
import type { BadgeId, ChannelType, PresenceStatus } from '../../types';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';
import { BadgeArt } from '../cosmetics/BadgeArt';
import { BRAND_IMAGES } from '../../config/brand';

/** The ONYX mark: an emerald-cut gem seen from above. */
export function GemMark({ size = 24, mono = false, className, ...rest }: { size?: number; mono?: boolean } & SVGProps<SVGSVGElement>) {
  if (mono) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...rest}>
        <path d="M8 2h8l4 4v12l-4 4H8l-4-4V6z" fill="currentColor" opacity=".9" />
        <path d="M10 6.5h4l1.5 2v7l-1.5 2h-4l-1.5-2v-7z" fill="currentColor" opacity=".55" style={{ mixBlendMode: 'multiply' }} />
        <path d="M8 2h8l-2 4.5h-4zM4 6l4.5 2.5v7L4 18z" fill="#fff" opacity=".22" />
        <path d="M20 6l-4.5 2.5v7L20 18zM8 22h8l-2-4.5h-4z" fill="#000" opacity=".18" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...rest}>
      <path d="M8 2h8l4 4v12l-4 4H8l-4-4V6z" fill="#10B981" />
      <path d="M8 2h8l-2 4.5h-4z" fill="#6EE7B7" />
      <path d="M4 6l4.5 2.5v7L4 18z" fill="#34D399" />
      <path d="M20 6l-4.5 2.5v7L20 18z" fill="#059669" />
      <path d="M8 22h8l-2-4.5h-4z" fill="#047857" />
      <path d="M10 6.5h4l1.5 2v7l-1.5 2h-4l-1.5-2v-7z" fill="#10B981" />
      <path d="M10 6.5h4l1.5 2h-7z" fill="#A7F3D0" opacity=".55" />
    </svg>
  );
}

/** Official ONYX Chat logo (image asset, crisp at every size via srcset). */
export function OnyxLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      className={cn('onyx-logo', className)}
      src={size > 64 ? BRAND_IMAGES.onyxLogo.lg : BRAND_IMAGES.onyxLogo.sm}
      srcSet={`${BRAND_IMAGES.onyxLogo.sm} 128w, ${BRAND_IMAGES.onyxLogo.lg} 512w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt="ONYX"
      draggable={false}
    />
  );
}

/** Official OnyxServices logo (image asset). */
export function OnyxServicesLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      className={cn('os-logo', className)}
      src={size > 64 ? BRAND_IMAGES.onyxServicesLogo.lg : BRAND_IMAGES.onyxServicesLogo.sm}
      srcSet={`${BRAND_IMAGES.onyxServicesLogo.sm} 128w, ${BRAND_IMAGES.onyxServicesLogo.lg} 512w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt="OnyxServices"
      draggable={false}
    />
  );
}

/** The transparent white ONYX mark – for dark surfaces such as the top bar. */
export function OnyxMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      className={cn('onyx-mark', className)}
      src={size > 32 ? BRAND_IMAGES.onyxMark.lg : BRAND_IMAGES.onyxMark.sm}
      srcSet={`${BRAND_IMAGES.onyxMark.sm} 64w, ${BRAND_IMAGES.onyxMark.lg} 256w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt="ONYX"
      draggable={false}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('wordmark', className)}>
      {/* White mark on dark themes, the full logo on the light theme (CSS). */}
      <OnyxMark size={26} className="wordmark-mark" />
      <OnyxLogo size={24} className="wordmark-logo" />
      <span className="wordmark-text">ONYX</span>
    </span>
  );
}

export function ChannelIcon({ type, isPrivate, size = 20, className }: { type: ChannelType; isPrivate?: boolean; size?: number; className?: string }) {
  const Icon = type === 'voice' ? Volume2 : type === 'announcement' ? Megaphone : Hash;
  return (
    <span className={cn('channel-icon', className)} style={{ width: size, height: size }}>
      <Icon size={size} strokeWidth={type === 'text' ? 2 : 1.85} />
      {isPrivate && (
        <span className="channel-icon-lock">
          <Lock size={Math.round(size * 0.45)} strokeWidth={2.6} />
        </span>
      )}
    </span>
  );
}

/** Status glyphs use distinct shapes, not only colour (accessibility). */
export function StatusGlyph({ status, size }: { status: PresenceStatus; size: number }) {
  const id = useId();
  const color = `var(--${status})`;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className="status-glyph" aria-hidden>
      <defs>
        <mask id={id}>
          <rect width="10" height="10" fill="#fff" />
          {status === 'idle' && <circle cx="2.6" cy="2.6" r="3.6" fill="#000" />}
          {status === 'dnd' && <rect x="2" y="3.85" width="6" height="2.3" rx="1.15" fill="#000" />}
          {status === 'offline' && <circle cx="5" cy="5" r="2.4" fill="#000" />}
        </mask>
      </defs>
      <circle cx="5" cy="5" r="5" fill={color} mask={`url(#${id})`} />
    </svg>
  );
}

export function statusLabel(status: PresenceStatus) {
  return { online: t('Online'), idle: t('Idle'), dnd: t('Do Not Disturb'), offline: t('Offline') }[status];
}

/* ------------------------------------------------------------------ */
/* Profile badges                                                       */
/* ------------------------------------------------------------------ */

export function BadgeIcon({ badge, size = 20, locked, imageOverride }: { badge: BadgeId; size?: number; locked?: boolean; imageOverride?: string|null }) {
  const saved = useCommunity(s => s.catalog[badge]?.image);
  const image=imageOverride===undefined?saved:imageOverride;
  if (!knownBadge(badge)) return null;
  return image ? <img src={image} alt="" width={size} height={size} className="official-badge-image" style={{opacity: locked ? 0.4 : undefined}} /> : <BadgeArt badge={badge} size={size} locked={locked} />;
}

/** Small "free" tag used across personalisation features. */
export function FreeTag({ className }: { className?: string }) {
  return (
    <span className={cn('free-tag', className)}>
      <GemMark size={12} />
      {t('Free')}
    </span>
  );
}

/**
 * Redeem code: a gift card with ribbon and bow, drawn in the same stroke
 * language as the Lucide icons (24 px grid, 2 px round strokes).
 */
export function RedeemIcon({ size = 24, className, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide', className)}
      aria-hidden
      {...rest}
    >
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M8.5 5v14" />
      <path d="M2 11h6.5" />
      <path d="M8.5 11c-.8-2.2-3.6-2.6-3.6-.8 0 1.3 2 1.5 3.6.8Z" />
      <path d="M8.5 11c.8-2.2 3.6-2.6 3.6-.8 0 1.3-2 1.5-3.6.8Z" />
      <path d="M8.5 11l-2.2 2.6M8.5 11l2.2 2.6" />
      <path d="M15 15h3.5" />
    </svg>
  );
}
