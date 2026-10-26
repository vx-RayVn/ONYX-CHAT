/**
 * Call area at the top of a DM or group: while it rings, the people being
 * called; once connected, everyone's camera / avatar and screen shares. If
 * a call runs without you, a bar to join it.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Phone, Video } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { cn, formatDuration } from '../../lib/utils';
import { t, tn } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { useVoice } from '../../voice/state';
import { RING_MS } from '../../voice/calls';
import { Stage, useTicker, useTiles, VoiceNotices } from './VoiceView';
import { VoiceControls } from './VoiceControls';

function Ringing({ userId }: { userId: ID }) {
  const user = useStore((s) => s.users[userId]);
  if (!user) return null;
  return (
    <div className="call-person is-ringing anim-host">
      <Avatar user={user} size={80} />
      <span className="call-person-name truncate">{user.displayName}</span>
    </div>
  );
}

function JoinBar({ dmId }: { dmId: ID }) {
  const list = useStore((s) => s.voice[dmId]);
  const startCall = useStore((s) => s.startCall);
  const users = useStore((s) => s.users);
  if (!list?.length) return null;
  return (
    <div className="call-banner">
      <span className="call-banner-people">
        {list.slice(0, 4).map((p) => (
          <Avatar key={p.userId} user={users[p.userId]} size={28} />
        ))}
      </span>
      <span className="call-banner-text">{tn(list.length, 'Call in progress · {count} person', 'Call in progress · {count} people')}</span>
      <Button size="sm" icon={<Phone size={16} />} onClick={() => startCall(dmId)}>
        {t('Join call')}
      </Button>
      <Tooltip content={t('Join with video')}>
        <Button size="sm" variant="secondary" icon={<Video size={16} />} onClick={() => startCall(dmId, { video: true })} aria-label={t('Join with video')} />
      </Tooltip>
    </div>
  );
}

export function CallPanel({ dmId }: { dmId: ID }) {
  const call = useStore((s) => (s.call?.dmId === dmId ? s.call : null));
  const dm = useStore((s) => s.dms[dmId]);
  const meId = useStore((s) => s.meId);
  const endCall = useStore((s) => s.endCall);
  const peers = useVoice((v) => v.peers);
  const tiles = useTiles(call ? dmId : null);
  const [large, setLarge] = useState(false);
  useTicker(1000);
  if (!dm) return null;
  if (!call) return <JoinBar dmId={dmId} />;

  const others = dm.participantIds.filter((id) => id !== meId);
  const waiting = call.state !== 'connected';
  const noAnswer = call.state === 'ringing' && Date.now() - call.startedAt > RING_MS;
  const notHere = others.filter((id) => !peers[id]);

  return (
    <div className={cn('call-panel', waiting && 'is-ringing', large && 'is-large')}>
      <div className="call-status">
        {call.state === 'connecting' ? (
          <span className="call-ringing">{t('Connecting …')}</span>
        ) : call.state === 'ringing' ? (
          <span className="call-ringing">{noAnswer ? t('No answer') : t('Calling …')}</span>
        ) : (
          <span className="call-time tnum">{formatDuration(Date.now() - call.startedAt)}</span>
        )}
        <button className="call-size" onClick={() => setLarge(!large)} aria-label={large ? t('Smaller') : t('Larger')} aria-expanded={large}>
          {large ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      <VoiceNotices />
      {waiting ? (
        <div className="call-people">
          {tiles
            .filter((x) => x.userId === meId)
            .map((x) => (
              <div key={x.kind} className="call-self">
                <Stage tiles={[x]} serverId={null} />
              </div>
            ))}
          {notHere.map((id) => (
            <Ringing key={id} userId={id} />
          ))}
        </div>
      ) : (
        <div className="call-stage">
          <Stage tiles={tiles} serverId={null} />
        </div>
      )}
      <VoiceControls compact onLeave={endCall} leaveLabel={t('Hang up')} />
    </div>
  );
}
