/** Only a destination and self mute flags; never tokens, secrets or media. */
export interface VoiceResume { userId: string; channelId: string; muted: boolean; deafened: boolean }
const KEY = 'onyx-voice-resume';
export function saveVoiceResume(value: VoiceResume) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage may be blocked */ }
}
export function forgetVoiceResume() {
  try { localStorage.removeItem(KEY); } catch { /* storage may be blocked */ }
}
export function readVoiceResume(userId: string): VoiceResume | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<VoiceResume> | null;
    if (value?.userId === userId && typeof value.channelId === 'string' && typeof value.muted === 'boolean' && typeof value.deafened === 'boolean') return value as VoiceResume;
  } catch { /* invalid or blocked storage */ }
  return null;
}
