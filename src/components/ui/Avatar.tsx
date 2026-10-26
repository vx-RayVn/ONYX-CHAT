import { memo, type CSSProperties } from 'react';
import type { AvatarSource, BorderLine as BorderLineStyle, PresenceStatus } from '../../types';
import { cn, initials } from '../../lib/utils';
import { AvatarArt } from './AvatarArt';
import { StatusGlyph } from './icons';
import { AvatarDecoration } from '../cosmetics/Decorations';
import { BorderLine } from '../cosmetics/Frames';

export interface AvatarUser {
  displayName: string;
  avatar?: AvatarSource;
  avatarColor: string;
  avatarDecoration?: string;
  borderLine?: BorderLineStyle;
}

interface AvatarProps {
  user?: AvatarUser | null;
  size: number;
  status?: PresenceStatus | null;
  /** Show the avatar decoration and border line. */
  frame?: boolean;
  speaking?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Geometry for the status dot and the matching cut-out in the avatar. */
function statusGeometry(size: number) {
  const dot = Math.round(Math.min(20, Math.max(8, size * 0.3)));
  const gap = Math.round(Math.min(6, Math.max(2, size * 0.075)));
  const inset = Math.round(size * 0.85 - dot / 2);
  return { dot, gap, inset, center: inset + dot / 2 };
}

export function cropStyle(crop?: { x: number; y: number; zoom: number }): CSSProperties | undefined {
  if (!crop) return undefined;
  return { objectPosition: `${crop.x}% ${crop.y}%`, transform: `scale(${crop.zoom})`, transformOrigin: `${crop.x}% ${crop.y}%` };
}

export const Avatar = memo(function Avatar({ user, size, status, frame = false, speaking, className, style }: AvatarProps) {
  const showStatus = !!status;
  const g = statusGeometry(size);
  const maskStyle: CSSProperties | undefined = showStatus
    ? {
        WebkitMaskImage: `radial-gradient(circle at ${g.center}px ${g.center}px, transparent ${g.dot / 2 + g.gap - 0.5}px, #000 ${g.dot / 2 + g.gap}px)`,
        maskImage: `radial-gradient(circle at ${g.center}px ${g.center}px, transparent ${g.dot / 2 + g.gap - 0.5}px, #000 ${g.dot / 2 + g.gap}px)`,
      }
    : undefined;

  const src = user?.avatar;
  // Decorations need some room to stay legible – skip them on tiny avatars.
  const decoration = frame && size >= 28 ? user?.avatarDecoration : undefined;
  const line = frame && size >= 28 && user?.borderLine?.avatar ? user.borderLine : undefined;

  return (
    <span className={cn('avatar', speaking && 'is-speaking', className)} style={{ width: size, height: size, ['--av-size' as string]: `${size}px`, ...style }}>
      <span className="avatar-media media-anim" style={maskStyle}>
        {!src && (
          <span className="avatar-fallback" style={{ background: user?.avatarColor ?? '#334155', fontSize: Math.max(9, size * 0.38) }}>
            {initials(user?.displayName ?? '?')}
          </span>
        )}
        {src?.kind === 'art' && <AvatarArt style={src.style} hue={src.hue} hue2={src.hue2} seed={src.seed} animated={src.animated} motif={src.motif} />}
        {src?.kind === 'image' && (
          <>
            {src.poster && <img className="av-poster" src={src.poster} alt="" draggable={false} style={cropStyle(src.crop)} />}
            <img className={cn('av-img', src.poster && 'av-gif')} src={src.src} alt="" draggable={false} style={cropStyle(src.crop)} />
          </>
        )}
        {/* Speaking: a calm edge inside the avatar so neighbours never overlap. */}
        <span className="avatar-speak" aria-hidden />
      </span>
      {line && <BorderLine style={line} shape="circle" />}
      {decoration && <AvatarDecoration id={decoration} />}
      {showStatus && (
        <span className="avatar-status" style={{ width: g.dot, height: g.dot, left: g.inset, top: g.inset }}>
          <StatusGlyph status={status!} size={g.dot} />
        </span>
      )}
    </span>
  );
});
