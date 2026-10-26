/**
 * Voice sounds – synthesised with Web Audio at play time (no audio files,
 * nothing taken from elsewhere), played on the chosen speaker where the
 * browser allows it.
 *
 *  ring      incoming call: a bright four-note figure, repeated every 3 s
 *  ringback  outgoing call while it rings: two soft notes every 3 s
 *  join      someone joins (or you connect): two notes up
 *  leave     someone leaves (or you disconnect): two notes down
 *  mute / unmute / deafen / undeafen: short clicks, lower when turning off
 */

export type VoiceSound = 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen';

let ctx: AudioContext | null = null;
let sinkId = '';
let destination: AudioNode | null = null;
let output: (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null = null;

export function closeVoiceAudio() {
  const previous = ctx;
  ctx = null;
  sinkId = '';
  destination?.disconnect();
  destination = null;
  if (output) {
    output.pause();
    (output.srcObject as MediaStream | null)?.getTracks().forEach((track) => track.stop());
    output.srcObject = null;
    output.remove();
    output = null;
  }
  void previous?.close().catch(() => {});
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const routable = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (!routable.setSinkId && 'setSinkId' in HTMLMediaElement.prototype) {
        // Firefox/macOS Safari can route media elements but not a Web Audio
        // context. Send generated call tones through a real stream element.
        const bus = ctx.createMediaStreamDestination();
        destination = bus;
        output = document.createElement('audio');
        output.hidden = true;
        output.id = 'onyx-voice-sounds';
        output.srcObject = bus.stream;
        document.body.appendChild(output);
        void output.setSinkId?.(sinkId || 'default').catch(() => {});
      } else {
        destination = ctx.destination;
        if (sinkId) void routable.setSinkId?.(sinkId).catch(() => {});
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    void output?.play().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Browsers only allow sound after a click or key press. Preparing the audio
 * on the first interaction lets an incoming call ring later even while ONYX
 * is in the background. Returns the cleanup.
 */
export function unlockVoiceAudio() {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    closeVoiceAudio();
  };
}

/** Speaker for the sounds ('default' = system default). Ignored where the browser can't choose. */
export function setSoundOutput(deviceId: string) {
  const id = deviceId === 'default' ? '' : deviceId;
  if (id === sinkId) return;
  sinkId = id;
  const ac = audio() as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
  ac?.setSinkId?.(id).catch(() => {});
  void output?.setSinkId?.(id || 'default').catch(() => {});
}

interface Note {
  freq: number;
  at: number;
  length: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<VoiceSound, Note[]> = {
  join: [
    { freq: 587.33, at: 0, length: 0.16 },
    { freq: 880, at: 0.09, length: 0.26 },
  ],
  leave: [
    { freq: 880, at: 0, length: 0.16 },
    { freq: 587.33, at: 0.09, length: 0.28 },
  ],
  mute: [{ freq: 520, at: 0, length: 0.09, type: 'triangle', gain: 0.7 }],
  unmute: [{ freq: 780, at: 0, length: 0.09, type: 'triangle', gain: 0.7 }],
  deafen: [
    { freq: 660, at: 0, length: 0.08, type: 'triangle', gain: 0.7 },
    { freq: 440, at: 0.07, length: 0.12, type: 'triangle', gain: 0.7 },
  ],
  undeafen: [
    { freq: 440, at: 0, length: 0.08, type: 'triangle', gain: 0.7 },
    { freq: 660, at: 0.07, length: 0.12, type: 'triangle', gain: 0.7 },
  ],
};

/** Incoming call: E6 C#6 A5 E6 – then a pause. */
const RING: Note[] = [
  { freq: 1318.5, at: 0, length: 0.16, type: 'triangle' },
  { freq: 1108.7, at: 0.16, length: 0.16, type: 'triangle' },
  { freq: 880, at: 0.32, length: 0.16, type: 'triangle' },
  { freq: 1318.5, at: 0.48, length: 0.42, type: 'triangle' },
  { freq: 1318.5, at: 1.1, length: 0.16, type: 'triangle' },
  { freq: 1108.7, at: 1.26, length: 0.16, type: 'triangle' },
  { freq: 880, at: 1.42, length: 0.16, type: 'triangle' },
  { freq: 1318.5, at: 1.58, length: 0.42, type: 'triangle' },
];
const RING_PERIOD = 3;

/** Outgoing call: soft A4 + C#5, then a pause. */
const RINGBACK: Note[] = [
  { freq: 440, at: 0, length: 0.9, gain: 0.55 },
  { freq: 554.37, at: 0.08, length: 0.9, gain: 0.45 },
];
const RINGBACK_PERIOD = 3;

function schedule(ac: AudioContext, notes: Note[], start: number, peak: number, dest: AudioNode) {
  for (const n of notes) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = n.type ?? 'sine';
    o.frequency.value = n.freq;
    const t0 = start + n.at;
    const p = peak * (n.gain ?? 1);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(p, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.length);
    o.connect(g).connect(dest);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t0);
    o.stop(t0 + n.length + 0.02);
  }
}

/** Perceived loudness grows roughly with the square of the slider (0–100). */
const peakFor = (volume: number, base: number) => base * Math.max(0, Math.min(1, volume / 100)) ** 2;

export function playVoiceSound(kind: VoiceSound, volume: number) {
  const ac = audio();
  if (!ac || volume <= 0) return;
  const out = ac.createBiquadFilter();
  out.type = 'lowpass';
  out.frequency.value = 4200;
  out.connect(destination ?? ac.destination);
  schedule(ac, SOUNDS[kind], ac.currentTime + 0.01, peakFor(volume, 0.18), out);
  window.setTimeout(() => out.disconnect(), 1000);
}

/**
 * Starts a repeating tone and returns the function that stops it. The loop
 * schedules one period ahead, so it keeps going while the tab is in the
 * background (timers are throttled there, the audio clock is not).
 */
function loop(notes: Note[], period: number, volume: number, base: number): () => void {
  const ac = audio();
  if (!ac || volume <= 0) return () => {};
  const out = ac.createGain();
  out.gain.value = 1;
  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 5000;
  tone.connect(out).connect(destination ?? ac.destination);
  const peak = peakFor(volume, base);
  let next = ac.currentTime + 0.05;
  const fill = () => {
    while (next < ac.currentTime + period * 2) {
      schedule(ac, notes, next, peak, tone);
      next += period;
    }
  };
  fill();
  const timer = window.setInterval(fill, 1000);
  return () => {
    window.clearInterval(timer);
    // Fade out quickly instead of cutting a note in half.
    out.gain.setTargetAtTime(0, ac.currentTime, 0.03);
    window.setTimeout(() => { tone.disconnect(); out.disconnect(); }, 300);
  };
}

export const startRingtone = (volume: number) => loop(RING, RING_PERIOD, volume, 0.16);
export const startRingback = (volume: number) => loop(RINGBACK, RINGBACK_PERIOD, volume, 0.12);
