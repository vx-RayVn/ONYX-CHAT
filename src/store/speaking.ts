/**
 * Who is speaking right now in the connected voice channel or call – reported
 * by the SFU (LiveKit), in the demo preview measured on the own microphone.
 * Separate from the main store because it changes several times a second.
 */
import { create } from 'zustand';

interface SpeakingState {
  ids: Set<string>;
}

export const useSpeakingStore = create<SpeakingState>()(() => ({ ids: new Set() }));
export const useIsSpeaking = (userId: string) => useSpeakingStore((s) => s.ids.has(userId));

export function setSpeaking(ids: Iterable<string>) {
  const next = new Set(ids);
  const prev = useSpeakingStore.getState().ids;
  if (next.size === prev.size && [...next].every((id) => prev.has(id))) return;
  useSpeakingStore.setState({ ids: next });
}
