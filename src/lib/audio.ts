/**
 * Audio for voice messages and audio files – stored locally in this browser.
 *
 * Why IndexedDB: audio is binary and quickly larger than the ~5 MB that
 * localStorage allows. IndexedDB keeps the real recording (no fake data) across
 * reloads. Limits of the demo: the audio only exists in this browser on this
 * device, is not shared with other people, not part of the JSON export, and
 * is deleted by "Reset demo" or by clearing the site data.
 */
import type { Attachment } from '../types';
import { BRAND } from '../config/brand';
import { t } from '../i18n';
import { uid } from './utils';

/** Longest voice message in this demo. */
export const MAX_VOICE_SECONDS = 5 * 60;
/** Waveform resolution stored with each message. */
export const WAVE_BARS = 48;

/* ---------------------------------------------------------------- */
/* IndexedDB                                                          */
/* ---------------------------------------------------------------- */

const sandbox = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('sandbox');
const DB_NAME = sandbox ? 'onyx-media-sandbox' : 'onyx-media';
const STORE = 'audio';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
  const open = (version?: number) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  dbPromise ??= open()
    .then((d) => {
      if (d.objectStoreNames.contains(STORE)) return d;
      // The database exists without our store (e.g. created elsewhere): upgrade it.
      const next = d.version + 1;
      d.close();
      return open(next);
    })
    .catch((e) => {
      dbPromise = null;
      throw e;
    });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const putAudio = (key: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key)).then(() => undefined);
export const getAudio = (key: string) => run<Blob>('readonly', (s) => s.get(key) as IDBRequest<Blob>);
export const deleteAudio = (keys: string[]) => (keys.length ? run('readwrite', (s) => void keys.forEach((k) => s.delete(k))).catch(() => undefined) : Promise.resolve());
export const clearAudio = () => run('readwrite', (s) => s.clear()).catch(() => undefined);

/** Total size of the stored audio in bytes. */
export async function audioUsage(): Promise<{ bytes: number; count: number }> {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      let bytes = 0;
      let count = 0;
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve({ bytes, count });
        bytes += (c.value as Blob).size ?? 0;
        count++;
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return { bytes: 0, count: 0 };
  }
}

/* ---------------------------------------------------------------- */
/* Analysis                                                           */
/* ---------------------------------------------------------------- */

/** Reduces level samples to `bars` values between 0.06 and 1. */
export function downsample(levels: number[], bars = WAVE_BARS): number[] {
  if (!levels.length) return Array(bars).fill(0.06);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]);
    out.push(peak);
  }
  const max = Math.max(...out, 0.0001);
  return out.map((v) => Math.round(Math.max(0.06, v / max) * 100) / 100);
}

/** Duration and waveform of an audio file (null when the browser can't decode it). */
export async function analyseAudio(blob: Blob): Promise<{ duration: number; waveform: number[] } | null> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / (WAVE_BARS * 8)));
    const levels: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      let peak = 0;
      for (let j = i; j < Math.min(i + step, data.length); j++) peak = Math.max(peak, Math.abs(data[j]));
      levels.push(peak);
    }
    return { duration: buf.duration, waveform: downsample(levels) };
  } catch {
    return null;
  } finally {
    ctx.close().catch(() => undefined);
  }
}

export function canPlay(mime?: string) {
  if (!mime) return true;
  try {
    return new Audio().canPlayType(mime.split(';')[0]) !== '';
  } catch {
    return false;
  }
}

/** Uploaded audio file → attachment with the data stored locally. */
export async function audioFileToAttachment(file: File): Promise<Attachment> {
  const id = uid('a_');
  const info = await analyseAudio(file);
  await putAudio(id, file);
  return { id, name: file.name, size: file.size, kind: 'audio', mime: file.type || undefined, duration: info?.duration, waveform: info?.waveform, localKey: id };
}

/** Recorded voice message → attachment with the data stored locally. */
export async function voiceToAttachment(blob: Blob, duration: number, waveform: number[]): Promise<Attachment> {
  const id = uid('a_');
  if (blob.size > BRAND.uploadLimitMb * 1024 * 1024) throw new Error(t('The recording is too large.'));
  await putAudio(id, blob);
  const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
  return { id, name: `voice-message.${ext}`, size: blob.size, kind: 'audio', mime: blob.type, duration, waveform, voice: true, localKey: id };
}

export function formatAudioTime(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds)) return '–:––';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- */
/* Recording                                                          */
/* ---------------------------------------------------------------- */

export type RecorderError = 'unsupported' | 'insecure' | 'denied' | 'nodevice' | 'busy' | 'failed';

export function recorderErrorText(e: RecorderError) {
  switch (e) {
    case 'unsupported':
      return t('Your browser can’t record audio. You can still send an audio file.');
    case 'insecure':
      return t('Recording needs a secure connection (HTTPS or localhost).');
    case 'denied':
      return t('Microphone access was blocked. Allow it in your browser’s site settings and try again.');
    case 'nodevice':
      return t('No microphone found. Connect one and try again.');
    case 'busy':
      return t('The microphone is being used by another app or can’t be started.');
    default:
      return t('The recording couldn’t be started.');
  }
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm'];

export interface Recording {
  blob: Blob;
  duration: number;
  waveform: number[];
}

/**
 * Wraps getUserMedia + MediaRecorder. `onLevel` receives the live input level
 * (0–1) about 20 times per second for the live waveform.
 */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private chunks: Blob[] = [];
  private levels: number[] = [];
  private timer = 0;
  private startedAt = 0;
  private discarded = false;
  onLevel: (level: number, elapsed: number) => void = () => {};
  onAutoStop: () => void = () => {};

  static supported() {
    return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';
  }

  async start(): Promise<RecorderError | null> {
    if (!window.isSecureContext) return 'insecure';
    if (!VoiceRecorder.supported()) return 'unsupported';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'nodevice';
      if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
      return 'failed';
    }
    if (this.discarded) {
      this.cleanup();
      return null;
    }
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m));
    try {
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    } catch {
      this.cleanup();
      return 'unsupported';
    }
    this.recorder.ondataavailable = (ev) => ev.data.size && this.chunks.push(ev.data);
    this.recorder.start(250);
    this.startedAt = performance.now();

    // Live level for the waveform.
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const source = this.ctx.createMediaStreamSource(this.stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      this.timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
        this.levels.push(level);
        const elapsed = (performance.now() - this.startedAt) / 1000;
        this.onLevel(level, elapsed);
        if (elapsed >= MAX_VOICE_SECONDS) this.onAutoStop();
      }, 50);
    } catch {
      // Without Web Audio the recording still works – just without live waveform.
      this.timer = window.setInterval(() => {
        const elapsed = (performance.now() - this.startedAt) / 1000;
        this.levels.push(0.3);
        this.onLevel(0.3, elapsed);
        if (elapsed >= MAX_VOICE_SECONDS) this.onAutoStop();
      }, 50);
    }
    return null;
  }

  /** Stops and returns the recording. */
  stop(): Promise<Recording | null> {
    const rec = this.recorder;
    const duration = Math.min(MAX_VOICE_SECONDS, (performance.now() - this.startedAt) / 1000);
    if (!rec || rec.state === 'inactive') {
      this.cleanup();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || this.chunks[0]?.type || 'audio/webm' });
        const waveform = downsample(this.levels);
        this.cleanup();
        resolve(blob.size ? { blob, duration, waveform } : null);
      };
      rec.stop();
    });
  }

  discard() {
    this.discarded = true;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.cleanup();
  }

  private cleanup() {
    window.clearInterval(this.timer);
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.ctx = null;
  }
}
