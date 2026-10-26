/**
 * The voice engine: one connection at a time (voice channel or DM call).
 *
 * Cloud mode: LiveKit (SFU). The Edge Function "voice" checks the rights and
 * issues a token whose grants decide what may be sent – this module only
 * drives the connection, the microphone, camera and screen, playback and
 * the reconnects.
 *
 * Demo mode: a real local preview of the own microphone, camera and screen
 * on this device only. Nothing is transmitted and nobody can hear you – the
 * voice view says so.
 *
 * The self flags (muted, deafened, camera, screen) live in the main store
 * (voiceSelf); the live media state in useVoice (state.ts).
 */
import {
  ConnectionQuality,
  createAudioAnalyser,
  createLocalAudioTrack,
  createLocalScreenTracks,
  createLocalVideoTrack,
  DisconnectReason,
  LocalAudioTrack,
  type AudioCaptureOptions,
  type AudioProcessorOptions,
  type LocalTrack,
  type LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  type TrackProcessor,
  type TrackPublication,
  VideoPresets,
} from 'livekit-client';
import type { ID } from '../types';
import { store } from '../backend/bridge';
import { CLOUD } from '../backend/config';
import { requestJoin, reportSelf, resetSelfReport, VoiceError, type JoinResponse } from '../backend/voice';
import { toast, useUI } from '../store/ui';
import { setSpeaking } from '../store/speaking';
import { t } from '../i18n';
import { INITIAL_LIVE, isLocallyMuted, patchPeer, removePeer, streamVolumeOf, useVoice, volumeOf, type Quality } from './state';
import { playVoiceSound, setSoundOutput, type VoiceSound } from './sounds';
import { mediaNote, screenAudio, screenCaptureUnavailableReason, support } from './support';
import { screenCaptureFailure } from './screenCapture';
import { categoryOf, channelPermissions, subjectFor } from '../lib/permissions';
import { forgetVoiceResume, readVoiceResume, saveVoiceResume } from './resume';

type Target = { kind: 'channel'; id: ID } | { kind: 'dm'; id: ID; video: boolean };

let room: Room | null = null;
const mixers = new WeakMap<Room, AudioContext>();
const liveKitCloudRooms = new WeakSet<Room>();
function closeMixer(r: Room) {
  const mixer = mixers.get(r);
  mixers.delete(r);
  void mixer?.close().catch(() => {});
}
/** The connection we are trying to have (kept during reconnects). */
let target: Target | null = null;
/** Rooms we left on purpose – their "disconnected" event is expected. */
const leftOnPurpose = new WeakSet<Room>();
/** Increases with every join; an older join that finishes late is dropped. */
let joinSeq = 0;
let retries = 0;
let rttTimer: ReturnType<typeof setInterval> | null = null;
let reconnectWatchdog: ReturnType<typeof setTimeout> | null = null;
/** Channel a moderator just moved us to (the removal from the old room is expected). */
let movedTo: ID | null = null;
/** Last "joined elsewhere" signal (the removal from the old room may arrive first). */
let lastElsewhere: { room: string; at: number } | null = null;
let cameraSeq = 0;
let screenSeq = 0;
let pageLeaving = false;
const micWork = new WeakMap<Room, Promise<void>>();
const resumedFor = new Set<ID>();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { pageLeaving = true; });
  window.addEventListener('pageshow', (event) => {
    pageLeaving = false;
    if (event.persisted) { resumedFor.clear(); void restorePreviousChannel(); }
  });
}

const settings = () => store().getState().settings;
const meId = () => store().getState().meId;
const dev = (id: string) => (id && id !== 'default' ? id : undefined);

function sound(kind: VoiceSound) {
  if (settings().voiceSounds) playVoiceSound(kind, settings().notifyVolume);
}

/* ---------------------------------------------------------------- */
/* Errors → text                                                      */
/* ---------------------------------------------------------------- */

export function voiceErrorText(e: unknown): string {
  const code = e instanceof VoiceError ? e.code : 'failed';
  switch (code) {
    case 'not_configured':
      return t('Voice and video aren’t set up on this ONYX server yet.');
    case 'unauthorized':
      return t('Your session has expired. Sign in again.');
    case 'suspended':
      return t('Your account is suspended.');
    case 'forbidden':
      return (e as VoiceError).permission === 'connect' ? t('You don’t have permission to connect here.') : t('You don’t have permission to do that here.');
    case 'blocked':
      return t('You can’t call in this conversation.');
    case 'full':
      return t('This voice channel is full.');
    case 'not_found':
      return t('This channel or conversation no longer exists.');
    case 'rate_limited':
      return t('Too many attempts – wait a moment and try again.');
    case 'hierarchy':
      return t('You can only do that to members below your highest role.');
    case 'target_cannot_connect':
      return t('This person can’t connect to that channel.');
    case 'livekit_unavailable':
      return t('The voice server can’t be reached right now. Try again in a moment.');
    case 'offline':
      return t('No connection to ONYX. Check your internet connection.');
    default:
      return t('Something went wrong. Please try again.');
  }
}

function mediaErrorText(e: unknown, kind: 'mic' | 'camera'): string | null {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return kind === 'mic'
      ? t('Microphone access is blocked. Allow it in the browser (icon in the address bar) and try again.')
      : t('Camera access is blocked. Allow it in the browser (icon in the address bar) and try again.');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return kind === 'mic' ? t('No microphone found.') : t('No camera found.');
  if (name === 'NotReadableError' || name === 'TrackStartError') return kind === 'mic' ? t('The microphone is being used by another app.') : t('The camera is being used by another app.');
  return kind === 'mic' ? t('The microphone couldn’t be started.') : t('The camera couldn’t be started.');
}

function screenFailed(error: unknown) {
  useUI.getState().openModal({ type: 'screenShareHelp', issue: screenCaptureUnavailableReason() ?? screenCaptureFailure(error) });
}

/* ---------------------------------------------------------------- */
/* Microphone gain (settings: "Input volume")                         */
/* ---------------------------------------------------------------- */

class GainProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'onyx-gain';
  processedTrack?: MediaStreamTrack;
  private value: number;
  private ctx?: AudioContext;
  private ownCtx = false;
  private nodes: AudioNode[] = [];
  private gain?: GainNode;
  private noise?: import('./browser-noise-fallback').KrispNoiseFilterProcessor;
  private publishedRoom?: Room;
  private raw?: MediaStreamTrack;
  private source?: MediaStreamAudioSourceNode;
  private noiseEventsCleanup?: () => void;

  constructor(value: number) {
    this.value = value;
  }

  async init(opts: AudioProcessorOptions) {
    await this.setup(opts);
  }

  async restart(opts: AudioProcessorOptions) {
    await this.teardown();
    await this.setup(opts);
    if (this.publishedRoom) await this.onPublish(this.publishedRoom);
  }

  async destroy() {
    await this.teardown();
    this.publishedRoom = undefined;
  }

  set(value: number) {
    this.value = value;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  async onPublish(r: Room) {
    this.publishedRoom = r;
    const noise = this.noise;
    if (!noise) return;
    try {
      await noise.onPublish(r);
      if (this.noise !== noise) return;
      await noise.setEnabled(true);
      if (this.noise !== noise) return;
      if (room === r) useVoice.setState({ noiseFilter: noise.isEnabled() ? 'krisp' : 'fallback' });
    } catch {
      if (this.noise !== noise) return;
      this.bypassNoise();
      this.noiseEventsCleanup?.();
      this.noiseEventsCleanup = undefined;
      await this.noise?.destroy().catch(() => {});
      this.noise = undefined;
      if (room === r) useVoice.setState({ noiseFilter: 'fallback' });
    }
  }

  private bypassNoise() {
    if (!this.ctx || !this.raw || !this.gain) return;
    this.source?.disconnect();
    this.source = this.ctx.createMediaStreamSource(new MediaStream([this.raw]));
    this.source.connect(this.gain);
    this.nodes.push(this.source);
  }

  private async setup(opts: AudioProcessorOptions) {
    this.ownCtx = !opts.audioContext;
    const ctx = (this.ctx = opts.audioContext ?? new AudioContext());
    this.raw = opts.track;
    let input = opts.track;
    const connection = room;
    const cloud = !!connection && liveKitCloudRooms.has(connection);
    if (settings().enhancedNoiseSuppression && settings().noiseSuppression && cloud) {
      useVoice.setState({ noiseFilter: 'loading' });
      try {
        const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('./browser-noise-fallback');
        if (!isKrispNoiseFilterSupported()) throw new Error('unsupported');
        this.noise = KrispNoiseFilter({ quality: 'medium' });
        await this.noise.init(opts);
        if (room !== connection) {
          await this.noise.destroy().catch(() => {});
          this.noise = undefined;
        }
        input = this.noise?.processedTrack ?? opts.track;
      } catch {
        await this.noise?.destroy().catch(() => {});
        this.noise = undefined;
        if (room === connection) useVoice.setState({ noiseFilter: 'fallback' });
      }
    } else useVoice.setState({ noiseFilter: settings().enhancedNoiseSuppression ? 'fallback' : 'browser' });
    const src = (this.source = ctx.createMediaStreamSource(new MediaStream([input])));
    const gain = (this.gain = ctx.createGain());
    gain.gain.value = this.value;
    const dest = ctx.createMediaStreamDestination();
    src.connect(gain).connect(dest);
    this.nodes = [src, gain, dest];
    this.processedTrack = dest.stream.getAudioTracks()[0];
    const filtered = this.noise?.processedTrack;
    if (filtered) {
      const enabled = 'enable-lk-krisp-noise-filter';
      const disabled = 'disable-lk-krisp-noise-filter';
      const changed = (event: Event) => {
        if (room === connection) useVoice.setState({ noiseFilter: event.type === enabled ? 'krisp' : 'fallback' });
        this.processedTrack?.dispatchEvent(new Event(event.type));
      };
      filtered.addEventListener(enabled, changed);
      filtered.addEventListener(disabled, changed);
      this.noiseEventsCleanup = () => { filtered.removeEventListener(enabled, changed); filtered.removeEventListener(disabled, changed); };
    }
  }

  private async teardown() {
    this.noiseEventsCleanup?.();
    this.noiseEventsCleanup = undefined;
    for (const n of this.nodes) n.disconnect();
    this.nodes = [];
    this.processedTrack?.stop();
    this.processedTrack = undefined;
    await this.noise?.destroy().catch(() => {});
    this.noise = undefined;
    this.raw = undefined;
    this.source = undefined;
    if (this.ownCtx) void this.ctx?.close().catch(() => {});
    this.ctx = undefined;
  }
}

async function applyGain(track: LocalAudioTrack | undefined) {
  if (!track) return;
  const value = Math.max(0, Math.min(2, settings().micGain / 100));
  const processor = track.getProcessor();
  if (Math.abs(value - 1) < 0.01 && !(settings().noiseSuppression && settings().enhancedNoiseSuppression)) {
    if (processor instanceof GainProcessor) await track.stopProcessor().catch(() => {});
    return;
  }
  if (processor instanceof GainProcessor) processor.set(value);
  else if (!processor) {
    const next = new GainProcessor(value);
    await track.setProcessor(next).catch(async (e) => {
      await next.destroy();
      console.warn('[voice] gain unavailable', e);
    });
  }
}

/* ---------------------------------------------------------------- */
/* Capture options                                                    */
/* ---------------------------------------------------------------- */

function audioCapture(): AudioCaptureOptions {
  const s = settings();
  return {
    deviceId: dev(s.inputDevice),
    echoCancellation: s.echoCancellation,
    noiseSuppression: s.noiseSuppression,
    autoGainControl: s.autoGainControl,
  };
}

const videoCapture = () => ({ deviceId: dev(settings().videoDevice), resolution: VideoPresets.h720.resolution });

function roomOptions(mixer?: AudioContext) {
  return {
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    disconnectOnPageLeave: true,
    // Web Audio mix allows volumes above 100 % – only where it can still use the chosen speaker.
    webAudioMix: mixer ? { audioContext: mixer } : false,
    audioCaptureDefaults: audioCapture(),
    videoCaptureDefaults: videoCapture(),
    audioOutput: { deviceId: dev(settings().outputDevice) },
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      dtx: true,
      red: true,
      screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
    },
  };
}

/* ---------------------------------------------------------------- */
/* Store helpers                                                      */
/* ---------------------------------------------------------------- */

const self = () => store().getState().voiceSelf;

function setSelf(patch: Partial<ReturnType<typeof self>>) {
  store().setState((s) => {
    Object.assign(s.voiceSelf, patch);
  });
}

/** Everything back to "not connected" (keeps mute / deafen like Discord). */
function resetConnection() {
  target = null;
  movedTo = null;
  cameraSeq++;
  screenSeq++;
  if (!pageLeaving) forgetVoiceResume();
  stopRtt();
  stopLocalPreview();
  setSpeaking([]);
  useVoice.setState({ ...INITIAL_LIVE });
  resetSelfReport();
  store().setState((s) => {
    const me = s.meId;
    const ch = s.voiceSelf.channelId;
    if (ch && s.voice[ch]) s.voice[ch] = s.voice[ch].filter((p) => p.userId !== me);
    if (s.call && s.voice[s.call.dmId]) s.voice[s.call.dmId] = s.voice[s.call.dmId].filter((p) => p.userId !== me);
    s.voiceSelf.channelId = null;
    s.voiceSelf.camera = false;
    s.voiceSelf.screen = false;
    s.call = null;
  });
}

const qualityOf = (q: ConnectionQuality): Quality =>
  q === ConnectionQuality.Excellent ? 'excellent' : q === ConnectionQuality.Good ? 'good' : q === ConnectionQuality.Poor ? 'poor' : q === ConnectionQuality.Lost ? 'lost' : 'unknown';

function syncPeer(p: Participant) {
  const cam = p.getTrackPublication(Track.Source.Camera);
  const scr = p.getTrackPublication(Track.Source.ScreenShare);
  const mic = p.getTrackPublication(Track.Source.Microphone);
  patchPeer(p.identity, {
    camera: cam?.track && !cam.isMuted ? cam.track : null,
    screen: scr?.track && !scr.isMuted ? scr.track : null,
    screenAudio: !!p.getTrackPublication(Track.Source.ScreenShareAudio),
    micOff: !mic || mic.isMuted,
    quality: qualityOf(p.connectionQuality),
  });
}

function syncAll(r: Room) {
  syncPeer(r.localParticipant);
  for (const p of r.remoteParticipants.values()) syncPeer(p);
}

/* ---------------------------------------------------------------- */
/* Playback: volumes, deafen, speaker                                 */
/* ---------------------------------------------------------------- */

const audioBox = () => {
  let el = document.getElementById('onyx-voice-audio');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onyx-voice-audio';
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
};

/** Applies personal volumes, "mute for me", the master volume and deafen to everyone. */
export function applyVolumes() {
  const r = room;
  if (!r) return;
  const deaf = self().deafened || useVoice.getState().serverDeaf;
  const master = Math.max(0, settings().outputVolume / 100);
  const max = support.volumeBoost ? 4 : 1;
  for (const p of r.remoteParticipants.values()) {
    const voice = deaf || isLocallyMuted(p.identity) ? 0 : Math.min(max, volumeOf(p.identity) * master);
    const stream = deaf ? 0 : Math.min(max, streamVolumeOf(p.identity) * master);
    p.setVolume(voice, Track.Source.Microphone);
    p.setVolume(stream, Track.Source.ScreenShareAudio);
    // Deafened: the server stops sending audio at all (saves data, nothing can leak through).
    for (const pub of p.audioTrackPublications.values()) pub.setEnabled(!deaf);
  }
}

function onTrackSubscribed(track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) {
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach();
    audioBox().appendChild(el);
    applyVolumes();
  }
  syncPeer(p);
}

function onTrackUnsubscribed(track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) {
  if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
  syncPeer(p);
}

/* ---------------------------------------------------------------- */
/* Microphone state                                                   */
/* ---------------------------------------------------------------- */

/** Should the microphone send right now? (A server mute arrives as missing "speak" grant.) */
function micShouldSend() {
  const v = useVoice.getState();
  const me = self();
  if (me.muted || me.deafened || !v.grants.speak) return false;
  if (settings().inputMode === 'ptt' && !v.pttActive) return false;
  return true;
}

/** Opens the microphone the first time it is needed and mutes / unmutes it after that. */
export async function applyMic() {
  const r = room;
  if (useVoice.getState().mode === 'local') {
    const seq = joinSeq;
    if (micShouldSend() && !localTracks.mic) await startLocalMic();
    if (seq !== joinSeq || !target || useVoice.getState().mode !== 'local') return;
    const send = micShouldSend();
    if (localTracks.mic) localTracks.mic.mediaStreamTrack.enabled = send;
    patchPeer(meId(), { micOff: !send });
  } else if (r) {
    // Mute/PTT/device events can overlap while getUserMedia is waiting. Reconcile
    // the latest intent serially for this room, never for its replacement.
    const work = (micWork.get(r) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (room !== r) return;
    const send = micShouldSend();
    const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone);
    // With push-to-talk the microphone is opened in advance (muted), so the key reacts at once.
    const wanted = send || (settings().inputMode === 'ptt' && !self().muted && !self().deafened && useVoice.getState().grants.speak);
    if (!pub && !wanted) return;
    try {
      if (!pub) {
        const capture = audioCapture();
        await r.localParticipant.setMicrophoneEnabled(true, capture);
        if (room !== r) return;
        const track = r.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined;
        if (track && JSON.stringify(capture) !== JSON.stringify(audioCapture())) await track.restartTrack(audioCapture());
        if (room !== r) return;
        await applyGain(track);
        if (!micShouldSend()) await r.localParticipant.setMicrophoneEnabled(false);
      } else if (pub.isMuted === send) {
        await r.localParticipant.setMicrophoneEnabled(send);
      }
      if (room === r) useVoice.setState({ micBlocked: false });
    } catch (e) {
      if (room === r) micFailed(e);
    }
    if (room === r) syncPeer(r.localParticipant);
    });
    micWork.set(r, work);
    await work;
  }
}

function micFailed(e: unknown) {
  console.warn('[voice] microphone failed', e);
  useVoice.setState({ micBlocked: true });
  if (!self().muted) setSelf({ muted: true });
  toast({ tone: 'danger', title: t('Microphone unavailable'), body: mediaErrorText(e, 'mic') ?? undefined });
}

/** Called by the store after mute / deafen changed. */
export function selfFlagsChanged(changed: 'mute' | 'deafen') {
  const me = self();
  if (!target) return;
  sound(changed === 'mute' ? (me.muted ? 'mute' : 'unmute') : me.deafened ? 'deafen' : 'undeafen');
  void applyMic();
  applyVolumes();
  if (useVoice.getState().mode === 'cloud') reportSelf(me.muted, me.deafened);
  rememberCurrentChannel();
}

/** Push-to-talk key held / released. */
export function setPtt(active: boolean) {
  if (useVoice.getState().pttActive === active) return;
  useVoice.setState({ pttActive: active });
  void applyMic();
}

/* ---------------------------------------------------------------- */
/* Camera and screen                                                  */
/* ---------------------------------------------------------------- */

export async function setCamera(on: boolean): Promise<boolean> {
  const v = useVoice.getState();
  if (on && !v.grants.video) {
    toast({ title: t('Video isn’t allowed here'), body: t('The “Video” permission is missing in this channel.') });
    return false;
  }
  if (v.mode === 'local') return setLocalCamera(on);
  const r = room;
  if (!r || v.status !== 'connected') return false;
  const operation = ++cameraSeq;
  setSelf({ camera: on });
  try {
    await r.localParticipant.setCameraEnabled(on, videoCapture(), { simulcast: true, videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360] });
    if (room !== r) return false;
    if (operation !== cameraSeq) {
      if (!self().camera) await r.localParticipant.setCameraEnabled(false);
      return false;
    }
    syncPeer(r.localParticipant);
    return true;
  } catch (e) {
    if (room !== r || operation !== cameraSeq) return false;
    setSelf({ camera: false });
    syncPeer(r.localParticipant);
    const text = mediaErrorText(e, 'camera');
    if (text) toast({ tone: 'danger', title: t('Camera unavailable'), body: text });
    return false;
  }
}

export interface ShareOptions {
  /** Smooth (30 fps, 720p) for games and videos instead of sharp (15 fps, 1080p) for text. */
  motion?: boolean;
  /** Include sound where the browser can. */
  audio?: boolean;
}

export async function setScreenShare(on: boolean, opts: ShareOptions = {}): Promise<boolean> {
  const v = useVoice.getState();
  if (on && v.status !== 'connected') return false;
  if (on && !v.grants.screen) {
    toast({ title: t('Screen sharing isn’t allowed here'), body: t('The “Share screen” permission is missing in this channel.') });
    return false;
  }
  const issue = on ? screenCaptureUnavailableReason() : null;
  if (issue) {
    useUI.getState().openModal({ type: 'screenShareHelp', issue });
    return false;
  }
  if (v.mode === 'local') return setLocalScreen(on, opts);
  const r = room;
  if (!r || v.status !== 'connected') return false;
  const operation = ++screenSeq;
  setSelf({ screen: on });
  const preset = opts.motion ? ScreenSharePresets.h720fps30 : ScreenSharePresets.h1080fps15;
  try {
    await r.localParticipant.setScreenShareEnabled(
      on,
      {
        audio: (opts.audio ?? true) && screenAudio !== 'none',
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        suppressLocalAudioPlayback: true,
        contentHint: opts.motion ? 'motion' : 'detail',
        resolution: preset.resolution,
      },
      { screenShareEncoding: preset.encoding, simulcast: true },
    );
    if (room !== r) return false;
    if (operation !== screenSeq) {
      if (!self().screen) await r.localParticipant.setScreenShareEnabled(false);
      return false;
    }
    syncPeer(r.localParticipant);
    return true;
  } catch (e) {
    if (room !== r || operation !== screenSeq) return false;
    setSelf({ screen: false });
    syncPeer(r.localParticipant);
    screenFailed(e);
    return false;
  }
}

/* ---------------------------------------------------------------- */
/* Devices and processing (settings changed while connected)          */
/* ---------------------------------------------------------------- */

export async function applyDevices(changed: { input?: boolean; output?: boolean; video?: boolean; processing?: boolean; gain?: boolean }) {
  const s = settings();
  if (changed.output) setSoundOutput(s.outputDevice);
  const r = room;
  if (useVoice.getState().mode === 'local') {
    if ((changed.input || changed.processing) && localTracks.mic) {
      await localTracks.mic.restartTrack(audioCapture()).catch(() => {});
    }
    if (changed.video && localTracks.camera) await localTracks.camera.restartTrack(videoCapture()).catch(() => {});
    if (changed.gain || changed.processing) await applyGain(localTracks.mic);
    return;
  }
  if (!r) return;
  const mic = r.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined;
  try {
    if (changed.output) {
      // The SDK currently does not await AudioContext.setSinkId. Await it here
      // first so permission/device failures stay in this error path.
      const mixer = mixers.get(r) as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | undefined;
      await mixer?.setSinkId?.(dev(s.outputDevice) ?? '');
      if (room !== r) return;
      await r.switchActiveDevice('audiooutput', s.outputDevice || 'default');
    }
    if (changed.input || changed.processing) {
      // Restarting with the new constraints keeps the publication (others hear no gap worth mentioning).
      if (mic) await mic.restartTrack(audioCapture());
    }
    if (changed.video) await r.switchActiveDevice('videoinput', s.videoDevice || 'default');
    if (changed.gain || changed.processing) await applyGain(mic);
  } catch (e) {
    if (room !== r) return;
    console.warn('[voice] device change failed', e);
    toast({ tone: 'danger', title: t('Device couldn’t be switched'), body: t('The previous device stays active.') });
  }
}

/** Autoplay was blocked: a click on "Enable sound" calls this. */
export async function startAudio() {
  const r = room;
  await r?.startAudio().catch(() => {});
  if (room === r) useVoice.setState({ audioBlocked: !!r && !r.canPlaybackAudio });
}

/* ---------------------------------------------------------------- */
/* Connection quality and round-trip time                             */
/* ---------------------------------------------------------------- */

function startRtt(r: Room) {
  stopRtt();
  const read = () => {
    if (room !== r) return;
    const rtt = (r.engine as unknown as { client?: { rtt?: number } } | undefined)?.client?.rtt;
    useVoice.setState({ rtt: typeof rtt === 'number' && rtt > 0 ? Math.round(rtt) : null });
  };
  read();
  rttTimer = setInterval(read, 4000);
}

function stopRtt() {
  if (rttTimer) clearInterval(rttTimer);
  rttTimer = null;
}

function stopReconnectWatchdog() {
  if (reconnectWatchdog) clearTimeout(reconnectWatchdog);
  reconnectWatchdog = null;
}

/** A signaling resume can stall without a final Disconnected event. Bound it,
 * close the old room, and obtain a fresh, server-authorized connection. */
function reconnecting(r: Room) {
  useVoice.setState({ status: 'reconnecting' });
  if (reconnectWatchdog) return;
  reconnectWatchdog = setTimeout(() => {
    reconnectWatchdog = null;
    if (room !== r || !target || useVoice.getState().status !== 'reconnecting') return;
    if (retries >= 2) {
      void leave({ silent: true });
      toast({ tone: 'danger', title: t('Voice connection lost'), body: t('Check your internet connection and join again.') });
      return;
    }
    retries++;
    if (target.kind === 'channel') void joinChannel(target.id, { retry: true });
    else void joinCall(target.id, { retry: true });
  }, 12_000);
}

/* ---------------------------------------------------------------- */
/* Connecting                                                         */
/* ---------------------------------------------------------------- */

function bind(r: Room) {
  // Old rooms may still emit during disconnect/capture cleanup. Their events
  // must never mutate peers, playback or UI belonging to a newer room.
  const listen = <A extends unknown[]>(event: RoomEvent, fn: (...args: A) => void) => {
    r.on(event, ((...args: A) => { if (room === r && !leftOnPurpose.has(r)) fn(...args); }) as never);
    return { on: listen };
  };
  listen(RoomEvent.TrackSubscribed, onTrackSubscribed)
    .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
    .on(RoomEvent.TrackMuted, (pub: TrackPublication, p: Participant) => {
      if (p === r.localParticipant && pub.source === Track.Source.Camera) setSelf({ camera: false });
      syncPeer(p);
    })
    .on(RoomEvent.TrackUnmuted, (_pub: TrackPublication, p: Participant) => syncPeer(p))
    .on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (pub.kind === Track.Kind.Audio && self().deafened) pub.setEnabled(false);
      syncPeer(p);
    })
    .on(RoomEvent.TrackUnpublished, (_pub: RemoteTrackPublication, p: RemoteParticipant) => syncPeer(p))
    .on(RoomEvent.LocalTrackPublished, () => syncPeer(r.localParticipant))
    .on(RoomEvent.LocalTrackUnpublished, (pub: TrackPublication) => {
      // The browser's own "Stop sharing" button ends the screen share.
      if (pub.source === Track.Source.ScreenShare) setSelf({ screen: false });
      if (pub.source === Track.Source.Camera) setSelf({ camera: false });
      syncPeer(r.localParticipant);
    })
    .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      syncPeer(p);
      applyVolumes();
      sound('join');
      answered();
    })
    .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      removePeer(p.identity);
      sound('leave');
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => setSpeaking(speakers.map((p) => p.identity)))
    .on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) => patchPeer(p.identity, { quality: qualityOf(q) }))
    .on(RoomEvent.Reconnecting, () => reconnecting(r))
    .on(RoomEvent.SignalReconnecting, () => reconnecting(r))
    .on(RoomEvent.Reconnected, () => {
      stopReconnectWatchdog();
      retries = 0;
      useVoice.setState({ status: 'connected' });
      syncAll(r);
      reportSelf(self().muted, self().deafened, true);
    })
    .on(RoomEvent.AudioPlaybackStatusChanged, () => useVoice.setState({ audioBlocked: !r.canPlaybackAudio }))
    .on(RoomEvent.ParticipantPermissionsChanged, () => {
      // A moderator changed what we may send (server mute) – reflect it.
      const perm = r.localParticipant.permissions;
      if (!perm) return;
      const sources = perm.canPublishSources ?? [];
      const allows = (src: number) => perm.canPublish && (sources.length === 0 || sources.includes(src));
      // TrackSource enum of the protocol: 1 camera, 2 microphone, 3 screen share.
      useVoice.setState({ grants: { speak: allows(2), video: allows(1), screen: allows(3) }, serverMute: !allows(2) && useVoice.getState().serverMute, serverDeaf: !perm.canSubscribe });
      if (!allows(1) && self().camera) setSelf({ camera: false });
      if (!allows(3) && self().screen) setSelf({ screen: false });
      syncPeer(r.localParticipant);
      // Unmuted by a moderator: open the microphone again if we are not muted ourselves.
      void applyMic();
      applyVolumes();
    })
    .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => void onDisconnected(r, reason));
}

/** Someone else is in the call: it no longer rings, the timer counts from now. */
function answered() {
  const call = store().getState().call;
  if (!call || call.state === 'connected') return;
  store().setState((s) => {
    if (s.call) s.call = { ...s.call, state: 'connected', startedAt: Date.now() };
  });
}

async function onDisconnected(r: Room, reason?: DisconnectReason) {
  if (room !== r || leftOnPurpose.has(r)) return;
  room = null;
  closeMixer(r);
  stopReconnectWatchdog();
  stopRtt();
  audioBox().replaceChildren();
  r.removeAllListeners();
  const was = target;
  if (!was) return;

  const say = (title: string, body?: string) => toast({ title, body });
  if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
    // Moved by a moderator or joined on another device? The signal for that can arrive a moment after the removal.
    useVoice.setState({ status: 'reconnecting' });
    await new Promise((res) => setTimeout(res, 800));
    if (target !== was) return;
    if (movedTo) {
      const dest = movedTo;
      movedTo = null;
      await joinChannel(dest, { quietSwitch: true });
      return;
    }
    const roomName = was.kind === 'channel' ? `channel:${was.id}` : `dm:${was.id}`;
    resetConnection();
    sound('leave');
    if (lastElsewhere?.room === roomName && Date.now() - lastElsewhere.at < 10_000) say(t('Connected on another device'), t('You joined a voice channel or call from somewhere else.'));
    else say(t('You were disconnected'), t('A moderator removed you from the voice channel, or you lost access.'));
    return;
  }
  switch (reason) {
    case DisconnectReason.DUPLICATE_IDENTITY:
      resetConnection();
      say(t('Connected on another device'), t('You joined this voice channel or call from somewhere else.'));
      return;
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      resetConnection();
      sound('leave');
      if (was.kind === 'channel') say(t('The voice channel was closed'));
      return;
    default:
      break;
  }
  // Network trouble the built-in reconnect couldn't fix: try a fresh connection twice.
  if (retries < 2) {
    retries++;
    useVoice.setState({ status: 'reconnecting' });
    await new Promise((res) => setTimeout(res, retries * 1500));
    if (target !== was) return;
    if (was.kind === 'channel') await joinChannel(was.id, { retry: true });
    else await joinCall(was.id, { video: false, retry: true });
    return;
  }
  resetConnection();
  sound('leave');
  toast({ tone: 'danger', title: t('Voice connection lost'), body: t('Check your internet connection and join again.') });
}

async function disconnectRoom() {
  const r = room;
  room = null;
  stopReconnectWatchdog();
  cameraSeq++;
  screenSeq++;
  stopRtt();
  audioBox().replaceChildren();
  stopLocalPreview();
  store().setState((s) => {
    for (const id of Object.keys(s.voice)) s.voice[id] = s.voice[id].filter((p) => p.userId !== s.meId);
  });
  if (r) {
    leftOnPurpose.add(r);
    await r.disconnect().catch(() => {});
    closeMixer(r);
    r.removeAllListeners();
  }
}

interface JoinOpts {
  retry?: boolean;
  /** Moved by a moderator: no "join" toasts, no confirmation. */
  quietSwitch?: boolean;
}

async function connect(next: Target, seq: number, res: JoinResponse) {
  const mixer = support.volumeBoost ? new AudioContext() : undefined;
  const r = new Room(roomOptions(mixer));
  if (new URL(res.url).hostname.endsWith('.livekit.cloud')) liveKitCloudRooms.add(r);
  if (mixer) mixers.set(r, mixer);
  bind(r);
  room = r;
  try {
    await r.connect(res.url, res.token, { autoSubscribe: true });
  } catch (e) {
    if (room === r) room = null;
    leftOnPurpose.add(r);
    await r.disconnect().catch(() => {});
    closeMixer(r);
    r.removeAllListeners();
    throw e;
  }
  if (seq !== joinSeq) {
    leftOnPurpose.add(r);
    await r.disconnect().catch(() => {});
    closeMixer(r);
    r.removeAllListeners();
    return;
  }
  retries = 0;
  useVoice.setState({
    status: 'connected',
    mode: 'cloud',
    room: res.room,
    grants: { speak: res.canSpeak, video: res.canVideo, screen: res.canScreen },
    serverMute: res.serverMute,
    serverDeaf: res.serverDeaf,
    audioBlocked: !r.canPlaybackAudio,
  });
  syncAll(r);
  if (r.remoteParticipants.size) answered();
  startRtt(r);
  sound('join');
  setSoundOutput(settings().outputDevice);
  await applyMic();
  if (seq !== joinSeq || room !== r) return;
  applyVolumes();
  if (next.kind === 'dm' && next.video && res.canVideo) await setCamera(true);
  if (seq !== joinSeq || room !== r) return;
  reportSelf(self().muted, self().deafened, true);
  rememberCurrentChannel();
}

/** Joins a voice channel (leaves any other connection first). */
export async function joinChannel(channelId: ID, opts: JoinOpts = {}) {
  if (CLOUD && !support.rtc) { toast({ tone: 'danger', title: t('Couldn’t join the voice channel'), body: mediaNote() ?? undefined }); return; }
  if (!opts.retry && target?.kind === 'channel' && target.id === channelId && useVoice.getState().status !== 'idle') return;
  const seq = ++joinSeq;
  const next: Target = { kind: 'channel', id: channelId };
  if (!opts.retry || room) {
    await disconnectRoom();
    if (seq !== joinSeq) return;
    if (!opts.retry) retries = 0;
  }
  target = next;
  store().setState((s) => {
    s.call = null;
    s.voiceSelf.channelId = channelId;
    s.voiceSelf.joinedAt = Date.now();
    s.voiceSelf.camera = false;
    s.voiceSelf.screen = false;
  });
  useVoice.setState({ ...INITIAL_LIVE, status: opts.retry ? 'reconnecting' : 'connecting', mode: CLOUD ? 'cloud' : 'local', room: `channel:${channelId}` });
  if (!CLOUD) return startLocalPreview(channelId);
  try {
    const res = await requestJoin(channelId);
    if (seq !== joinSeq) return;
    await connect(next, seq, res);
  } catch (e) {
    if (seq !== joinSeq) return;
    console.warn('[voice] join failed', e);
    resetConnection();
    toast({ tone: 'danger', title: t('Couldn’t join the voice channel'), body: e instanceof VoiceError ? voiceErrorText(e) : t('The connection to the voice server failed. Try again in a moment.') });
  }
}

/** Starts a call in a DM / group or joins the one that is running. */
export async function joinCall(dmId: ID, opts: { video?: boolean; retry?: boolean } = {}) {
  if (!CLOUD) return;
  if (!support.rtc) { toast({ tone: 'danger', title: t('Call failed'), body: mediaNote() ?? undefined }); return; }
  if (!opts.retry && target?.kind === 'dm' && target.id === dmId && useVoice.getState().status !== 'idle') return;
  const seq = ++joinSeq;
  const next: Target = { kind: 'dm', id: dmId, video: !!opts.video };
  if (!opts.retry || room) {
    await disconnectRoom();
    if (seq !== joinSeq) return;
    if (!opts.retry) retries = 0;
  }
  target = next;
  store().setState((s) => {
    s.voiceSelf.channelId = null;
    s.voiceSelf.camera = false;
    s.voiceSelf.screen = false;
    s.voiceSelf.joinedAt = Date.now();
    if (!opts.retry || !s.call) s.call = { dmId, callId: null, state: 'connecting', startedAt: Date.now(), video: !!opts.video };
  });
  useVoice.setState({ ...INITIAL_LIVE, status: opts.retry ? 'reconnecting' : 'connecting', mode: 'cloud', room: `dm:${dmId}` });
  try {
    const res = await requestJoin(dmId, !!opts.video);
    if (seq !== joinSeq) return;
    store().setState((s) => {
      if (s.call?.dmId === dmId) s.call = { ...s.call, callId: res.callId, state: res.callStarted ? 'ringing' : 'connected', startedAt: Date.now() };
    });
    await connect(next, seq, res);
  } catch (e) {
    if (seq !== joinSeq) return;
    console.warn('[voice] call failed', e);
    resetConnection();
    toast({ tone: 'danger', title: t('Call failed'), body: e instanceof VoiceError ? voiceErrorText(e) : t('The connection to the voice server failed. Try again in a moment.') });
  }
}

/** Leaves the voice channel or hangs up. */
export async function leave(opts: { silent?: boolean } = {}) {
  if (!target && useVoice.getState().status === 'idle') return;
  const seq = ++joinSeq;
  const wasConnected = useVoice.getState().status !== 'idle';
  await disconnectRoom();
  if (seq !== joinSeq) return;
  resetConnection();
  if (wasConnected && !opts.silent) sound('leave');
}

/** A moderator moved us (signal "move"): switch to the new channel. */
export function onMoved(channelId: ID) {
  if (target?.kind !== 'channel' || target.id === channelId) return;
  movedTo = channelId;
  const seq = joinSeq;
  const name = store().getState().channels[channelId]?.name ?? '';
  toast({ title: t('You were moved to {name}', { name }) });
  // If the removal from the old room arrives first, onDisconnected switches; otherwise do it now.
  window.setTimeout(() => {
    if (movedTo !== channelId || seq !== joinSeq || !target) return;
    movedTo = null;
    void joinChannel(channelId, { quietSwitch: true });
  }, 400);
}

/** The account joined a voice room on another device (signal "elsewhere"). */
export function onElsewhere(roomName: string) {
  lastElsewhere = { room: roomName, at: Date.now() };
  const v = useVoice.getState();
  // The HTTP private broadcast reaches every tab of the account, including
  // the tab currently requesting this very token. Only an existing transport
  // can be the superseded device; a new join must ignore its own signal.
  if (!roomName || v.room !== roomName || !room || v.status === 'idle' || v.status === 'connecting') return;
  // The joining device is not this one if we are still connected to the room it names.
  void leave({ silent: true }).then(() => toast({ title: t('Connected on another device'), body: t('You joined a voice channel or call from somewhere else.') }));
}

export const isConnectedTo = (kind: 'channel' | 'dm', id: ID) => target?.kind === kind && target.id === id;
export const currentRoom = () => room;

function rememberCurrentChannel() {
  if (!CLOUD || target?.kind !== 'channel' || useVoice.getState().status !== 'connected') return;
  saveVoiceResume({ userId: meId(), channelId: target.id, muted: self().muted, deafened: self().deafened });
}

/** One attempt after the account/structure is loaded; no stored token or camera state. */
export async function restorePreviousChannel() {
  if (!CLOUD || !meId() || target || resumedFor.has(meId())) return;
  resumedFor.add(meId());
  const saved = readVoiceResume(meId());
  if (!saved) return;
  const s = store().getState();
  const ch = s.channels[saved.channelId];
  const server = ch ? s.servers[ch.serverId] : undefined;
  if (!ch || ch.type !== 'voice' || !server || !channelPermissions(subjectFor(server, s.meId, null, s.meId), ch, categoryOf(server, ch)).has('connect')) {
    forgetVoiceResume(); return;
  }
  setSelf({ muted: saved.muted || saved.deafened, deafened: saved.deafened });
  await joinChannel(ch.id);
}

/* ---------------------------------------------------------------- */
/* Demo: local preview (nothing leaves this device)                   */
/* ---------------------------------------------------------------- */

const localTracks: { mic?: LocalAudioTrack; camera?: LocalVideoTrack; screen?: LocalTrack[] } = {};
let localAnalyser: { stop: () => void } | null = null;
let localMicPending: { seq: number; work: Promise<void> } | null = null;

/** The demo's own channel permissions (same rules as the server would apply). */
function localGrants(channelId: ID) {
  const s = store().getState();
  const channel = s.channels[channelId];
  const server = channel ? s.servers[channel.serverId] : undefined;
  if (!channel || !server) return { speak: true, video: true, screen: true };
  const perms = channelPermissions(subjectFor(server, s.meId, s.viewAs, s.meId), channel, categoryOf(server, channel));
  return { speak: perms.has('speak'), video: perms.has('video'), screen: perms.has('screenShare') };
}

function startLocalPreview(channelId: ID) {
  useVoice.setState({ status: 'connected', mode: 'local', grants: localGrants(channelId) });
  patchPeer(meId(), { quality: 'excellent', micOff: true });
  store().setState((s) => {
    const list = (s.voice[channelId] ??= []);
    if (!list.some((p) => p.userId === s.meId)) list.push({ userId: s.meId, joinedAt: Date.now(), muted: s.voiceSelf.muted, deafened: s.voiceSelf.deafened });
  });
  sound('join');
  void applyMic();
}

async function startLocalMic() {
  if (localTracks.mic) return;
  const seq = joinSeq;
  if (localMicPending?.seq === seq) return localMicPending.work;
  const work = (async () => {
  try {
    const track = await createLocalAudioTrack(audioCapture());
    if (seq !== joinSeq || !target || useVoice.getState().mode !== 'local') { track.stop(); return; }
    localTracks.mic = track;
    const { calculateVolume, cleanup } = createAudioAnalyser(track, { cloneTrack: false });
    let hold = 0;
    const timer = window.setInterval(() => {
      const loud = calculateVolume() > 0.04 && localTracks.mic?.mediaStreamTrack.enabled;
      hold = loud ? 4 : Math.max(0, hold - 1);
      setSpeaking(hold > 0 ? [meId()] : []);
    }, 100);
    localAnalyser = {
      stop: () => {
        window.clearInterval(timer);
        void cleanup();
      },
    };
    useVoice.setState({ micBlocked: false });
  } catch (e) {
    if (seq === joinSeq && target) micFailed(e);
  }
  })();
  localMicPending = { seq, work };
  try { await work; } finally { if (localMicPending?.work === work) localMicPending = null; }
}

async function setLocalCamera(on: boolean): Promise<boolean> {
  const operation = ++cameraSeq;
  const seq = joinSeq;
  setSelf({ camera: on });
  if (!on) {
    localTracks.camera?.stop();
    localTracks.camera = undefined;
    setSelf({ camera: false });
    patchPeer(meId(), { camera: null });
    return true;
  }
  try {
    const track = await createLocalVideoTrack(videoCapture());
    if (seq !== joinSeq || operation !== cameraSeq || !target) { track.stop(); return false; }
    localTracks.camera?.stop();
    localTracks.camera = track;
    setSelf({ camera: true });
    patchPeer(meId(), { camera: track });
    return true;
  } catch (e) {
    if (seq !== joinSeq || operation !== cameraSeq || !target) return false;
    setSelf({ camera: false });
    const text = mediaErrorText(e, 'camera');
    if (text) toast({ tone: 'danger', title: t('Camera unavailable'), body: text });
    return false;
  }
}

async function setLocalScreen(on: boolean, opts: ShareOptions): Promise<boolean> {
  const operation = ++screenSeq;
  const seq = joinSeq;
  localTracks.screen?.forEach((tr) => tr.stop());
  localTracks.screen = undefined;
  patchPeer(meId(), { screen: null, screenAudio: false });
  setSelf({ screen: false });
  if (!on) return true;
  try {
    const tracks = await createLocalScreenTracks({ audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', contentHint: opts.motion ? 'motion' : 'detail' });
    if (seq !== joinSeq || operation !== screenSeq || !target) { tracks.forEach((tr) => tr.stop()); return false; }
    localTracks.screen = tracks;
    const video = tracks.find((tr) => tr.kind === Track.Kind.Video) ?? null;
    video?.mediaStreamTrack.addEventListener('ended', () => { if (localTracks.screen === tracks) void setLocalScreen(false, {}); }, { once: true });
    setSelf({ screen: true });
    patchPeer(meId(), { screen: video });
    return true;
  } catch (e) {
    if (seq !== joinSeq || operation !== screenSeq || !target) return false;
    screenFailed(e);
    return false;
  }
}

function stopLocalPreview() {
  localAnalyser?.stop();
  localAnalyser = null;
  localTracks.mic?.stop();
  localTracks.camera?.stop();
  localTracks.screen?.forEach((tr) => tr.stop());
  localTracks.mic = undefined;
  localTracks.camera = undefined;
  localTracks.screen = undefined;
}
