import { isNotFound, publishSources, type roomService } from './livekit.ts';

export interface VoiceTarget { identity: string; room: string; sid: string; version?: string }
export interface PermissionSnapshot extends VoiceTarget {
  action: 'ignore' | 'evict' | 'permissions';
  version?: string;
  can_speak?: boolean;
  can_video?: boolean;
  can_screen?: boolean;
  can_subscribe?: boolean;
}
type SnapshotReader = (targets: VoiceTarget[]) => Promise<PermissionSnapshot[]>;

/** Jobs carry identities, never a permissions snapshot. Re-read after applying:
 * concurrent/out-of-order jobs must converge on the newest database revision.
 * Check LiveKit's SID before touching an identity that may have reconnected.
 */
export async function applyLivePermissions(targets: VoiceTarget[], read: SnapshotReader, rooms: ReturnType<typeof roomService>) {
  const initial = await read(targets);
  let index = 0;
  async function enforce(first: PermissionSnapshot) {
    let current = first;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (current.action === 'ignore') return;
      try {
        const participant = await rooms.getParticipant(current.room, current.identity);
        if (!participant || participant.sid !== current.sid) return;
        if (current.action === 'evict') { await rooms.removeParticipant(current.room, current.identity); return; }
        await rooms.updatePermission(current.room, current.identity, { canSubscribe: current.can_subscribe === true, canPublishSources: publishSources(current) });
        const after = await rooms.getParticipant(current.room, current.identity);
        if (!after) return;
        if (after.sid !== current.sid) {
          // RoomService addresses identities, not SIDs. A reconnect during the
          // request must not inherit a stale grant written by this job.
          const replacement = { ...current, sid: after.sid };
          const [fresh] = await read([replacement]);
          if (!fresh || fresh.action === 'ignore') {
            await rooms.removeParticipant(current.room, current.identity);
            return;
          }
          current = fresh;
          continue;
        }
        const [next] = await read([current]);
        if (!next || next.action === 'ignore' || (next.action === 'permissions' && next.version === current.version)) return;
        current = next;
      } catch (error) {
        if (isNotFound(error)) return;
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        const [next] = await read([current]);
        if (!next) return;
        current = next;
      }
    }
    // Constant permission churn: disconnect instead of leaving broader grants active.
    const participant = await rooms.getParticipant(current.room, current.identity);
    if (participant?.sid === current.sid) await rooms.removeParticipant(current.room, current.identity);
  }
  await Promise.all(Array.from({ length: Math.min(8, initial.length) }, async () => {
    while (index < initial.length) await enforce(initial[index++]);
  }));
}
