/**
 * Text of a call notice in a DM: running (with "Join"), ended with its
 * duration, or missed. The details come from the call with the same id as
 * the message (loaded when shown, updated live).
 */
import { useEffect, type ReactNode } from 'react';
import type { Message } from '../../types';
import { useStore } from '../../store/store';
import { t, tn, tx } from '../../i18n';
import { requestCall, useCalls } from '../../voice/calls';

function duration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (ms < 60_000) return t('a few seconds');
  if (min < 60) return tn(min, '{count} minute', '{count} minutes');
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? t('{hours} h {minutes} min', { hours: h, minutes: rest }) : tn(h, '{count} hour', '{count} hours');
}

/** Missed (for the icon colour): I was called and never joined. */
export function useCallMissed(message: Message): boolean {
  const call = useCalls((s) => s.calls[message.id]);
  const meId = useStore((s) => s.meId);
  return !!call?.ended_at && call.started_by !== meId && !call.joined.includes(meId);
}

export function CallNotice({ message, name }: { message: Message; name: ReactNode }) {
  const call = useCalls((s) => s.calls[message.id]);
  const meId = useStore((s) => s.meId);
  const inIt = useStore((s) => s.call?.callId === message.id || (s.call?.dmId === message.channelId && !call?.ended_at));
  const startCall = useStore((s) => s.startCall);
  useEffect(() => requestCall(message.id), [message.id]);

  // Demo data and older notices store the minutes in the text.
  if (/^\d+$/.test(message.content)) {
    return <>{tx(tn(Number(message.content), '{name} started a call that lasted {count} minute.', '{name} started a call that lasted {count} minutes.'), { name })}</>;
  }
  if (!call || !call.ended_at) {
    return (
      <>
        {tx('{name} started a call.', { name })}
        {call && !inIt && (
          <button className="sys-link sys-join" onClick={() => startCall(call.dm_id)}>
            {t('Join call')}
          </button>
        )}
      </>
    );
  }
  const length = duration(Date.parse(call.ended_at) - Date.parse(call.started_at));
  const answered = call.joined.some((id) => id !== call.started_by);
  if (call.started_by !== meId && !call.joined.includes(meId)) {
    return <>{answered ? tx('You missed a call from {name} that lasted {duration}.', { name, duration: length }) : tx('You missed a call from {name}.', { name })}</>;
  }
  if (!answered) return <>{tx('{name} started a call. Nobody answered.', { name })}</>;
  return <>{tx('{name} started a call that lasted {duration}.', { name, duration: length })}</>;
}
