/**
 * Renders a display name with the user's free name style (font, effect,
 * colours, italic, capitals). Styled names carry a little inner padding with a
 * matching negative margin, so glows and slanted letters have room to fade out
 * even inside truncating containers – without shifting the layout.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { NameStyle } from '../../types';
import { NAME_FONTS } from '../../data/cosmetics';
import { cn } from '../../lib/utils';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

interface Props {
  style?: NameStyle;
  /** Fallback colour (e.g. role colour) when the style has no own colours. */
  color?: string;
  className?: string;
  children: ReactNode;
}

export function isDefaultStyle(s?: NameStyle) {
  return !s || (s.font === 'default' && s.effect === 'solid' && s.colors.length === 0 && !s.italic && !s.uppercase);
}

export function StyledName({ style, color, className, children }: Props) {
  if (isDefaultStyle(style)) {
    return (
      <span className={cn('display-name', className)} style={color ? { color } : undefined}>
        {children}
      </span>
    );
  }
  const s = style!;
  const font = NAME_FONTS.find((f) => f.id === s.font) ?? NAME_FONTS[0];
  const base = color ?? 'var(--text-strong)';
  const colors = s.colors.length ? s.colors : [base];
  const vars: Vars = {
    '--ns-c1': colors[0],
    '--ns-c2': colors[1] ?? (s.effect === 'pop' ? 'rgba(0,0,0,.55)' : colors[0]),
    '--ns-c3': colors[2] ?? colors[1] ?? colors[0],
    fontFamily: font.family,
    fontWeight: font.weight,
    letterSpacing: s.font === 'pixel' || s.font === 'arcade' ? '0.02em' : s.font === 'tech' ? '0.04em' : s.font === 'heavy' ? '-0.01em' : undefined,
  };
  return (
    <span className={cn('display-name sname media-anim', `ns-${s.effect}`, s.italic && 'ns-italic', s.uppercase && 'ns-upper', className)} style={vars}>
      {children}
    </span>
  );
}
