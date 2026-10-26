import {GuestTag} from '../ui/GuestTag';
/**
 * One person (camera or avatar) or one screen share in the voice view, the
 * call panel or the mini player. Video tracks are attached to a <video>
 * element here; LiveKit then picks the right quality for the tile's size
 * (adaptive stream) and pauses video that isn't visible.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HeadphoneOff, Maximize, Maximize2, MicOff, Minimize2, MonitorUp, PictureInPicture2, ShieldAlert, WifiOff } from 'lucide-react';
import type { Track } from 'livekit-client';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { memberDisplayName } from '../../store/selectors';
import { useIsSpeaking } from '../../store/speaking';
import { cn, withAlpha } from '../../lib/utils';
import { t } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { ContextMenu } from '../ui/Menu';
import { useVoice, type Quality } from '../../voice/state';
import { support } from '../../voice/support';
import { userMenu } from '../profile/userMenu';

/** Attaches a LiveKit video track to a <video> element. */
export function VideoTrackView({
  track,
  mirror,
  fit = 'cover',
  className,
  onVideo,
}: {
  track: Track;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  className?: string;
  onVideo?: (el: HTMLVideoElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    onVideo?.(el);
    return () => {
      track.detach(el);
      onVideo?.(null);
    };
  }, [track, onVideo]);
  return <video ref={ref} className={cn('vvideo', mirror && 'is-mirrored', fit === 'contain' && 'is-contain', className)} autoPlay playsInline muted />;
}

export function QualityIcon({ quality }: { quality: Quality }) {
  if (quality !== 'poor' && quality !== 'lost') return null;
  return (
    <Tooltip content={quality === 'lost' ? t('Connection lost') : t('Weak connection')}>
      <span className={cn('vtile-quality', quality === 'lost' && 'is-lost')}>
        <WifiOff size={14} />
      </span>
    </Tooltip>
  );
}

export type TileKind = 'camera' | 'screen';

interface TileProps {
  userId: ID;
  kind: TileKind;
  serverId: ID | null;
  focused?: boolean;
  /** Show only the picture (mini player). */
  bare?: boolean;
  onFocus?: () => void;
  extra?: ReactNode;
}

export function MediaTile({ userId, kind, serverId, focused, bare, onFocus, extra }: TileProps) {
  const user = useStore((s) => s.users[userId]);
  const name = useStore((s) => memberDisplayName(s, userId, serverId));
  const isMe = useStore((s) => s.meId === userId);
  const mirror = useStore((s) => s.settings.mirrorCamera);
  const p = useStore((s) => {
    const id = s.voiceSelf.channelId ?? s.call?.dmId;
    return id ? s.voice[id]?.find((x) => x.userId === userId) : undefined;
  });
  const peer = useVoice((v) => v.peers[userId]);
  const speaking = useIsSpeaking(userId);
  const box = useRef<HTMLDivElement>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  if (!user) return null;

  const track = kind === 'screen' ? peer?.screen : peer?.camera;
  const color = user.profileColors?.[0] ?? user.avatarColor;
  const muted = !!p?.muted;
  const deafened = !!p?.deafened;
  const serverFlag = p?.serverMuted || p?.serverDeafened;

  const fullscreen = () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };
  const pip = () => {
    if (!video) return;
    if (document.pictureInPictureElement === video) void document.exitPictureInPicture();
    else void video.requestPictureInPicture?.().catch(() => {});
  };

  const tile = (
    <div
      ref={box}
      className={cn('vtile anim-host', kind === 'screen' && 'is-screen', speaking && kind === 'camera' && 'is-speaking', focused && 'is-focused', !!track && 'has-media', bare && 'is-bare')}
      style={{ ['--tile-tint' as string]: withAlpha(color, 0.22) }}
      onDoubleClick={track ? fullscreen : undefined}
    >
      {track ? (
        <VideoTrackView track={track} mirror={kind === 'camera' && isMe && mirror} fit={kind === 'screen' || focused ? 'contain' : 'cover'} onVideo={setVideo} />
      ) : kind === 'screen' ? (
        <div className="vtile-media vtile-screen">
          <span className="vtile-media-label">
            <MonitorUp size={16} /> {t('Loading stream …')}
          </span>
        </div>
      ) : null}
      {!track && kind === 'camera' && (
        <button className="vtile-center" onClick={onFocus} aria-label={t('Focus {name}', { name })} tabIndex={onFocus ? 0 : -1}>
          <Avatar user={user} size={focused ? 112 : bare ? 56 : 80} speaking={speaking} />
        </button>
      )}
      {!bare && (
        <div className="vtile-foot">
          <span className="vtile-name"><GuestTag userId={userId}/>
            {kind === 'camera' && (muted || deafened) && (
              <span className={cn('vtile-flag', serverFlag && 'is-server')}>
                {serverFlag && <ShieldAlert size={13} />}
                {deafened ? <HeadphoneOff size={14} /> : <MicOff size={14} />}
              </span>
            )}
            {kind === 'screen' && <MonitorUp size={14} />}
            <span className="truncate">{kind === 'screen' ? t('{name}’s screen', { name }) : isMe ? t('{name} (you)', { name }) : name}</span>
          </span>
          {kind === 'screen' && <span className="live-tag">{t('LIVE')}</span>}
          {peer && <QualityIcon quality={peer.quality} />}
          {extra}
        </div>
      )}
      {!bare && (
        <div className="vtile-tools">
          {track && support.pictureInPicture && (
            <Tooltip content={t('Picture in picture')}>
              <button className="vtile-tool" onClick={pip} aria-label={t('Picture in picture')}>
                <PictureInPicture2 size={16} />
              </button>
            </Tooltip>
          )}
          {track && support.fullscreen && (
            <Tooltip content={t('Full screen')}>
              <button className="vtile-tool" onClick={fullscreen} aria-label={t('Full screen')}>
                <Maximize size={16} />
              </button>
            </Tooltip>
          )}
          {onFocus && (
            <Tooltip content={focused ? t('Show grid') : t('Focus')}>
              <button className="vtile-tool" onClick={onFocus} aria-label={focused ? t('Show grid') : t('Focus')}>
                {focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
  if (bare) return tile;
  return <ContextMenu items={() => userMenu(userId, serverId ?? undefined)}>{tile}</ContextMenu>;
}
