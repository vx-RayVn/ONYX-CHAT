/**
 * Voice message recorder in the composer: asks for the microphone, shows the
 * running time and live waveform, then lets you listen, discard or send.
 * Keyboard: Enter stops / sends, Escape discards.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, SendHorizontal, Square, Trash } from 'lucide-react';
import type { Attachment } from '../../types';
import { toast } from '../../store/ui';
import { formatAudioTime, MAX_VOICE_SECONDS, recorderErrorText, VoiceRecorder, voiceToAttachment, WAVE_BARS, type Recording } from '../../lib/audio';
import { t } from '../../i18n';
import { Tooltip } from '../ui/Tooltip';
import { AudioPlayer, Waveform } from './AudioPlayer';

type Phase = { kind: 'requesting' } | { kind: 'recording' } | { kind: 'stopping' } | { kind: 'preview'; rec: Recording; url: string } | { kind: 'sending'; rec: Recording; url: string };

export function VoiceRecorderBar({ onSend, onClose }: { onSend: (att: Attachment) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'requesting' });
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<VoiceRecorder | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);

  const stop = async () => {
    const r = recorder.current;
    if (!r) return;
    setPhase({ kind: 'stopping' });
    const rec = await r.stop();
    recorder.current = null;
    if (!rec || rec.duration < 0.4) {
      toast({ title: t('Nothing was recorded'), body: t('Hold on a little longer before stopping.') });
      onClose();
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    urlRef.current = url;
    setPhase({ kind: 'preview', rec, url });
  };

  useEffect(() => {
    const r = new VoiceRecorder();
    recorder.current = r;
    r.onLevel = (level, secs) => {
      setElapsed(secs);
      setLevels((l) => [...l.slice(-(WAVE_BARS - 1)), level]);
    };
    r.onAutoStop = () => {
      toast({ title: t('Maximum length reached'), body: t('Voice messages can be up to {minutes} minutes long.', { minutes: MAX_VOICE_SECONDS / 60 }) });
      void stop();
    };
    r.start().then((err) => {
      // A newer recorder replaced this one (or it was discarded meanwhile).
      if (recorder.current !== r) return;
      if (err) {
        toast({ tone: 'danger', title: t('Recording not possible'), body: recorderErrorText(err) });
        onClose();
      } else {
        setPhase({ kind: 'recording' });
        box.current?.focus();
      }
    });
    return () => {
      r.discard();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const send = async () => {
    if (phase.kind !== 'preview') return;
    setPhase({ ...phase, kind: 'sending' });
    try {
      const att = await voiceToAttachment(phase.rec.blob, phase.rec.duration, phase.rec.waveform);
      onSend(att);
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: t('Voice message not sent'), body: e instanceof Error && e.message ? e.message : t('The browser storage couldn’t save the recording.') });
      setPhase({ ...phase, kind: 'preview' });
    }
  };

  const discard = () => {
    recorder.current?.discard();
    recorder.current = null;
    onClose();
  };

  return (
    <div
      ref={box}
      className="recorder"
      role="group"
      aria-label={t('Voice message')}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          discard();
        } else if (e.key === 'Enter' && (e.target as HTMLElement) === box.current) {
          e.preventDefault();
          if (phase.kind === 'recording') void stop();
          else if (phase.kind === 'preview') void send();
        }
      }}
    >
      <Tooltip content={t('Discard · Esc')}>
        <button className="icon-btn recorder-discard" onClick={discard} aria-label={t('Discard voice message')}>
          <Trash />
        </button>
      </Tooltip>

      {(phase.kind === 'requesting' || phase.kind === 'recording' || phase.kind === 'stopping') && (
        <>
          <span className={phase.kind === 'recording' ? 'rec-dot is-live' : 'rec-dot'} aria-hidden />
          <span className="recorder-label" aria-live="polite">
            {phase.kind === 'requesting' ? t('Waiting for microphone access …') : phase.kind === 'stopping' ? t('Finishing …') : t('Recording')}
          </span>
          <span className="recorder-wave">
            <Waveform bars={levels.length ? [...Array(Math.max(0, WAVE_BARS - levels.length)).fill(0.06), ...levels] : []} progress={1} live />
          </span>
          <span className="recorder-time tnum" aria-label={t('Recording time')}>
            {formatAudioTime(elapsed)}
            <span className="recorder-max"> / {formatAudioTime(MAX_VOICE_SECONDS)}</span>
          </span>
          <Tooltip content={t('Stop recording · Enter')}>
            <button className="recorder-stop" onClick={() => void stop()} disabled={phase.kind !== 'recording'} aria-label={t('Stop recording')}>
              {phase.kind === 'recording' ? <Square size={14} fill="currentColor" /> : <Loader2 size={16} className="spin" />}
            </button>
          </Tooltip>
        </>
      )}

      {(phase.kind === 'preview' || phase.kind === 'sending') && (
        <>
          <span className="recorder-player">
            <AudioPlayer
              compact
              src={phase.url}
              attachment={{
                id: 'voice-preview',
                name: t('Voice message'),
                size: phase.rec.blob.size,
                duration: phase.rec.duration,
                waveform: phase.rec.waveform,
                mime: phase.rec.blob.type,
                voice: true,
              }}
            />
          </span>
          <Tooltip content={t('Send · Enter')}>
            <button className="composer-send is-ready" onClick={() => void send()} disabled={phase.kind === 'sending'} aria-label={t('Send voice message')}>
              {phase.kind === 'sending' ? <Loader2 size={18} className="spin" /> : <SendHorizontal size={18} />}
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
