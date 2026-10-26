import {GuestTag} from '../ui/GuestTag';
import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from 'lucide-react';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { useMe } from '../../store/selectors';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';
import { IconButton } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { statusLabel } from '../ui/icons';
import { SelfProfileCard } from '../profile/SelfProfileCard';
import { StyledName } from '../cosmetics/StyledName';
import { VoicePanel } from '../voice/VoicePanel';
import { ProfileSurface } from '../profile/UserPopover';

export function SelfPanel() {
  const me = useMe();
  const muted = useStore((s) => s.voiceSelf.muted);
  const deafened = useStore((s) => s.voiceSelf.deafened);
  const { toggleMute, toggleDeafen } = useStore.getState();
  const openSettings = useUI((s) => s.openSettings);
  const sub = me.customStatus ? `${me.customStatus.emoji ? `${me.customStatus.emoji} ` : ''}${me.customStatus.text}` : statusLabel(me.status);

  return (
    <div className="self-panel">
      <VoicePanel />
      <div className="user-panel">
        <ProfileSurface side="top" content={close=><SelfProfileCard onClose={close}/> }>
            <button className="user-panel-id anim-host" aria-label={t('Your profile and status')}>
              <Avatar user={me} size={34} status={me.status} frame />
              <span className="user-panel-text">
                <span className="user-panel-name truncate">
                  <StyledName style={me.nameStyle}>{me.displayName}</StyledName><GuestTag guest={me.guest}/>
                </span>
                <span className="user-panel-sub">
                  <span className="truncate">{me.status === 'offline' ? t('Invisible') : sub}</span>
                  {!me.guest&&<span className="truncate">@{me.username}</span>}
                </span>
              </span>
            </button>
        </ProfileSurface>
        <IconButton label={muted ? t('Unmute') : t('Mute')} className={cn(muted && 'is-off')} onClick={toggleMute} active={muted}>
          {muted ? <MicOff /> : <Mic />}
        </IconButton>
        <IconButton label={deafened ? t('Undeafen') : t('Deafen')} className={cn(deafened && 'is-off')} onClick={toggleDeafen} active={deafened}>
          {deafened ? <HeadphoneOff /> : <Headphones />}
        </IconButton>
        <IconButton label={t('User settings')} shortcut={`${t('Ctrl')} ,`} onClick={() => openSettings({ kind: 'user', section: me.guest?'voice':'account' })}>
          <Settings />
        </IconButton>
      </div>
    </div>
  );
}
