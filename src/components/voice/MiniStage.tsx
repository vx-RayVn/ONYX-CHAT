/**
 * Picture-in-picture inside ONYX: while you are connected and look at
 * something else (another channel, a DM, settings), the most relevant video
 * keeps playing in a small window that can be dragged around. A click goes
 * back to the voice channel or call.
 */
import { useRef, useState, type PointerEvent } from 'react';
import { Maximize2, PhoneOff, X } from 'lucide-react';
import { useStore } from '../../store/store';
import { showMainPane } from '../../store/ui';
import { t } from '../../i18n';
import { useVoice } from '../../voice/state';
import { MediaTile } from './MediaTile';
import { MicButton } from './VoiceControls';

export function MiniStage() {
  const channelId = useStore((s) => s.voiceSelf.channelId);
  const call = useStore((s) => s.call);
  const viewing = useStore((s) => {
    const v = s.view;
    return (v.kind === 'server' && !!v.channelId && v.channelId === s.voiceSelf.channelId) || (v.kind === 'dm' && v.dmId === s.call?.dmId);
  });
  const meId = useStore((s) => s.meId);
  const peers = useVoice((v) => v.peers);
  const focus = useVoice((v) => v.focus);
  const status = useVoice((v) => v.status);
  const [hidden, setHidden] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const room = channelId ?? call?.dmId ?? null;
  if (!room || viewing || status === 'idle' || hidden === room) return null;

  // What to show: the focused tile, else a screen share, else someone else's camera, else your own.
  let pick: { userId: string; kind: 'camera' | 'screen' } | null = null;
  if (focus) {
    const [userId, kind] = focus.split(':') as [string, 'camera' | 'screen'];
    if (peers[userId]?.[kind]) pick = { userId, kind };
  }
  const list = Object.values(peers);
  pick ??= (() => {
    const scr = list.find((p) => p.screen && p.id !== meId) ?? list.find((p) => p.screen);
    if (scr) return { userId: scr.id, kind: 'screen' as const };
    const cam = list.find((p) => p.camera && p.id !== meId) ?? list.find((p) => p.camera);
    return cam ? { userId: cam.id, kind: 'camera' as const } : null;
  })();
  if (!pick) return null;

  const open = () => {
    const s = useStore.getState();
    if (channelId) {
      const ch = s.channels[channelId];
      if (ch) s.selectChannel(ch.serverId, ch.id);
    } else if (call) s.openDM(call.dmId);
    showMainPane();
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const w = e.currentTarget.offsetWidth;
    const h = e.currentTarget.offsetHeight;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - drag.current.dx)),
      y: Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - drag.current.dy)),
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="mini-stage"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onDoubleClick={open}
    >
      <MediaTile userId={pick.userId} kind={pick.kind} serverId={channelId ? (useStore.getState().channels[channelId]?.serverId ?? null) : null} bare />
      <div className="mini-stage-bar">
        <MicButton compact />
        <button className="mini-stage-btn" onClick={open} aria-label={t('Back to the call')} title={t('Back to the call')}>
          <Maximize2 size={16} />
        </button>
        <button
          className="mini-stage-btn is-danger"
          onClick={() => (channelId ? useStore.getState().leaveVoice() : useStore.getState().endCall())}
          aria-label={t('Disconnect')}
          title={t('Disconnect')}
        >
          <PhoneOff size={16} />
        </button>
        <button className="mini-stage-btn" onClick={() => setHidden(room)} aria-label={t('Hide')} title={t('Hide')}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
