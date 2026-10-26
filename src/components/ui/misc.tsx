import { useCommunity,badgeName,badgeDescription } from '../../backend/community';
import type { ReactNode } from 'react';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import type { BadgeId } from '../../types';
import { cn, formatIsoDate } from '../../lib/utils';
import { t } from '../../i18n';
import { useUI } from '../../store/ui';
import { BADGE_BY_ID } from '../../data/badges';
import { BadgeIcon } from './icons';
import { Tooltip } from './Tooltip';

export function Kbd({ children, size = 'md' }: { children: ReactNode; size?: 'sm' | 'md' }) {
  return <kbd className={cn('kbd', size === 'sm' && 'kbd-sm')}>{children}</kbd>;
}

export function BotTag({ verified = true }: { verified?: boolean }) {
  return (
    <span className="bot-tag">
      {verified && (
        <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {t('App')}
    </span>
  );
}

/** Marks UI that exists as a preview in this phase. */
export function PreviewTag({ children, className }: { children?: ReactNode; className?: string }) {
  return <span className={cn('preview-tag', className)}>{children ?? t('Preview')}</span>;
}

export function BadgeTooltip({ id }: { id: BadgeId }) {
  useCommunity(s=>s.revision);
  const b = BADGE_BY_ID[id];
  if (!b) return null;
  return (
    <span className="badge-tooltip">
      <span className="badge-tooltip-head">
        <BadgeIcon badge={id} size={28} />
        <strong>{badgeName(id) ?? t(b.name)}</strong>
      </span>
      <span>{badgeDescription(id) ?? t(b.description)}</span>
      {b.event && (
        <span className="badge-tooltip-event">
          {t(b.event.name)} · {formatIsoDate(b.event.start)} – {formatIsoDate(b.event.end)}
        </span>
      )}
    </span>
  );
}

export function UserBadges({ badges, size = 20, className }: { badges: BadgeId[]; size?: number; className?: string }) {
  useCommunity(s=>s.revision);
  const list = badges.filter((b) => BADGE_BY_ID[b]);
  if (!list.length) return null;
  return (
    <div className={cn('user-badges', className)}>
      {list.map((b) => (
        <Tooltip key={b} content={<BadgeTooltip id={b} />} arrow={false} className="badge-tooltip-surface">
          <span className="user-badge" tabIndex={0} aria-label={badgeName(b) ?? t(BADGE_BY_ID[b].name)}>
            <BadgeIcon badge={b} size={size} />
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  art?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ art, title, body, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('empty-state', compact && 'is-compact', className)}>
      {art && <div className="empty-art">{art}</div>}
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Stationary circles keep empty states calm, including at fractional pixel scales. */
export function EmptyArt({ icon }: { icon: ReactNode }) {
  return (
    <div className="empty-illu">
      <span className="empty-illu-ring" />
      <span className="empty-illu-facet f1" />
      <span className="empty-illu-facet f2" />
      <span className="empty-illu-facet f3" />
      <span className="empty-illu-icon">{icon}</span>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={cn('toast', toast.tone && `toast-${toast.tone}`)}>
          <span className="toast-icon">
            {toast.tone === 'danger' ? <CircleAlert size={18} /> : toast.tone === 'info' ? <Info size={18} /> : <CircleCheck size={18} />}
          </span>
          <div className="toast-text">
            <div className="toast-title">{toast.title}</div>
            {toast.body && <div className="toast-body">{toast.body}</div>}
          </div>
          <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label={t('Dismiss')}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SectionLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('section-label', className)}>
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden />;
}
