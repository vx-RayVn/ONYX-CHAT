/** Local integration fixture. Imported only behind import.meta.env.DEV in main.tsx.
 * Uses the production engine and views; Playwright supplies short-lived local tokens.
 * No Supabase account, cloud connection, or signing key exists in this page.
 */
import { createRoot } from 'react-dom/client';
import { createAudioAnalyser, Track } from 'livekit-client';
import { buildSeed } from '../data/seed';
import { useStore } from '../store/store';
import { useVoice, useVolumes } from '../voice/state';
import * as engine from '../voice/engine';
import { VoiceView } from '../components/voice/VoiceView';
import { CallPanel } from '../components/voice/CallPanel';
import { VoicePanel } from '../components/voice/VoicePanel';
import { ModalRoot } from '../components/modals/ModalRoot';
import { TooltipProvider } from '../components/ui/Tooltip';
import { Toasts } from '../components/ui/misc';
import { support } from '../voice/support';
import { t } from '../i18n';
import { closeVoiceAudio, playVoiceSound, setSoundOutput } from '../voice/sounds';
import { useLiveSettings } from '../components/voice/VoiceRoot';

export function mountVoiceE2E() {
  const params = new URLSearchParams(location.search);
  const identity = params.get('identity') === 'bob' ? 'bob' : 'alice';
  const seed = buildSeed();
  const server = seed.servers.s_onyx;
  const channel = Object.values(seed.channels).find((c) => c.serverId === server.id && c.type === 'voice')!;
  const second = { ...channel, id: 'e2e-second', name: 'Second' };
  const person = seed.users[seed.meId];
  useStore.setState((s) => {
    Object.assign(s, seed);
    s.meId = identity;
    s.users = { alice: { ...person, id: 'alice', displayName: 'Alice' }, bob: { ...person, id: 'bob', displayName: 'Bob' } };
    s.servers[server.id].ownerId = identity;
    s.channels[second.id] = second;
    s.dms['e2e-call'] = { id: 'e2e-call', type: 'dm', participantIds: ['alice', 'bob'], lastActivityAt: Date.now() };
    s.view = { kind: 'server', serverId: server.id, channelId: channel.id };
    s.voice = {};
    s.settings.language = 'en';
    s.settings.voiceSounds = false;
    s.settings.noiseSuppression = false;
    s.settings.echoCancellation = false;
    s.settings.autoGainControl = false;
  });
  document.title = 'ONYX Voice E2E';
  document.documentElement.dataset.theme = 'graphite';
  const api = {
    join: (id = channel.id) => engine.joinChannel(id),
    call: () => engine.joinCall('e2e-call'),
    leave: () => engine.leave({ silent: true }),
    camera: (on: boolean) => engine.setCamera(on),
    screen: (on: boolean) => engine.setScreenShare(on),
    mute: () => useStore.getState().toggleMute(),
    deafen: () => useStore.getState().toggleDeafen(),
    volume: (id: string, value: number) => {
      useVolumes.setState((s) => ({ voice: { ...s.voice, [id]: value } }));
      engine.applyVolumes();
    },
    output: () => engine.applyDevices({ output: true }),
    processing: async (enhanced: boolean, gain = 100) => {
      useStore.setState((s) => { s.settings.enhancedNoiseSuppression = enhanced; s.settings.noiseSuppression = true; s.settings.micGain = gain; });
      await engine.applyDevices({ processing: true, gain: true });
    },
    restore: () => engine.restorePreviousChannel(),
    roomHandle: () => engine.currentRoom(),
    elsewhere: (name: string) => engine.onElsewhere(name),
    sound: () => { setSoundOutput('default'); playVoiceSound('join', 10); },
    stopSounds: closeVoiceAudio,
    state: () => {
      const r = engine.currentRoom();
      const v = useVoice.getState();
      return {
        status: v.status, room: v.room, grants: v.grants, audioBlocked: v.audioBlocked, noiseFilter: v.noiseFilter,
        self: useStore.getState().voiceSelf, support,
        audioElements: document.querySelectorAll('#onyx-voice-audio audio').length,
        local: [...(r?.localParticipant.trackPublications.values() ?? [])].map((p) => ({ source: p.source, muted: p.isMuted, state: p.track?.mediaStreamTrack.readyState })),
        peers: [...(r?.remoteParticipants.values() ?? [])].map((p) => ({ id: p.identity,
          tracks: [...p.trackPublications.values()].map((pub) => ({ source: pub.source, muted: pub.isMuted, enabled: pub.isEnabled, subscribed: pub.isSubscribed,
            volume: pub.source === Track.Source.Microphone || pub.source === Track.Source.ScreenShareAudio ? p.getVolume(pub.source) : undefined })),
        })),
      };
    },
    level: async (id: string) => {
      const track = engine.currentRoom()?.remoteParticipants.get(id)?.getTrackPublication(Track.Source.Microphone)?.audioTrack;
      if (!track) return 0;
      const analyser = createAudioAnalyser(track, { cloneTrack: false });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const level = analyser.calculateVolume();
      await analyser.cleanup();
      return level;
    },
  };
  // Mirrors VoiceRoot's restore lifecycle without starting cloud subscriptions.
  setTimeout(() => void engine.restorePreviousChannel(), 0);
  (window as unknown as { __onyxVoiceE2E: typeof api }).__onyxVoiceE2E = api;
  function Fixture() {
    const active = useStore((s) => s.voiceSelf.channelId ?? channel.id);
    const call = useStore((s) => s.call);
    return <TooltipProvider><main style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        <button data-testid="join-first" onClick={() => void api.join()}>{t('Join voice channel')}</button>
        <button data-testid="join-second" onClick={() => void api.join(second.id)}>{t('Move to')}</button>
        <button data-testid="call" onClick={() => void api.call()}>{t('Call')}</button>
        <button data-testid="start-screen" onClick={() => void api.screen(true)}>{t('Share screen')}</button>
      </div>
      {params.has('live-settings') && <LiveSettings />}
      {call ? <CallPanel dmId={call.dmId} /> : <VoiceView channelId={active} />}
      {params.has('voice-panel') && <VoicePanel />}
    </main><ModalRoot /><Toasts /></TooltipProvider>;
  }
  createRoot(document.getElementById('root')!).render(<Fixture />);
}

function LiveSettings() { useLiveSettings(); return null; }
