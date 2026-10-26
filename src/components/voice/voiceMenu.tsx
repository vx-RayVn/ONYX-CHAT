/**
 * Voice entries of the user menu: volume and "mute for me" for people in the
 * own voice channel or call, and – with the rights for it – server mute,
 * server deafen, disconnect and move. The server checks rights and role
 * order again; the menu only hides what would be refused anyway.
 */
import { ArrowRightLeft, HeadphoneOff, MicOff, PhoneOff } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { toast } from '../../store/ui';
import { can } from '../../store/selectors';
import { memberBelow } from '../../lib/permissions';
import { t } from '../../i18n';
import { CLOUD } from '../../backend/config';
import { requestModerate, type ModerateOp } from '../../backend/voice';
import { applyVolumes, voiceErrorText } from '../../voice/engine';
import { useVoice, useVolumes } from '../../voice/state';
import { support } from '../../voice/support';
import type { MenuSpec } from '../ui/Menu';

/** Where a person is in voice (channel or DM id), from what the server reported. */
export function voiceScopeOf(userId: ID): ID | null {
  const s = useStore.getState();
  for (const [id, list] of Object.entries(s.voice)) if (list.some((p) => p.userId === userId)) return id;
  return null;
}

export function VolumeSlider({ userId, stream }: { userId: ID; stream?: boolean }) {
  const value = useVolumes((v) => (stream ? v.stream[userId] : v.voice[userId]) ?? 1);
  const max = support.volumeBoost ? 200 : 100;
  const pct = Math.round(value * 100);
  return (
    <div className="menu-slider" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="menu-slider-label">
        {stream ? t('Stream volume') : t('User volume')}
        <b className="tnum">{pct} %</b>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={5}
        value={Math.min(pct, max)}
        aria-label={stream ? t('Stream volume') : t('User volume')}
        onChange={(e) => {
          const v = Number(e.target.value) / 100;
          useVolumes.setState((s) => (stream ? { stream: { ...s.stream, [userId]: v } } : { voice: { ...s.voice, [userId]: v } }));
          applyVolumes();
        }}
      />
    </div>
  );
}

async function moderate(userId: ID, op: ModerateOp, dest?: ID) {
  try {
    await requestModerate(userId, op, dest);
  } catch (e) {
    toast({ tone: 'danger', title: t('That didn’t work'), body: voiceErrorText(e) });
  }
}

export function voiceMenuEntries(userId: ID, serverId?: ID): MenuSpec {
  const s = useStore.getState();
  const isMe = userId === s.meId;
  const scope = voiceScopeOf(userId);
  const myScope = s.voiceSelf.channelId ?? s.call?.dmId ?? null;
  const live = useVoice.getState();
  const inMyRoom = !!scope && scope === myScope && live.status !== 'idle';
  const out: MenuSpec = [];

  if (inMyRoom && !isMe) {
    const locallyMuted = !!useVolumes.getState().muted[userId];
    out.push(
      { type: 'separator' },
      { type: 'custom', render: <VolumeSlider userId={userId} /> },
      live.peers[userId]?.screenAudio && { type: 'custom', render: <VolumeSlider userId={userId} stream /> },
      {
        type: 'check',
        label: t('Mute for me'),
        checked: locallyMuted,
        keepOpen: true,
        onSelect: () => {
          useVolumes.setState((v) => ({ muted: { ...v.muted, [userId]: !locallyMuted } }));
          applyVolumes();
        },
      },
    );
  }

  // Moderation: only for server voice channels, only in cloud mode (the server enforces it).
  const channel = scope ? s.channels[scope] : undefined;
  const server = channel ? s.servers[channel.serverId] : undefined;
  if (!CLOUD || !channel || !server || (serverId && serverId !== server.id)) return out;
  const p = s.voice[channel.id]?.find((x) => x.userId === userId);
  const below = isMe || memberBelow(server, s.meId, userId);
  const canMute = below && can(s, channel.id, 'muteMembers');
  const canDeafen = below && can(s, channel.id, 'deafenMembers');
  const canMove = below && can(s, channel.id, 'moveMembers');
  if (!canMute && !canDeafen && !canMove) return out;

  const destinations = Object.values(s.channels)
    .filter((c) => c.serverId === server.id && c.type === 'voice' && c.id !== channel.id && can(s, c.id, 'connect'))
    .sort((a, b) => a.position - b.position);

  out.push(
    { type: 'separator' },
    canMute && {
      label: p?.serverMuted ? t('Remove server mute') : t('Server mute'),
      icon: <MicOff />,
      onSelect: () => void moderate(userId, p?.serverMuted ? 'unmute' : 'mute'),
    },
    canDeafen && {
      label: p?.serverDeafened ? t('Remove server deafen') : t('Server deafen'),
      icon: <HeadphoneOff />,
      onSelect: () => void moderate(userId, p?.serverDeafened ? 'undeafen' : 'deafen'),
    },
    canMove &&
      destinations.length > 0 && {
        type: 'sub',
        label: t('Move to'),
        icon: <ArrowRightLeft />,
        items: destinations.map((c) => ({ label: c.name, onSelect: () => void moderate(userId, 'move', c.id) })),
      },
    canMove && {
      label: isMe ? t('Disconnect') : t('Disconnect from voice'),
      icon: <PhoneOff />,
      danger: true,
      onSelect: () => void moderate(userId, 'disconnect'),
    },
  );
  return out;
}
