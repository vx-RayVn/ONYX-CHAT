/**
 * Control bar of the voice view and the call panel: microphone, sound,
 * camera, screen share (sharp or smooth), settings, leave / hang up.
 */
import { Gauge, HeadphoneOff, Headphones, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff, Settings, Type, Video, VideoOff } from 'lucide-react';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';
import { Tooltip } from '../ui/Tooltip';
import { Dropdown } from '../ui/Menu';
import { useVoice } from '../../voice/state';
import { screenShareNote, support } from '../../voice/support';
import { keyLabel } from '../../voice/ptt';
import { NoiseSuppressionButton } from './NoiseSuppressionButton';

export function MicButton({ compact }: { compact?: boolean }) {
  const muted = useStore((s) => s.voiceSelf.muted);
  const ptt = useStore((s) => s.settings.inputMode === 'ptt');
  const pttKey = useStore((s) => s.settings.pttKey);
  const pttActive = useVoice((v) => v.pttActive);
  const canSpeak = useVoice((v) => v.grants.speak);
  const off = muted || !canSpeak;
  const label = !canSpeak ? t('You can’t speak here') : muted ? t('Unmute') : ptt ? t('Push to talk: hold {key}', { key: keyLabel(pttKey) || '?' }) : t('Mute');
  return (
    <Tooltip content={label}>
      <button
        className={cn('vbtn', off && 'is-off', ptt && !off && pttActive && 'is-talking', compact && 'is-small')}
        onClick={useStore.getState().toggleMute}
        aria-pressed={muted}
        aria-label={t('Microphone')}
      >
        {off ? <MicOff /> : <Mic />}
      </button>
    </Tooltip>
  );
}

export function VoiceControls({ compact, onLeave, leaveLabel }: { compact?: boolean; onLeave: () => void; leaveLabel: string }) {
  const v = useStore((s) => s.voiceSelf);
  const grants = useVoice((x) => x.grants);
  const connected = useVoice((x) => x.status === 'connected');
  const { toggleDeafen, toggleCamera, toggleScreen } = useStore.getState();
  const note = screenShareNote();

  const screenButton = (
    <button
      className={cn('vbtn', v.screen && 'is-on')}
      aria-pressed={v.screen}
      aria-label={t('Share screen')}
      disabled={!connected || (!v.screen && !grants.screen)}
      data-unavailable={!support.screenShare || undefined}
      onClick={v.screen || !support.screenShare ? () => toggleScreen() : undefined}
    >
      {v.screen ? <MonitorOff /> : <MonitorUp />}
    </button>
  );

  return (
    <div className={cn('vcontrols', compact && 'is-compact')}>
      <MicButton />
      <NoiseSuppressionButton />
      <Tooltip content={v.deafened ? t('Undeafen') : t('Deafen')}>
        <button className={cn('vbtn', v.deafened && 'is-off')} onClick={toggleDeafen} aria-pressed={v.deafened} aria-label={t('Sound')}>
          {v.deafened ? <HeadphoneOff /> : <Headphones />}
        </button>
      </Tooltip>
      <Tooltip content={!grants.video ? t('Video isn’t allowed here') : v.camera ? t('Turn off camera') : t('Turn on camera')}>
        <button
          className={cn('vbtn', v.camera && 'is-on')}
          onClick={toggleCamera}
          aria-pressed={v.camera}
          aria-label={t('Camera')}
          disabled={!connected || !support.media || (!v.camera && !grants.video)}
        >
          {v.camera ? <Video /> : <VideoOff />}
        </button>
      </Tooltip>
      {v.screen || !support.screenShare || !grants.screen ? (
        <Tooltip content={v.screen ? t('Stop sharing') : !grants.screen ? t('Screen sharing isn’t allowed here') : t('Share screen')}>{screenButton}</Tooltip>
      ) : (
        <Dropdown
          side="top"
          align="center"
          header={note ? <p className="menu-note">{note}</p> : undefined}
          trigger={screenButton}
          items={[
            { type: 'label', label: t('Share screen, window or tab') },
            { label: t('Sharp – for text and code'), hint: t('1080p · 15 fps'), icon: <Type />, onSelect: () => toggleScreen({ motion: false }) },
            { label: t('Smooth – for videos and games'), hint: t('720p · 30 fps'), icon: <Gauge />, onSelect: () => toggleScreen({ motion: true }) },
          ]}
        />
      )}
      <Tooltip content={t('Voice & video settings')}>
        <button className="vbtn" onClick={() => useUI.getState().openSettings({ kind: 'user', section: 'voice' })} aria-label={t('Voice & video settings')}>
          <Settings />
        </button>
      </Tooltip>
      <Tooltip content={leaveLabel}>
        <button className="vbtn vbtn-leave" onClick={onLeave} aria-label={leaveLabel}>
          <PhoneOff />
        </button>
      </Tooltip>
    </div>
  );
}
