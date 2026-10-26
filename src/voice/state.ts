/**
 * Live state of the own voice connection: connection status, the video
 * tracks to show, connection quality per person. Not persisted and kept out
 * of the main store (it holds LiveKit track objects and changes often).
 *
 * Who is in which channel comes from the server (store.voice); this is only
 * what the own connection sees. Volumes per person are a preference of this
 * device and stored locally.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Track } from 'livekit-client';
import type { ID } from '../types';

export type Quality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface LivePeer {
  id: ID;
  quality: Quality;
  /** Camera and screen share (video tracks); null when off. */
  camera: Track | null;
  screen: Track | null;
  /** The screen share has sound. */
  screenAudio: boolean;
  /** No microphone or microphone muted. */
  micOff: boolean;
}

export interface Grants {
  speak: boolean;
  video: boolean;
  screen: boolean;
}

export interface VoiceLive {
  status: ConnStatus;
  /** 'cloud' = LiveKit, 'local' = demo preview that never leaves this device. */
  mode: 'cloud' | 'local' | null;
  /** "channel:<id>" / "dm:<id>" */
  room: string | null;
  peers: Record<ID, LivePeer>;
  grants: Grants;
  serverMute: boolean;
  serverDeaf: boolean;
  /** The browser blocked playback until the next click (autoplay rules). */
  audioBlocked: boolean;
  /** Push-to-talk key held. */
  pttActive: boolean;
  /** Microphone could not be opened (denied or missing). */
  micBlocked: boolean;
  noiseFilter: 'browser' | 'loading' | 'krisp' | 'fallback';
  /** Round-trip time to the media server in ms. */
  rtt: number | null;
  /** Tile shown large: "<userId>:camera" or "<userId>:screen". */
  focus: string | null;
}

export const INITIAL_LIVE: VoiceLive = {
  status: 'idle',
  mode: null,
  room: null,
  peers: {},
  grants: { speak: true, video: true, screen: true },
  serverMute: false,
  serverDeaf: false,
  audioBlocked: false,
  pttActive: false,
  micBlocked: false,
  noiseFilter: 'browser',
  rtt: null,
  focus: null,
};

export const useVoice = create<VoiceLive>()(() => ({ ...INITIAL_LIVE }));

export function patchPeer(id: ID, patch: Partial<LivePeer>) {
  useVoice.setState((s) => {
    const prev = s.peers[id] ?? { id, quality: 'unknown' as Quality, camera: null, screen: null, screenAudio: false, micOff: true };
    return { peers: { ...s.peers, [id]: { ...prev, ...patch } } };
  });
}

export function removePeer(id: ID) {
  useVoice.setState((s) => {
    if (!s.peers[id]) return s;
    const peers = { ...s.peers };
    delete peers[id];
    const focus = s.focus?.startsWith(`${id}:`) ? null : s.focus;
    return { peers, focus };
  });
}

/* ---------------------------------------------------------------- */
/* Volumes per person (this device)                                   */
/* ---------------------------------------------------------------- */

interface Volumes {
  /** 0–2 (200 %); missing = 1 */
  voice: Record<ID, number>;
  /** Volume of a person's screen share sound, 0–2 */
  stream: Record<ID, number>;
  /** Muted only for me */
  muted: Record<ID, boolean>;
}

const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // storage full or blocked – volumes then only last for this session
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

export const useVolumes = create<Volumes>()(persist(() => ({ voice: {}, stream: {}, muted: {} }), { name: 'onyx-voice-volumes', storage: createJSONStorage(() => safeStorage) }));

export const volumeOf = (id: ID) => useVolumes.getState().voice[id] ?? 1;
export const streamVolumeOf = (id: ID) => useVolumes.getState().stream[id] ?? 1;
export const isLocallyMuted = (id: ID) => !!useVolumes.getState().muted[id];
