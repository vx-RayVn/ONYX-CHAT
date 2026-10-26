/**
 * Turns what the user typed into stored message content:
 * @username → <@id>, #channel → <#id>, :custom: → <:name:id>, :fire: → 🔥
 * Slash commands are resolved here as well.
 */
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { toast } from '../../store/ui';
import { replaceShortcodes } from '../../lib/emoji';
import { allCustomEmojis } from '../../store/selectors';
import { t, tk } from '../../i18n';

export const SLASH_COMMANDS = [
  { name: 'shrug', args: tk('[message]'), description: tk('Appends ¯\\_(ツ)_/¯ to your message.') },
  { name: 'tableflip', args: tk('[message]'), description: tk('Appends (╯°□°)╯︵ ┻━┻ to your message.') },
  { name: 'unflip', args: tk('[message]'), description: tk('Appends ┬─┬ノ( º _ ºノ) to your message.') },
  { name: 'me', args: tk('<action>'), description: tk('Writes your message as an action (italic).') },
  { name: 'spoiler', args: tk('<message>'), description: tk('Hides your message as a spoiler.') },
  { name: 'nick', args: tk('<nickname>'), description: tk('Changes your nickname in this server.') },
  { name: 'status', args: tk('<text>'), description: tk('Sets your custom status.') },
] as const;

/** Returns null when the command was handled without sending a message. */
export function resolveSlash(text: string, serverId: ID | null): string | null {
  const m = text.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!m) return text;
  const [, cmd, rawArg = ''] = m;
  const arg = rawArg.trim();
  const s = useStore.getState();
  switch (cmd.toLowerCase()) {
    case 'shrug':
      // Stored escaped so the Markdown renderer shows ¯\_(ツ)_/¯ instead of italics.
      return `${arg} ¯\\\\\\_(ツ)\\_/¯`.trim();
    case 'tableflip':
      return `${arg} (╯°□°)╯︵ ┻━┻`.trim();
    case 'unflip':
      return `${arg} ┬─┬ノ( º _ ºノ)`.trim();
    case 'me':
      return arg ? `*${arg}*` : null;
    case 'spoiler':
      return arg ? `||${arg}||` : null;
    case 'nick':
      if (!serverId) {
        toast({ tone: 'info', title: t('/nick only works in servers') });
        return null;
      }
      s.setNickname(serverId, s.meId, arg);
      toast({ title: arg ? t('Nickname changed to “{name}”', { name: arg }) : t('Nickname reset') });
      return null;
    case 'status':
      s.setCustomStatus(arg ? { text: arg } : undefined);
      toast({ title: arg ? t('Status set') : t('Status removed'), body: arg || undefined });
      return null;
    default:
      return text;
  }
}

export function prepareOutgoing(text: string, serverId: ID | null, channelId: ID) {
  const s = useStore.getState();
  const server = serverId ? s.servers[serverId] : undefined;
  const dm = s.dms[channelId];
  const memberIds = server ? Object.keys(server.members) : dm ? dm.participantIds : [];
  const customs = allCustomEmojis(s);

  let out = text;
  // Protect code spans from token replacement.
  const codes: string[] = [];
  out = out.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
    codes.push(m);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out.replace(/(^|[\s(])@([\p{L}\p{N}_.-]{2,32})/gu, (full, pre: string, name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'everyone' || lower === 'here') return full;
    const id = memberIds.find((uid) => {
      const u = s.users[uid];
      return u && (u.username.toLowerCase() === lower || u.displayName.toLowerCase() === lower || server?.members[uid]?.nickname?.toLowerCase() === lower);
    });
    return id ? `${pre}<@${id}>` : full;
  });

  if (server) {
    // @Role → <@&id>; longer names first so “Mod Team” wins over “Mod”. People with the same name win (above).
    const roles = server.roles.filter((r) => !r.isDefault && r.name.trim()).sort((a, b) => b.name.length - a.name.length);
    for (const role of roles) {
      const name = role.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(^|[\\s(])@${name}(?![\\p{L}\\p{N}_])`, 'giu'), (_, pre: string) => `${pre}<@&${role.id}>`);
    }
    out = out.replace(/(^|[\s(])#([\p{L}\p{N}_-]{1,100})/gu, (full, pre: string, name: string) => {
      const c = Object.values(s.channels).find((x) => x.serverId === server.id && x.name.toLowerCase() === name.toLowerCase());
      return c ? `${pre}<#${c.id}>` : full;
    });
  }

  out = out.replace(/(?<!<a?):(\w{2,32}):(?![\w-]*>)/g, (full, name: string) => {
    const ce = customs.find((e) => e.name.toLowerCase() === name.toLowerCase());
    return ce ? `<:${ce.name}:${ce.id}>` : full;
  });
  out = replaceShortcodes(out);

  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  return out;
}
