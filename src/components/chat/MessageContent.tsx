/**
 * Lightweight Markdown renderer for chat messages.
 * Supports **bold**, *italic*, __underline__, ~~strike~~, `code`, ```blocks```,
 * > quotes, # headings, - lists, ||spoilers||, links, mentions and custom emojis.
 */
import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { showMainPane } from '../../store/ui';
import { emojiSrc, memberDisplayName, canSee } from '../../store/selectors';
import { t } from '../../i18n';
import { cn, copyText } from '../../lib/utils';
import { isEmojiOnly } from '../../lib/emoji';
import { UserPopover } from '../profile/UserPopover';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  content: string;
  serverId?: ID | null;
  /** Single-line rendering for previews (replies, inbox, search). */
  inline?: boolean;
  edited?: ReactNode;
}

type Block = { t: 'p'; text: string } | { t: 'code'; lang: string; code: string } | { t: 'quote'; text: string } | { t: 'h'; level: 1 | 2 | 3; text: string } | { t: 'list'; items: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', text: para.join('\n') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*(.*)$/);
    if (fence) {
      flush();
      const code: string[] = [];
      // single-line ```code```
      if (fence[2] && fence[2].endsWith('```')) {
        out.push({ t: 'code', lang: '', code: (fence[1] + ' ' + fence[2].slice(0, -3)).trim() });
        continue;
      }
      if (fence[2]) code.push(fence[2]);
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      out.push({ t: 'code', lang: fence[1], code: code.join('\n') });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      i--;
      out.push({ t: 'quote', text: q.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flush();
      out.push({ t: 'h', level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      i--;
      out.push({ t: 'list', items });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

interface Rule {
  re: RegExp;
  render: (m: RegExpExecArray, key: string, ctx: Ctx) => ReactNode;
}

interface Ctx {
  serverId?: ID | null;
  inline?: boolean;
}

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn('md-spoiler', open && 'is-open')}
      role="button"
      tabIndex={0}
      aria-label={open ? undefined : t('Reveal spoiler')}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
    >
      <span className="md-spoiler-inner">{children}</span>
    </span>
  );
}

function UserMention({ id, serverId }: { id: ID; serverId?: ID | null }) {
  const name = useStore((s) => (s.users[id] ? memberDisplayName(s, id, serverId) : null));
  if (!name) return <span className="mention is-unknown">@{t('unknown')}</span>;
  return (
    <UserPopover userId={id} serverId={serverId ?? undefined} side="right" align="start">
      <span className="mention" role="button" tabIndex={0}>
        @{name}
      </span>
    </UserPopover>
  );
}

/** <@&roleId> – in the role colour; notifies everyone with the role (if the author may mention everyone). */
function RoleMention({ id, serverId }: { id: ID; serverId?: ID | null }) {
  const role = useStore((s) => (serverId ? s.servers[serverId]?.roles.find((r) => r.id === id) : undefined));
  if (!role) return <span className="mention is-unknown">@{t('deleted-role')}</span>;
  return (
    <span className={cn('mention is-role', role.color && 'has-color')} style={role.color ? ({ '--role-color': role.color } as CSSProperties) : undefined}>
      @{role.name}
    </span>
  );
}

function ChannelMention({ id }: { id: ID }) {
  const channel = useStore((s) => s.channels[id]);
  const visible = useStore((s) => canSee(s, id));
  if (!channel) return <span className="mention is-unknown"># {t('deleted-channel')}</span>;
  if (!visible) return <span className="mention is-unknown"># {t('no-access')}</span>;
  return (
    <span
      className="mention"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        const s = useStore.getState();
        if (channel.type === 'voice') s.joinVoice(channel.id);
        s.selectChannel(channel.serverId, channel.id);
        showMainPane();
      }}
    >
      {channel.type === 'voice' ? '🔊 ' : '#'}
      {channel.name}
    </span>
  );
}

function CustomEmoji({ name, id }: { name: string; id: string }) {
  const src = useStore((s) => emojiSrc(s, id));
  if (!src) return <span>:{name}:</span>;
  return (
    <Tooltip
      content={
        <span className="emoji-tip">
          :{name}:<small>{t('Custom emoji · free to use everywhere on ONYX')}</small>
        </span>
      }
    >
      <img className="custom-emoji" src={src} alt={`:${name}:`} draggable={false} />
    </Tooltip>
  );
}

const RULES: Rule[] = [
  { re: /\\([*_~`|\\<>#@:-])/, render: (m) => m[1] },
  {
    re: /`([^`\n]+)`/,
    render: (m, k) => (
      <code key={k} className="md-code">
        {m[1]}
      </code>
    ),
  },
  { re: /\|\|([\s\S]+?)\|\|/, render: (m, k, c) => <Spoiler key={k}>{parseInline(m[1], k, c)}</Spoiler> },
  { re: /\*\*([\s\S]+?)\*\*/, render: (m, k, c) => <strong key={k}>{parseInline(m[1], k, c)}</strong> },
  { re: /__([\s\S]+?)__/, render: (m, k, c) => <u key={k}>{parseInline(m[1], k, c)}</u> },
  { re: /\*([^*\n]+?)\*/, render: (m, k, c) => <em key={k}>{parseInline(m[1], k, c)}</em> },
  { re: /(?<![\p{L}\p{N}])_([^_\n]+?)_(?![\p{L}\p{N}])/u, render: (m, k, c) => <em key={k}>{parseInline(m[1], k, c)}</em> },
  { re: /~~([\s\S]+?)~~/, render: (m, k, c) => <s key={k}>{parseInline(m[1], k, c)}</s> },
  { re: /<@([\w-]+)>/, render: (m, k, c) => <UserMention key={k} id={m[1]} serverId={c.serverId} /> },
  { re: /<@&([\w-]+)>/, render: (m, k, c) => <RoleMention key={k} id={m[1]} serverId={c.serverId} /> },
  { re: /<#([\w-]+)>/, render: (m, k) => <ChannelMention key={k} id={m[1]} /> },
  { re: /<a?:(\w+):([\w-]+)>/, render: (m, k) => <CustomEmoji key={k} name={m[1]} id={m[2]} /> },
  {
    re: /@(everyone|here)\b/,
    render: (m, k) => (
      <span key={k} className="mention is-role">
        @{m[1]}
      </span>
    ),
  },
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    render: (m, k) => (
      <a key={k} href={m[2]} title={m[2]} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
        {m[1]}
      </a>
    ),
  },
  {
    re: /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/,
    render: (m, k) => (
      <a key={k} href={m[0]} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
        {m[0]}
      </a>
    ),
  },
];

function parseInline(text: string, keyPrefix: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length) {
    let best: { idx: number; m: RegExpExecArray; rule: Rule } | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (best === null || m.index < best.idx)) best = { idx: m.index, m, rule };
      if (best?.idx === 0) break;
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.idx > 0) out.push(rest.slice(0, best.idx));
    out.push(best.rule.render(best.m, `${keyPrefix}-${n++}`, ctx));
    rest = rest.slice(best.idx + best.m[0].length);
  }
  return out;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-pre">
      <div className="md-pre-head">
        <span>{lang || t('code')}</span>
        <button
          className="md-pre-copy"
          onClick={(e) => {
            e.stopPropagation();
            copyText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
          aria-label={t('Copy code')}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t('Copied') : t('Copy')}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MessageContent = memo(function MessageContent({ content, serverId, inline, edited }: Props) {
  const ctx: Ctx = { serverId, inline };
  if (inline) {
    const flat = content.replace(/```[\s\S]*?```/g, `[${t('Code')}]`).replace(/\n+/g, ' ');
    return <span className="md md-inline">{parseInline(flat, 'i', ctx)}</span>;
  }
  const jumbo = isEmojiOnly(content);
  const blocks = parseBlocks(content);
  return (
    <div className={cn('md', jumbo && 'is-jumbo')}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        const last = i === blocks.length - 1;
        switch (b.t) {
          case 'code':
            return <CodeBlock key={key} lang={b.lang} code={b.code} />;
          case 'quote':
            return (
              <blockquote key={key} className="md-quote">
                {parseInline(b.text, key, ctx)}
              </blockquote>
            );
          case 'h': {
            const Tag = `h${b.level + 2}` as 'h3' | 'h4' | 'h5';
            return (
              <Tag key={key} className={`md-h md-h${b.level}`}>
                {parseInline(b.text, key, ctx)}
              </Tag>
            );
          }
          case 'list':
            return (
              <ul key={key} className="md-list">
                {b.items.map((it, j) => (
                  <li key={j}>{parseInline(it, `${key}-${j}`, ctx)}</li>
                ))}
              </ul>
            );
          default:
            return (
              <div key={key} className="md-p">
                {parseInline(b.text, key, ctx)}
                {last && edited}
              </div>
            );
        }
      })}
      {blocks.length > 0 && blocks[blocks.length - 1].t !== 'p' && edited}
    </div>
  );
});

/** Converts stored tokens back into editable text. */
export function tokensToText(content: string) {
  const s = useStore.getState();
  return content
    .replace(/<@([\w-]+)>/g, (_, id) => `@${s.users[id]?.username ?? t('unknown')}`)
    .replace(/<@&([\w-]+)>/g, (_, id) => `@${Object.values(s.servers).flatMap((sv) => sv.roles).find((r) => r.id === id)?.name ?? t('unknown')}`)
    .replace(/<#([\w-]+)>/g, (_, id) => `#${s.channels[id]?.name ?? t('channel')}`)
    .replace(/<a?:(\w+):[\w-]+>/g, (_, name) => `:${name}:`);
}

/** Plain-text preview of a message (for notifications, reply bars, search). */
export function plainPreview(content: string) {
  return tokensToText(content)
    .replace(/```[\s\S]*?```/g, `[${t('Code')}]`)
    .replace(/[*_~|`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
