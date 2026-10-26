/** Open-source snapshot: no proprietary SDK/model is included or downloaded. */
import type { AudioProcessorOptions, Room } from 'livekit-client';

export interface KrispNoiseFilterProcessor {
  processedTrack?: MediaStreamTrack;
  init(options: AudioProcessorOptions): Promise<void>;
  destroy(): Promise<void>;
  onPublish(room: Room): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  isEnabled(): boolean;
}
export function isKrispNoiseFilterSupported(): boolean { return false; }
export function KrispNoiseFilter(_options: { quality: string }): KrispNoiseFilterProcessor {
  throw new Error('Proprietary noise filter is not included in the open-source build');
}
