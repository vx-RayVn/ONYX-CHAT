/**
 * The blue ONYX Plus check. Shown next to the display name of people who
 * support ONYX with Plus. The gem silhouette keeps it
 * clearly apart from identity verification.
 */
import { useId } from 'react';
import { t } from '../../i18n';
import { formatShortDate } from '../../lib/utils';
import { useUI } from '../../store/ui';
import { useStore } from '../../store/store';
import { Tooltip } from './Tooltip';
import { FEATURES } from '../../config/features';
import {usePlusActive} from '../../lib/plus-entitlement';

export function PlusCheckIcon({ size = 16 }: { size?: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="plus-check-icon">
      <defs>
        <linearGradient id={`${u}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#93c5fd" />
          <stop offset=".5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path d="M8.1 1.6h7.8l6.5 6.5v7.8l-6.5 6.5H8.1l-6.5-6.5V8.1z" fill={`url(#${u}p)`} />
      <path d="M8.1 1.6h7.8l-1.9 3.6H10z" fill="#fff" opacity=".28" />
      <path d="M7.4 12.3l3.1 3.1 6.1-6.6" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Check with an explanation tooltip; a click opens the supporter wall. */
export function PlusCheck({ since,until, size = 16, interactive = true }: { since?: number;until?:number; size?: number; interactive?: boolean }) {
  const active=usePlusActive(since,until);
  if (!FEATURES.onyxPlus || !active || !since) return null;
  const icon = (
    <span
      className="plus-check"
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : -1}
      aria-label={t('ONYX Plus supporter')}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              const ui = useUI.getState();
              ui.closeModal();
              ui.closeSettings();
              useStore.getState().goHome('supporters');
              ui.setMobilePanel('main');
            }
          : undefined
      }
    >
      <PlusCheckIcon size={size} />
    </span>
  );
  return (
    <Tooltip
      arrow={false}
      className="badge-tooltip-surface"
      content={
        <span className="plus-check-tip">
          <strong>{t('ONYX Plus supporter')}</strong>
          <span>{t('Supports ONYX since {date}. Not an identity verification.', { date: formatShortDate(since) })}</span>
        </span>
      }
    >
      {icon}
    </Tooltip>
  );
}

export function PlusPill({since,until}:{since?:number;until?:number}){
 const active=usePlusActive(since,until);
 if(!FEATURES.onyxPlus||!active)return null;
 return <Tooltip content={t('ONYX Plus supporter')} arrow={false}><span className="plus-identity-badge" role="img" aria-label={t('ONYX Plus')}>PLUS</span></Tooltip>;
}
