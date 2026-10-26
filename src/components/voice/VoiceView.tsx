import { HeaderTools } from '../layout/HeaderTools';
/**
 * A voice channel: lobby before joining, then the stage with everyone's
 * camera or avatar and the screen shares – as a grid or with one tile large.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Info, Loader2, RefreshCw, Users, Volume2, VolumeX } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { showNavPane } from '../../store/ui';
import { can } from '../../store/selectors';
import { useIsSpeaking } from '../../store/speaking';
import { cn, formatDuration } from '../../lib/utils';
import { t, tn } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { CLOUD } from '../../backend/config';
import { useVoice } from '../../voice/state';
import { mediaNote, support } from '../../voice/support';
import { startAudio } from '../../voice/engine';
import { MediaTile, type TileKind } from './MediaTile';
import { VoiceControls } from './VoiceControls';
import { SignalBars } from './VoicePanel';

export function useTicker(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export interface TileRef {
  userId: ID;
  kind: TileKind;
}

/** Tiles of a room: everyone (camera or avatar), plus a tile per screen share. */
export function useTiles(scopeId: ID | null): TileRef[] {
  const listed = useStore((s) => (scopeId ? s.voice[scopeId] : undefined));
  const peers = useVoice((v) => v.peers);
  const selfId = useStore((s) => scopeId && (s.voiceSelf.channelId === scopeId || s.call?.dmId === scopeId) ? s.meId : null);
  return useMemo(() => {
    const ids = [...(listed ?? []).map((p) => p.userId)];
    if (selfId && !ids.includes(selfId)) ids.push(selfId);
    for (const id of Object.keys(peers)) if (!ids.includes(id)) ids.push(id);
    const out: TileRef[] = [];
    for (const id of ids) if (peers[id]?.screen) out.push({ userId: id, kind: 'screen' });
    for (const id of ids) out.push({ userId: id, kind: 'camera' });
    return out;
  }, [listed, peers, selfId]);
}

/** Grid or focus layout for a list of tiles. */
export function Stage({ tiles, serverId }: { tiles: TileRef[]; serverId: ID | null }) {
  const focus = useVoice((v) => v.focus);
  const focused = focus ? tiles.find((x) => `${x.userId}:${x.kind}` === focus) : undefined;
  const setFocus = (key: string | null) => useVoice.setState({ focus: key });
  if (focused) {
    return (
      <div className="vgrid is-focus">
        <MediaTile userId={focused.userId} kind={focused.kind} serverId={serverId} focused onFocus={() => setFocus(null)} />
        <div className="vstrip">
          {tiles
            .filter((x) => x !== focused)
            .map((x) => (
              <MediaTile key={`${x.userId}:${x.kind}`} userId={x.userId} kind={x.kind} serverId={serverId} onFocus={() => setFocus(`${x.userId}:${x.kind}`)} />
            ))}
        </div>
      </div>
    );
  }
  return (
    <div className={cn('vgrid', `n-${Math.min(tiles.length, 9)}`)}>
      {tiles.map((x) => (
        <MediaTile key={`${x.userId}:${x.kind}`} userId={x.userId} kind={x.kind} serverId={serverId} onFocus={() => setFocus(`${x.userId}:${x.kind}`)} />
      ))}
    </div>
  );
}

/** Notices above the stage: demo preview, blocked sound, reconnecting. */
export function VoiceNotices({ demoText }: { demoText?: string }) {
  const mode = useVoice((v) => v.mode);
  const status = useVoice((v) => v.status);
  const audioBlocked = useVoice((v) => v.audioBlocked);
  const micBlocked = useVoice((v) => v.micBlocked);
  return (
    <>
      {mode === 'local' && demoText && (
        <div className="voice-notice">
          <Info size={16} />
          <span>
            <strong>{t('Demo – local preview:')}</strong> {demoText}
          </span>
        </div>
      )}
      {status === 'reconnecting' && (
        <div className="voice-notice is-warn" role="status">
          <RefreshCw size={16} className="spin" />
          <span>{t('Connection interrupted – reconnecting …')}</span>
        </div>
      )}
      {audioBlocked && (
        <div className="voice-notice is-warn">
          <VolumeX size={16} />
          <span>{t('Your browser paused the sound until you click.')}</span>
          <button onClick={() => void startAudio()}>{t('Enable sound')}</button>
        </div>
      )}
      {micBlocked && (
        <div className="voice-notice is-warn">
          <Info size={16} />
          <span>{t('Your microphone is unavailable – others can’t hear you. Allow access in the browser and unmute again.')}</span>
        </div>
      )}
    </>
  );
}

export function VoiceView({ channelId }: { channelId: ID }) {
  const channel = useStore((s) => s.channels[channelId]);
  const participants = useStore((s) => s.voice[channelId]);
  const joined = useStore((s) => s.voiceSelf.channelId === channelId);
  const joinedAt = useStore((s) => s.voiceSelf.joinedAt);
  const otherChannel = useStore((s) => (s.voiceSelf.channelId && s.voiceSelf.channelId !== channelId ? s.channels[s.voiceSelf.channelId] : undefined));
  const inCall = useStore((s) => !!s.call);
  const joinVoice = useStore((s) => s.joinVoice);
  const leaveVoice = useStore((s) => s.leaveVoice);
  const canConnect = useStore((s) => can(s, channelId, 'connect'));
  const canSpeak = useStore((s) => can(s, channelId, 'speak'));
  const canMoveMembers = useStore((s) => can(s, channelId, 'moveMembers'));
  const status = useVoice((v) => v.status);
  const quality = useVoice((v) => v.peers[useStore.getState().meId]?.quality ?? 'unknown');
  const tiles = useTiles(joined ? channelId : null);
  useTicker(1000);

  const list = participants ?? [];
  const serverId = channel?.serverId ?? null;
  if (!channel) return null;
  const full = !!channel.userLimit && list.length >= channel.userLimit && !joined && !canMoveMembers;
  const connecting = joined && status === 'connecting';
  const note = mediaNote();

  return (
    <div className="voice-view">
      <header className="view-header voice-header">
        <IconButton label={t('Back')} className="mobile-only mobile-back" onClick={showNavPane} tooltip={false}>
          <ArrowLeft />
        </IconButton>
        <div className="view-header-title">
          <Volume2 size={22} className="vh-icon" />
          <h1 className="truncate">{channel.name}</h1>
        </div>
        <div className="view-header-tools">
          {connecting && <span className="voice-connecting" role="status"><Loader2 size={15} className="spin" /><span className="hide-sm">{t('Connecting …')}</span></span>}
          {joined && status === 'connected' && (
            <span className="voice-timer tnum">
              <SignalBars quality={quality} /> {formatDuration(Date.now() - joinedAt)}
            </span>
          )}
          <span className="voice-count-pill">
            <Users size={15} /> {list.length}
            {channel.userLimit ? ` / ${channel.userLimit}` : ''}
          </span>
        </div>
        <HeaderTools />
      </header>

      {joined && <VoiceNotices demoText={t('Only you see and hear this. Nothing is transmitted; the other people here are sample data. Real voice channels work with an ONYX account.')} />}

      {!joined ? (
        <div className="voice-lobby">
          <div className="voice-lobby-stack">
            {list.slice(0, 5).map((p) => (
              <LobbyAvatar key={p.userId} userId={p.userId} />
            ))}
            {list.length === 0 && (
              <span className="voice-lobby-empty">
                <Volume2 size={34} />
              </span>
            )}
          </div>
          <h2>{channel.name}</h2>
          <p>
            {list.length ? tn(list.length, '{count} person is in the voice channel right now.', '{count} people are in the voice channel right now.') : t('Nobody is here right now. Be the first!')}
            {!CLOUD && list.length > 0 && ` ${t('(sample data)')}`}
          </p>
          {otherChannel && <p className="voice-lobby-warn">{t('You’re already connected to “{name}” – joining switches channels.', { name: otherChannel.name })}</p>}
          {inCall && <p className="voice-lobby-warn">{t('Joining ends your current call.')}</p>}
          <Button size="lg" onClick={() => joinVoice(channelId)} disabled={full || !canConnect || connecting || (CLOUD && !support.rtc)} icon={connecting ? <Loader2 className="spin" /> : undefined}>
            {connecting ? t('Connecting …') : !canConnect ? t('You can’t connect here') : full ? t('Channel is full') : t('Join voice channel')}
          </Button>
          {!canConnect && <p className="voice-lobby-warn">{t('The “Connect” permission is missing in this channel.')}</p>}
          {canConnect && !canSpeak && <p className="voice-lobby-warn">{t('You can listen here, but not speak – you join muted.')}</p>}
          {note && <p className="voice-lobby-warn">{note}</p>}
          {!CLOUD && <span className="voice-lobby-hint">{t('Demo: joining starts a local preview of your own microphone and camera – nothing is transmitted.')}</span>}
        </div>
      ) : (
        <div className="voice-stage">
          <Stage tiles={tiles} serverId={serverId} />
          <VoiceControls onLeave={leaveVoice} leaveLabel={t('Disconnect')} />
        </div>
      )}
    </div>
  );
}

function LobbyAvatar({ userId }: { userId: ID }) {
  const user = useStore((s) => s.users[userId]);
  const speaking = useIsSpeaking(userId);
  return (
    <span className="voice-lobby-av">
      <Avatar user={user} size={64} speaking={speaking} />
    </span>
  );
}
