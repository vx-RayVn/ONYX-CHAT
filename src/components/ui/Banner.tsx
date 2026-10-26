import { memo, type CSSProperties } from 'react';
import type { BannerSource } from '../../types';
import { cn } from '../../lib/utils';
import { BannerScene, BANNER_SCENES } from '../cosmetics/Banners';
import { cropStyle } from './Avatar';

interface Props {
  lazy?: boolean;
  source?: BannerSource;
  /** Fallback colour when there is no banner. */
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/** Profile / server banner: uploaded image, illustrated scene or CSS preset. */
export const Banner = memo(function Banner({ source, color, className, style, lazy = false }: Props) {
  if (!source) {
    return <div className={cn('banner', 'banner-solid', className)} style={{ background: color ?? 'var(--bg-raised)', ...style }} />;
  }
  if (source.kind === 'image') {
    return (
      <div className={cn('banner', 'media-anim', className)} style={style}>
        {source.poster && <img loading={lazy?'lazy':undefined} decoding={lazy?'async':undefined} className="av-poster" src={source.poster} alt="" draggable={false} style={cropStyle(source.crop)} />}
        <img loading={lazy?'lazy':undefined} decoding={lazy?'async':undefined} className={cn('banner-img', source.poster && 'av-gif')} src={source.src} alt="" draggable={false} style={cropStyle(source.crop)} />
      </div>
    );
  }
  if (source.id in BANNER_SCENES) {
    return (
      <div className={cn('banner', 'media-anim', className)} style={style}>
        <BannerScene id={source.id} />
      </div>
    );
  }
  return (
    <div className={cn('banner', 'banner-preset', `banner-${source.id}`, 'media-anim', className)} style={style}>
      <span className="bp-layer bp-a" />
      <span className="bp-layer bp-b" />
      <span className="bp-layer bp-c" />
    </div>
  );
});
