/**
 * "Voice connected" above the own user panel: status with connection quality
 * and round-trip time, where you are (click to go there), camera, screen and
 * disconnect.
 */
import { MonitorOff, MonitorUp, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useStore } from '../../store/store';
import { showMainPane } from '../../store/ui';
import { dmTitle } from '../../store/selectors';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { useVoice, type Quality } from '../../voice/state';

const QUALITY_TEXT: Record<Quality, () => string> = {
  excellent: () => t('Excellent connection'),
  good: () => t('Good connection'),
  poor: () => t('Weak connection'),
  lost: () => t('Connection lost'),
  unknown: () => t('Connection quality unknown'),
};

export function SignalBars({ quality }: { quality: Quality }) {
  const level = quality === 'excellent' ? 3 : quality === 'good' ? 2 : quality === 'poor' ? 1 : 0;
  return (
    <span className={cn('signal', `q-${quality}`)} aria-label={QUALITY_TEXT[quality]()}>
      <i className={cn(level >= 1 && 'on')} />
      <i className={cn(level >= 2 && 'on')} />
      <i className={cn(level >= 3 && 'on')} />
    </span>
  );
}

export function VoicePanel() {
  const voiceSelf = useStore((s) => s.voiceSelf);
  const channel = useStore((s) => (s.voiceSelf.channelId ? s.channels[s.voiceSelf.channelId] : undefined));
  const server = useStore((s) => (channel ? s.servers[channel.serverId] : undefined));
  const call = useStore((s) => s.call);
  const callTitle = useStore((s) => {
    const dm = s.call ? s.dms[s.call.dmId] : undefined;
    return dm ? dmTitle(s, dm) : '';
  });
  const status = useVoice((v) => v.status);
  const mode = useVoice((v) => v.mode);
  const rtt = useVoice((v) => v.rtt);
  const quality = useVoice((v) => v.peers[useStore.getState().meId]?.quality ?? 'unknown');
  const grants = useVoice((v) => v.grants);
  const { leaveVoice, toggleCamera, toggleScreen, endCall, selectChannel, openDM } = useStore.getState();

  if (!channel && !call) return null;
  const isCall = !!call && !channel;
  const state =
    status === 'connecting' || call?.state === 'connecting'
      ? t('Connecting …')
      : status === 'reconnecting'
        ? t('Reconnecting …')
        : isCall
          ? call!.state === 'ringing'
            ? t('Calling …')
            : t('In a call')
          : mode === 'local'
            ? t('Local preview')
            : t('Voice connected');
  const tone = status === 'connected' && (quality === 'poor' || quality === 'lost') ? 'is-poor' : status !== 'connected' ? 'is-pending' : '';

  return (
    <div className="voice-panel">
      <div className="voice-panel-top">
        <div className="voice-panel-status">
          <Tooltip content={mode === 'local' ? t('Demo: nothing is transmitted.') : `${QUALITY_TEXT[quality]()}${rtt ? ` · ${t('{ms} ms ping', { ms: rtt })}` : ''}`}>
            <span className={cn('voice-panel-state', tone)}>
              <SignalBars quality={status === 'connected' ? quality : 'unknown'} />
              {state}
            </span>
          </Tooltip>
          <button
            className="voice-panel-where truncate"
            onClick={() => {
              if (isCall) openDM(call!.dmId);
              else if (channel) selectChannel(channel.serverId, channel.id);
              showMainPane();
            }}
          >
            {isCall ? callTitle : `${channel!.name} / ${server?.name ?? ''}`}
          </button>
        </div>
        <IconButton label={isCall ? t('Hang up') : t('Disconnect')} danger onClick={() => (isCall ? endCall() : leaveVoice())}>
          <PhoneOff />
        </IconButton>
      </div>
      <div className="voice-panel-actions">
        <Tooltip content={voiceSelf.camera ? t('Turn off camera') : t('Turn on camera')}>
          <button
            className={cn(voiceSelf.camera && 'is-on')}
            onClick={toggleCamera}
            aria-pressed={voiceSelf.camera}
            aria-label={t('Camera')}
            disabled={status !== 'connected' || (!voiceSelf.camera && !grants.video)}
          >
            {voiceSelf.camera ? <Video /> : <VideoOff />}
          </button>
        </Tooltip>
        <Tooltip content={voiceSelf.screen ? t('Stop sharing') : t('Share screen')}>
          <button
            className={cn(voiceSelf.screen && 'is-on')}
            onClick={() => toggleScreen()}
            aria-pressed={voiceSelf.screen}
            aria-label={t('Share screen')}
            disabled={status !== 'connected' || (!voiceSelf.screen && !grants.screen)}
          >
            {voiceSelf.screen ? <MonitorOff /> : <MonitorUp />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
