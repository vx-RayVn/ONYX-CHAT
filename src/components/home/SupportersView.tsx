import { HeaderTools } from '../layout/HeaderTools';
/**
 * The public ONYX supporter wall: a quiet thank-you to everyone who
 * supports ONYX with Plus and chose to be listed. Entries are voluntary and
 * can be hidden again at any time (Plus page, this page or Settings → ONYX Plus).
 * The wall is shown on the Plus page and as its own page.
 */
import { CLOUD } from '../../backend/config';
import { loadSupporters } from '../../backend/remote';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, HeartHandshake } from 'lucide-react';
import type { User } from '../../types';
import { useStore } from '../../store/store';
import { showNavPane, toast, useUI } from '../../store/ui';
import { useMe } from '../../store/selectors';
import { cn, formatCount } from '../../lib/utils';
import { locale, t, tn } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { GemMark } from '../ui/icons';
import { Switch } from '../ui/Field';
import { PlusCheck } from '../ui/PlusCheck';
import { StyledName } from '../cosmetics/StyledName';
import { plusPrice } from './PlusView';

const monthYear = (ts: number) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(ts);

/** Supporters who opted in, earliest first. */
export function useSupporters() {
  const users = useStore((s) => s.users);
  // Cloud mode: everyone who opted in, not only the people this client already knows.
  useEffect(() => {
    if (CLOUD) void loadSupporters();
  }, []);
  return useMemo(
    () =>
      Object.values(users)
        .filter((u) => u.plusSince && u.supporterWall && !u.bot)
        .sort((a, b) => a.plusSince! - b.plusSince!),
    [users],
  );
}

/** The opt-in switch for the own entry (only for Plus supporters). */
function SelfEntry() {
  const me = useMe();
  const setWall = useStore((s) => s.setSupporterWall);
  if (!me.plusSince) return null;
  return (
    <div className={cn('wall-self', me.supporterWall && 'is-on')}>
      <Avatar user={me} size={40} />
      <div className="grow">
        <strong>{me.supporterWall ? t('You’re on the wall') : t('You’re not listed')}</strong>
        <span>{t('Your entry shows your display name and avatar. You can change this at any time.')}</span>
      </div>
      <Switch
        checked={!!me.supporterWall}
        onChange={(v) => {
          setWall(v);
          toast({ title: v ? t('You’re on the supporter wall') : t('Removed from the supporter wall') });
        }}
        label={t('Show me on the supporter wall')}
      />
    </div>
  );
}

function Entry({ user }: { user: User }) {
  return (
    <li>
      <button className="wall-entry anim-host" onClick={() => useUI.getState().openModal({ type: 'profile', userId: user.id })}>
        <Avatar user={user} size={40} />
        <span className="wall-entry-text">
          <span className="wall-entry-name">
            <span className="truncate">
              <StyledName style={user.nameStyle}>{user.displayName}</StyledName>
            </span>
            <PlusCheck since={user.plusSince} until={user.plusUntil} size={14} interactive={false} />
          </span>
          <span className="wall-entry-since">{t('since {date}', { date: monthYear(user.plusSince!) })}</span>
        </span>
      </button>
    </li>
  );
}

/** The wall itself; `limit` shows the first entries plus a link to the full page. */
export function SupporterWall({ limit }: { limit?: number }) {
  const supporters = useSupporters();
  const shown = limit ? supporters.slice(0, limit) : supporters;
  const more = supporters.length - shown.length;
  return (
    <section className={cn('wall', limit && 'is-embedded')} aria-labelledby="wall-title">
      <div className="wall-head">
        <div className="wall-head-text">
          <span className="eyebrow">{t('Supporter wall')}</span>
          <h3 id="wall-title">{t('Thank you to our supporters')}</h3>
          <p>{t('These people support ONYX with ONYX Plus and chose to be listed here. Their contribution helps us build ONYX and keep its personalisation free for everyone.')}</p>
        </div>
        <span className="wall-count">{tn(supporters.length, '{count} supporter on the wall', '{count} supporters on the wall', { count: formatCount(supporters.length) })}</span>
      </div>
      <SelfEntry />
      {supporters.length === 0 ? (
        <div className="wall-empty">{t('No one is listed yet.')}</div>
      ) : (
        <ul className="wall-grid">
          {shown.map((u) => (
            <Entry key={u.id} user={u} />
          ))}
          {more > 0 && (
            <li>
              <button className="wall-entry wall-more" onClick={() => useStore.getState().goHome('supporters')}>
                <span className="wall-more-count tnum">+{formatCount(more)}</span>
                <span className="wall-entry-text">
                  <span className="wall-entry-name">{t('View all supporters')}</span>
                </span>
                <ArrowRight size={16} />
              </button>
            </li>
          )}
        </ul>
      )}
      <p className="wall-note">
        {CLOUD
          ? t('Entries are voluntary and can be hidden at any time.')
          : t('Entries are voluntary and can be hidden at any time. The profiles shown in this preview are sample profiles of the demo community.')}
      </p>
    </section>
  );
}

export function SupportersView() {
  const me = useMe();
  return (
    <div className="page-view supporters-view">
      <header className="view-header">
        <IconButton label={t('Back')} className="mobile-only mobile-back" onClick={showNavPane} tooltip={false}>
          <ArrowLeft />
        </IconButton>
        <div className="view-header-title">
          <HeartHandshake size={22} className="vh-icon" />
          <h1>{t('Supporter wall')}</h1>
        </div>
        <HeaderTools />
      </header>
      <div className="page-scroll">
        <div className="page supporters-page">
          <SupporterWall />
          {!me.plusSince && (
            <section className="wall-cta">
              <div className="grow">
                <strong>{t('Want to support ONYX too?')}</strong>
                <span>{t('ONYX Plus costs {price} per month. Being listed here is optional.', { price: plusPrice() })}</span>
              </div>
              <Button size="sm" icon={<GemMark size={16} />} onClick={() => useStore.getState().goHome('plus')}>
                {t('View Plus')}
              </Button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
