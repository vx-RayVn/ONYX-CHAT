import { useEffect, useState, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowLeft, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { t } from '../../i18n';

export interface NavItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  tag?: ReactNode;
  onClick?: () => void;
}

export interface NavGroup<T extends string> {
  label?: ReactNode;
  items: NavItem<T>[];
}

interface Props<T extends string> {
  title: string;
  groups: NavGroup<T>[];
  active: T;
  onSelect: (id: T) => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider content column (Profile Studio). */
  wide?: boolean;
}

export function SettingsLayout<T extends string>({ title, groups, active, onSelect, onClose, children, footer, wide }: Props<T>) {
  const isMobile = useIsMobile();
  const [mobileContent, setMobileContent] = useState(active !== 'account' && active !== 'overview');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    document.querySelector('.settings-main')?.scrollTo({ top: 0 });
  }, [active]);

  const activeLabel = groups.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? '';
  const q = filter.trim().toLowerCase();

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Content className={cn('settings', isMobile && (mobileContent ? 'show-content' : 'show-nav'))} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <nav className="settings-nav" aria-label={title}>
            <div className="settings-nav-inner">
              <div className="settings-nav-head">
                <span>{title.split(' · ')[0]}</span>
                <Dialog.Close className="icon-btn" aria-label={t('Close settings')}>
                  <X />
                </Dialog.Close>
              </div>
              <div className="settings-filter">
                <Search size={15} />
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Search')} aria-label={t('Search settings')} />
              </div>
              {groups.map((g, gi) => {
                const items = g.items.filter((i) => !q || i.label.toLowerCase().includes(q));
                if (!items.length) return null;
                return (
                  <div key={gi} className="settings-group">
                    {g.label && <div className="settings-group-label">{g.label}</div>}
                    {items.map((item) => (
                      <button
                        key={item.id}
                        className={cn('settings-nav-item', active === item.id && 'is-active', item.danger && 'is-danger')}
                        aria-current={active === item.id ? 'page' : undefined}
                        onClick={() => {
                          if (item.onClick) return item.onClick();
                          onSelect(item.id);
                          setMobileContent(true);
                        }}
                      >
                        {item.icon && <span className="settings-nav-icon">{item.icon}</span>}
                        <span className="grow truncate">{item.label}</span>
                        {item.tag}
                      </button>
                    ))}
                  </div>
                );
              })}
              {footer}
            </div>
          </nav>
          <main className="settings-main">
            <div className="settings-mobile-head">
              <button className="icon-btn" onClick={() => setMobileContent(false)} aria-label={t('Back')}>
                <ArrowLeft />
              </button>
              <span>{activeLabel}</span>
              <Dialog.Close className="icon-btn settings-mobile-close" aria-label={t('Close settings')}><X size={22}/></Dialog.Close>
            </div>
            <div className={cn('settings-content', wide && 'is-wide')}>{children}</div>
            <div className="settings-close-wrap">
              <Dialog.Close className="settings-close" aria-label={t('Close settings')}>
                <X size={18} />
              </Dialog.Close>
              <span className="settings-close-kbd">ESC</span>
            </div>
          </main>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SettingsHeader({ title, description, tag }: { title: ReactNode; description?: ReactNode; tag?: ReactNode }) {
  return (
    <div className="settings-head">
      <h2>
        {title}
        {tag}
      </h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function SettingsSection({ title, description, children, tag, className }: { title?: ReactNode; description?: ReactNode; children: ReactNode; tag?: ReactNode; className?: string }) {
  return (
    <section className={cn('settings-section', className)}>
      {title && (
        <h3 className="settings-section-title">
          {title}
          {tag}
        </h3>
      )}
      {description && <p className="settings-section-desc">{description}</p>}
      {children}
    </section>
  );
}

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('settings-card', className)}>{children}</div>;
}

/** Marks settings whose effect needs the later backend. */
export function BackendTag() {
  return <span className="backend-tag">{t('Applies with account sync')}</span>;
}

export function LocalTag() {
  return <span className="local-tag">{t('Applies instantly')}</span>;
}
