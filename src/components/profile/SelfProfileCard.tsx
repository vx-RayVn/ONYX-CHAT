import { Copy, Pencil, FaceSlightlySmilingPlus, X, ChevronRight, ArrowRightLeft } from 'lucide-react';
import {CLOUD} from '../../backend/config';
import type { ID, PresenceStatus } from '../../types';
import { useStore } from '../../store/store';
import { useUI, toast, requireAccount } from '../../store/ui';
import { useMe } from '../../store/selectors';
import { cn, copyText } from '../../lib/utils';
import { StatusGlyph, statusLabel } from '../ui/icons';
import { t, tk } from '../../i18n';
import { ProfileCard } from './ProfileCard';
import {endGuestSession} from '../home/GuestHome';

const STATUS_OPTIONS: { id: PresenceStatus; hint?: string }[] = [
  { id: 'online' },
  { id: 'idle', hint: tk('Set automatically when you’re inactive') },
  { id: 'dnd', hint: tk('You won’t receive desktop notifications') },
  { id: 'offline', hint: tk('You appear offline but can use ONYX normally') },
];

export function SelfProfileCard({ serverId, onClose }: { serverId?: ID; onClose?: () => void }) {
  const me = useMe();
  const { setStatus, setCustomStatus } = useStore.getState();
  const ui = useUI.getState();

  const footer = me.guest?<div className="self-menu"><button className="self-menu-item" onClick={()=>{onClose?.();ui.openModal({type:'guestUpgrade',reason:'profile'});}}><Pencil size={16}/><span>{t('Create free account')}</span></button><button className="self-menu-item" onClick={()=>{onClose?.();ui.openSettings({kind:'user',section:'voice'});}}><span>{t('Voice & Video')}</span></button><button className="self-menu-item" onClick={()=>{onClose?.();endGuestSession();}}><span>{t('End guest session')}</span></button></div>:(
    <div className="self-menu">
      <button
        className="self-menu-item"
        onClick={() => {
          onClose?.();
          ui.openSettings({ kind: 'user', section: 'profile' });
        }}
      >
        <Pencil size={16} />
        <span className="grow">{t('Edit profile')}</span>
        <ChevronRight size={16} className="self-menu-chev" />
      </button>
      <div className="self-menu-sep" />
      <div className="self-status-list" role="radiogroup" aria-label={t('Status')}>
        {STATUS_OPTIONS.map((o) => (
          <button key={o.id} role="radio" aria-checked={me.status === o.id} className={cn('self-menu-item self-status', me.status === o.id && 'is-active')} onClick={() => {if(!requireAccount('profile'))setStatus(o.id);}}>
            <StatusGlyph status={o.id} size={12} />
            <span className="grow">
              {o.id === 'offline' ? t('Invisible') : statusLabel(o.id)}
              {o.hint && me.status === o.id && <small>{t(o.hint)}</small>}
            </span>
          </button>
        ))}
      </div>
      <div className="self-menu-sep" />
      {me.customStatus ? (
        <div className="self-custom">
          <button
            className="self-menu-item grow"
            onClick={() => {
              onClose?.();
              ui.openModal({ type: 'customStatus' });
            }}
          >
            <span className="emoji">{me.customStatus.emoji ?? '💬'}</span>
            <span className="grow truncate">{me.customStatus.text}</span>
          </button>
          <button className="icon-btn icon-btn-sm" aria-label={t('Remove status')} onClick={() => setCustomStatus(undefined)}>
            <X />
          </button>
        </div>
      ) : (
        <button
          className="self-menu-item"
          onClick={() => {
            onClose?.();
            ui.openModal({ type: 'customStatus' });
          }}
        >
          <FaceSlightlySmilingPlus size={16} />
          <span className="grow">{t('Set a custom status')}</span>
        </button>
      )}
      {CLOUD&&<><div className="self-menu-sep"/><button className="self-menu-item" onClick={()=>{onClose?.();ui.openModal({type:'accountSwitcher'});}}><ArrowRightLeft size={16}/><span className="grow">{t('Switch accounts')}</span><ChevronRight size={16} className="self-menu-chev"/></button></>}
      <button className="self-menu-item" onClick={() => copyText(me.id).then(() => toast({ title: t('User ID copied') }))}>
        <Copy size={16} />
        <span className="grow">{t('Copy user ID')}</span>
      </button>
    </div>
  );

  return <ProfileCard user={me} serverId={serverId} variant="popout" footer={footer} />;
}
