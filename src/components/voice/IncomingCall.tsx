/**
 * Incoming call window (bottom right, above everything): who calls, in which
 * conversation, accept with or without video, decline. Rings until answered,
 * declined, the caller hangs up or 45 s are over.
 */
import { Phone, PhoneOff, Video } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { dmTitle } from '../../store/selectors';
import { t } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { acceptCall, declineCall, useCalls } from '../../voice/calls';

function IncomingCard({ callId }: { callId: ID }) {
  const call = useCalls((s) => s.calls[callId]);
  const caller = useStore((s) => (call?.started_by ? s.users[call.started_by] : undefined));
  const group = useStore((s) => {
    const dm = call ? s.dms[call.dm_id] : undefined;
    return dm?.type === 'group' ? dmTitle(s, dm) : null;
  });
  const busy = useStore((s) => !!s.voiceSelf.channelId || !!s.call);
  if (!call) return null;
  const name = caller?.displayName ?? t('Someone');
  return (
    <div className="incoming-call" role="alertdialog" aria-label={t('Incoming call from {name}', { name })}>
      <span className="incoming-call-avatar">
        <Avatar user={caller} size={64} />
      </span>
      <div className="incoming-call-text">
        <strong className="truncate">{name}</strong>
        <span className="truncate">{group ? t('Calling in {group}', { group }) : call.video ? t('Incoming video call') : t('Incoming call')}</span>
        {busy && <span className="incoming-call-hint">{t('Accepting ends your current connection.')}</span>}
      </div>
      <div className="incoming-call-actions">
        <Tooltip content={t('Decline')}>
          <button className="call-btn is-decline" onClick={() => declineCall(callId)} aria-label={t('Decline')}>
            <PhoneOff />
          </button>
        </Tooltip>
        <Tooltip content={t('Accept with video')}>
          <button className="call-btn is-video" onClick={() => acceptCall(callId, true)} aria-label={t('Accept with video')}>
            <Video />
          </button>
        </Tooltip>
        <Tooltip content={t('Accept')}>
          <button className="call-btn is-accept" onClick={() => acceptCall(callId)} aria-label={t('Accept')} autoFocus>
            <Phone />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export function IncomingCalls() {
  const incoming = useCalls((s) => s.incoming);
  if (!incoming.length) return null;
  return (
    <div className="incoming-calls">
      {incoming.map((id) => (
        <IncomingCard key={id} callId={id} />
      ))}
    </div>
  );
}
