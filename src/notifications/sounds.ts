/**
 * ONYX notification sounds – synthesised with Web Audio at play time (no
 * audio files, nothing taken from elsewhere).
 *
 *  message – two soft notes a fourth apart (G5 → C6), quiet and short
 *  mention – three brighter notes rising (C6 → E6 → G6), for mentions and DMs
 *
 * Browsers only allow sound after the first click or key press on the page;
 * until then playing fails quietly.
 */

export type SoundKind = 'message' | 'mention';

let ctx: AudioContext | null = null;
let lastAt = 0;
const lastByScope = new Map<string, number>();

/** Shortest gap between two sounds, and between two sounds of the same chat. */
const GAP_MS = 1500;
const SCOPE_GAP_MS = 10_000;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Unlocks audio on the first interaction so later sounds can play while the user is elsewhere. */
export function unlockAudioOnInteraction() {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

interface Note {
  freq: number;
  at: number;
  length: number;
  type: OscillatorType;
}

const SOUNDS: Record<SoundKind, Note[]> = {
  message: [
    { freq: 783.99, at: 0, length: 0.22, type: 'sine' },
    { freq: 1046.5, at: 0.075, length: 0.3, type: 'sine' },
  ],
  mention: [
    { freq: 1046.5, at: 0, length: 0.2, type: 'triangle' },
    { freq: 1318.5, at: 0.07, length: 0.22, type: 'triangle' },
    { freq: 1568, at: 0.14, length: 0.38, type: 'triangle' },
  ],
};

/** Plays a sound right away (volume 0–100). Used for previews in the settings. */
export function playSound(kind: SoundKind, volume: number) {
  const ac = audio();
  if (!ac || volume <= 0) return;
  // Perceived loudness grows roughly with the square of the slider.
  const peak = 0.22 * (volume / 100) ** 2;
  const now = ac.currentTime + 0.01;
  const master = ac.createGain();
  master.gain.value = 1;
  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = kind === 'mention' ? 5200 : 3800;
  tone.connect(master).connect(ac.destination);
  for (const n of SOUNDS[kind]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = n.type;
    o.frequency.value = n.freq;
    // A touch of the octave makes it ring instead of beep.
    const overtone = ac.createOscillator();
    const og = ac.createGain();
    overtone.type = 'sine';
    overtone.frequency.value = n.freq * 2;
    og.gain.value = 0.18;
    overtone.connect(og).connect(g);
    g.gain.setValueAtTime(0, now + n.at);
    g.gain.linearRampToValueAtTime(peak, now + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.length);
    o.connect(g).connect(tone);
    for (const osc of [o, overtone]) {
      osc.start(now + n.at);
      osc.stop(now + n.at + n.length + 0.05);
    }
  }
}

/**
 * Plays a notification sound unless one just played. Mentions get through the
 * per-chat gap, plain messages of the same chat only every 10 seconds.
 */
export function playThrottled(kind: SoundKind, volume: number, scopeId: string) {
  const now = Date.now();
  if (now - lastAt < GAP_MS) return false;
  if (kind === 'message' && now - (lastByScope.get(scopeId) ?? 0) < SCOPE_GAP_MS) return false;
  lastAt = now;
  lastByScope.set(scopeId, now);
  playSound(kind, volume);
  return true;
}
