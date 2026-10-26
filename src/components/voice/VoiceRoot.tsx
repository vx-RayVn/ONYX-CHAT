/**
 * Everything around voice that runs in the background, mounted once:
 *
 *  - cloud: listen to "calls:<me>" (ringing, moves, other devices) and to the
 *    voice channels / DM that are on screen; load who is where
 *  - ringback while an own call rings, push-to-talk keys
 *  - apply changed devices, processing and volumes to the running connection
 *  - leave when the channel or conversation disappears
 *  - the incoming call window and the in-app picture-in-picture
 */
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Settings } from '../../types';
import { useStore } from '../../store/store';
import { CLOUD } from '../../backend/config';
import { loadScopeVoice, loadServerVoice, unwatchCalls, unwatchVoiceScopes, watchCalls, watchVoiceScopes } from '../../backend/voice';
import { applyDevices, applyMic, applyVolumes, leave, onElsewhere, onMoved, restorePreviousChannel } from '../../voice/engine';
import { refreshActiveCalls, resetCalls, updateRingback, upsertCall } from '../../voice/calls';
import { configurePtt } from '../../voice/ptt';
import { setSoundOutput, unlockVoiceAudio } from '../../voice/sounds';
import { useVoice, useVolumes } from '../../voice/state';
import { toast } from '../../store/ui';
import { t } from '../../i18n';
import { IncomingCalls } from './IncomingCall';
import { MiniStage } from './MiniStage';
import { refreshVoiceActivity, unwatchVoiceActivity, watchVoiceActivity } from '../../backend/voiceActivity';

const UNANSWERED_MS = 3 * 60_000;

function useCloudVoice() {
  const meId = useStore((s) => s.meId);
  const serverId = useStore((s) => (s.view.kind === 'server' ? s.view.serverId : null));
  const dmId = useStore((s) => (s.view.kind === 'dm' ? s.view.dmId : null));
  const ownChannel = useStore((s) => s.voiceSelf.channelId);
  const ownCall = useStore((s) => s.call?.dmId ?? null);
  const servers = useStore(useShallow((s) => Object.keys(s.servers).sort()));
  const structure = useStore((s) => s.servers);
  useEffect(() => {
    if (!CLOUD || !meId) return;
    watchVoiceActivity(servers);
  }, [meId, servers.join()]);
  useEffect(() => { if (CLOUD && meId) refreshVoiceActivity(); }, [meId, structure]);
  // Voice channels of the open server (ids only, so the effect runs when channels come or go).
  const serverVoice = useStore(
    useShallow((s) =>
      serverId
        ? Object.values(s.channels)
            .filter((c) => c.serverId === serverId && c.type === 'voice')
            .map((c) => c.id)
            .sort()
        : [],
    ),
  );

  // Calls and signals for this account.
  useEffect(() => {
    if (!CLOUD || !meId) return;
    watchCalls(meId, { onCall: upsertCall, onMove: onMoved, onElsewhere, onResubscribed: () => void refreshActiveCalls() });
    void refreshActiveCalls();
    const restore = setTimeout(() => void restorePreviousChannel(), 0);
    return () => {
      clearTimeout(restore);
      unwatchCalls();
      resetCalls();
      void leave({ silent: true });
    };
  }, [meId]);

  // Who is in the voice channels of the open server.
  useEffect(() => {
    if (!CLOUD || !meId || !serverId) return;
    void loadServerVoice(serverId);
  }, [meId, serverId, serverVoice.join()]);

  // Who is in the call of the open DM.
  useEffect(() => {
    if (!CLOUD || !meId || !dmId) return;
    void loadScopeVoice(dmId, true);
  }, [meId, dmId]);

  // Live updates for exactly what is on screen plus the own connection.
  useEffect(() => {
    if (!CLOUD || !meId) return;
    const scopes = new Map<string, boolean>();
    for (const id of serverVoice) scopes.set(id, false);
    if (dmId) scopes.set(dmId, true);
    if (ownChannel) scopes.set(ownChannel, false);
    if (ownCall) scopes.set(ownCall, true);
    watchVoiceScopes([...scopes].map(([id, isDM]) => ({ id, isDM })));
  }, [meId, serverVoice.join(), dmId, ownChannel, ownCall]);

  useEffect(() => () => { unwatchVoiceScopes(); unwatchVoiceActivity(); }, []);
}

/** Settings that change the running connection. */
export function useLiveSettings() {
  useEffect(() => {
    let prev: Settings = useStore.getState().settings;
    setSoundOutput(prev.outputDevice);
    return useStore.subscribe((s) => {
      const next = s.settings;
      if (next === prev) return;
      const p = prev;
      prev = next;
      if (p.outputDevice !== next.outputDevice) setSoundOutput(next.outputDevice);
      configurePtt(next.inputMode === 'ptt' && useVoice.getState().status !== 'idle', next.pttKey, next.pttDelay);
      if (useVoice.getState().status === 'idle') return;
      void applyDevices({
        input: p.inputDevice !== next.inputDevice,
        output: p.outputDevice !== next.outputDevice,
        video: p.videoDevice !== next.videoDevice,
        processing: p.noiseSuppression !== next.noiseSuppression || p.enhancedNoiseSuppression !== next.enhancedNoiseSuppression || p.echoCancellation !== next.echoCancellation || p.autoGainControl !== next.autoGainControl,
        gain: p.micGain !== next.micGain,
      });
      if (p.outputVolume !== next.outputVolume) applyVolumes();
      if (p.inputMode !== next.inputMode) void applyMic();
    });
  }, []);

  // Push-to-talk only while connected.
  const connected = useVoice((v) => v.status !== 'idle');
  useEffect(() => {
    const s = useStore.getState().settings;
    configurePtt(connected && s.inputMode === 'ptt', s.pttKey, s.pttDelay);
  }, [connected]);

  // Volumes changed in another tab of this browser.
  useEffect(() => useVolumes.subscribe(() => applyVolumes()), []);
}

/** Ringback for the own call, and leaving when the channel / conversation is gone. */
function useCallHousekeeping() {
  const callState = useStore((s) => s.call?.state ?? null);
  useEffect(() => updateRingback(callState), [callState]);
  useEffect(() => () => updateRingback(null), []);
  // Nobody answered within 3 minutes: hang up instead of waiting alone (and paying for it).
  useEffect(() => {
    if (callState !== 'ringing') return;
    const timer = setTimeout(() => {
      if (useStore.getState().call?.state !== 'ringing') return;
      void leave();
      toast({ title: t('No answer'), body: t('The call ended because nobody answered.') });
    }, UNANSWERED_MS);
    return () => clearTimeout(timer);
  }, [callState]);

  const gone = useStore((s) => {
    const ch = s.voiceSelf.channelId;
    if (ch && !s.channels[ch]) return true;
    const dm = s.call?.dmId;
    return !!dm && !s.dms[dm];
  });
  useEffect(() => {
    if (gone) void leave();
  }, [gone]);
}

export function VoiceRoot() {
  useCloudVoice();
  useLiveSettings();
  useCallHousekeeping();
  useEffect(unlockVoiceAudio, []);
  return (
    <>
      <IncomingCalls />
      <MiniStage />
    </>
  );
}
