/**
 * Player for voice messages and audio files: play/pause, a seekable waveform
 * (mouse, touch and keyboard), elapsed/total time and playback speed. Only one
 * audio plays at a time.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AudioLines, Download, FileMusic, Pause, Play } from 'lucide-react';
import type { Attachment } from '../../types';
import { canPlay, formatAudioTime, getAudio, WAVE_BARS } from '../../lib/audio';
import { cn, formatBytes } from '../../lib/utils';
import { t } from '../../i18n';
import { Tooltip } from '../ui/Tooltip';

const PLAY_EVENT = 'onyx-audio-play';
const SPEEDS = [1, 1.5, 2];

/** Object URL of the locally stored audio (null while loading, '' when missing). */
function useAudioUrl(key: string | undefined, direct?: string) {
  const [url, setUrl] = useState<string | null>(direct ?? null);
  useEffect(() => {
    if (direct) return;
    if (!key) {
      setUrl('');
      return;
    }
    let alive = true;
    let objectUrl = '';
    getAudio(key)
      .then((blob) => {
        if (!alive) return;
        if (!blob) return setUrl('');
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => alive && setUrl(''));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, direct]);
  return url;
}

export function Waveform({ bars, progress = 0, live }: { bars: number[]; progress?: number; live?: boolean }) {
  const list = bars.length ? bars : Array(WAVE_BARS).fill(0.08);
  return (
    <span className={cn('wave', live && 'is-live')} aria-hidden>
      {list.map((v, i) => (
        <span key={i} className={cn('wave-bar', (i + 0.5) / list.length <= progress && 'is-played')} style={{ height: `${Math.max(8, v * 100)}%` }} />
      ))}
    </span>
  );
}

export function AudioPlayer({
  attachment: a,
  src,
  compact,
}: {
  attachment: Pick<Attachment, 'id' | 'name' | 'size' | 'duration' | 'waveform' | 'mime' | 'voice' | 'localKey'>;
  src?: string;
  compact?: boolean;
}) {
  const url = useAudioUrl(a.localKey, src);
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(a.duration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const playable = canPlay(a.mime) && !failed;

  // Pause when another player starts.
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== a.id) audio.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOther);
    return () => window.removeEventListener(PLAY_EVENT, onOther);
  }, [a.id]);

  const toggle = () => {
    const el = audio.current;
    if (!el || !url) return;
    if (el.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: a.id }));
      el.playbackRate = speed;
      el.play().catch(() => setFailed(true));
    } else el.pause();
  };

  const total = Number.isFinite(duration) && duration > 0 ? duration : (a.duration ?? 0);
  const seekTo = (seconds: number) => {
    const el = audio.current;
    if (!el || !total) return;
    el.currentTime = Math.max(0, Math.min(total, seconds));
    setTime(el.currentTime);
  };
  const seekFromPointer = (e: PointerEvent) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || !total) return;
    const rtl = getComputedStyle(track.current!).direction === 'rtl';
    const x = rtl ? rect.right - e.clientX : e.clientX - rect.left;
    seekTo((x / rect.width) * total);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') seekTo(time + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') seekTo(time - step);
    else if (e.key === 'Home') seekTo(0);
    else if (e.key === 'End') seekTo(total);
    else if (e.key === ' ' || e.key === 'Enter') toggle();
    else return;
    e.preventDefault();
  };

  const missing = url === '';
  const progress = total ? time / total : 0;
  const label = a.voice ? t('Voice message') : a.name;

  return (
    <div className={cn('audio', a.voice ? 'is-voice' : 'is-file', compact && 'is-compact', (missing || !playable) && 'is-unavailable')}>
      {!a.voice && (
        <div className="audio-file">
          <FileMusic size={18} />
          <span className="truncate">{a.name}</span>
          <span className="audio-size">{formatBytes(a.size)}</span>
        </div>
      )}
      <div className="audio-row">
        <button className="audio-play" onClick={toggle} disabled={!url || !playable} aria-label={playing ? t('Pause {name}', { name: label }) : t('Play {name}', { name: label })}>
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <div
          ref={track}
          className="audio-track"
          role="slider"
          tabIndex={url && playable ? 0 : -1}
          aria-label={t('Position in {name}', { name: label })}
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatAudioTime(time)} / ${formatAudioTime(total)}`}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            if (!url || !playable) return;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
        >
          <Waveform bars={a.waveform ?? []} progress={progress} />
        </div>
        <span className="audio-time tnum">{playing || time > 0 ? `${formatAudioTime(time)} / ${formatAudioTime(total)}` : formatAudioTime(total)}</span>
        <Tooltip content={t('Playback speed')}>
          <button
            className="audio-speed tnum"
            disabled={!url || !playable}
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
              setSpeed(next);
              if (audio.current) audio.current.playbackRate = next;
            }}
            aria-label={t('Playback speed {speed}×', { speed: speed })}
          >
            {speed}×
          </button>
        </Tooltip>
      </div>
      {(missing || !playable) && (
        <div className="audio-note">
          <AudioLines size={14} />
          {missing ? t('The audio isn’t stored on this device (local demo storage).') : t('Your browser can’t play this audio format.')}
          {!missing && url && (
            <a href={url} download={a.name} className="audio-download">
              <Download size={13} /> {t('Download')}
            </a>
          )}
        </div>
      )}
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setTime(0);
          }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
