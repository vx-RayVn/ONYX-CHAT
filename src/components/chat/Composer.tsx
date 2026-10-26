import {requireAccount} from '../../store/ui';
import { describeError } from '../../backend/queue';
import {matchingBotCommands} from './BotCommands';
import {dispatchBot} from '../../backend/bots';
import { sendTyping, useTypingChannel, useTypingUsers } from '../../backend/typing';
import { useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { AtSign, CirclePlus, FaceSlightlySmiling, FileMusic, Hash, Lock, Mic, SendHorizontal, Slash, Timer, X, Ban, ImageIcon } from 'lucide-react';
import type { Attachment, ID } from '../../types';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/store';
import { useUI, toast } from '../../store/ui';
import { allCustomEmojis, can, canSee, canWrite, dmTitle, memberDisplayName } from '../../store/selectors';
import { BRAND } from '../../config/brand';
import { cn, formatBytes } from '../../lib/utils';
import { searchEmojis } from '../../lib/emoji';
import { t, tx } from '../../i18n';
import { fileToAttachment, UploadError } from '../../lib/image';
import { Avatar } from '../ui/Avatar';
import { ChannelIcon } from '../ui/icons';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { EmojiPickerPopover } from './EmojiPicker';
import { prepareOutgoing, resolveSlash, SLASH_COMMANDS } from './outgoing';
import { VoiceRecorderBar } from './VoiceRecorderBar';
import { deleteAudio } from '../../lib/audio';
import { DELETED_USER_ID } from '../../backend/map';

const EMPTY: Attachment[] = [];

interface Suggestion {
  key: string;
  icon: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  insert: string;
}

interface AutoState {
  trigger: '@' | '#' | ':' | '/';
  start: number;
  end: number;
  items: Suggestion[];
  index: number;
}

export async function addFiles(channelId: ID, files: File[]) {
  if (!files.length) return;
  if(requireAccount())return;
  if (!can(useStore.getState(), channelId, 'attachFiles')) {
    toast({ tone: 'danger', title: t('Files can’t be attached here'), body: t('You don’t have the “Attach files” permission in this channel.') });
    return;
  }
  const out: Attachment[] = [];
  for (const f of files) {
    try {
      out.push(await fileToAttachment(f));
    } catch (e) {
      toast({ tone: 'danger', title: t('File not added'), body: e instanceof UploadError ? e.message : t('“{name}” could not be read.', { name: f.name }) });
    }
  }
  if (out.length) useUI.getState().addPending(channelId, out);
}

export function Composer({ channelId, serverId }: { channelId: ID; serverId: ID | null }) {
  const guest=useStore(s=>s.users[s.meId]?.guest);
  const channel = useStore((s) => s.channels[channelId]);
  const dm = useStore((s) => s.dms[channelId]);
  const writable = useStore((s) => canWrite(s, s.channels[channelId]));
  const canAttach = useStore((s) => can(s, channelId, 'attachFiles'));
  const canEveryone = useStore((s) => can(s, channelId, 'mentionEveryone'));
  const roleNames = useStore(useShallow((s) => (serverId ? (s.servers[serverId]?.roles ?? []).filter((r) => !r.isDefault).map((r) => r.name.toLowerCase()) : [])));
  const canVoice = useStore((s) => can(s, channelId, 'sendVoiceMessages'));
  const [recording, setRecording] = useState(false);
  const blockedUser = useStore((s) => {
    const d = s.dms[channelId];
    if (!d || d.type !== 'dm') return null;
    const other = d.participantIds.find((p) => p !== s.meId);
    return other && s.relationships[other]?.type === 'blocked' ? s.users[other] : null;
  });
  const partnerDeleted = useStore((s) => {
    const d = s.dms[channelId];
    return !!d && d.type === 'dm' && d.participantIds.includes(DELETED_USER_ID);
  });
  const placeholderName = useStore((s) => (s.dms[channelId] ? dmTitle(s, s.dms[channelId]) : ''));
  const sendWithEnter = useStore((s) => s.settings.sendWithEnter);
  const isOwner = useStore((s) => (serverId ? s.servers[serverId]?.ownerId === s.meId : false));
  const { sendMessage, setDraft } = useStore.getState();
  const pending = useUI((s) => s.pending[channelId] ?? EMPTY);
  const replyTo = useUI((s) => (s.replyTo?.channelId === channelId ? s.replyTo : null));
  const replyName = useStore((s) => {
    if (!replyTo) return '';
    const m = s.messages[channelId]?.find((x) => x.id === replyTo.messageId);
    return m ? memberDisplayName(s, m.authorId, serverId) : '';
  });
  const replyIsMine = useStore((s) => (replyTo ? s.messages[channelId]?.find((x) => x.id === replyTo.messageId)?.authorId === s.meId : false));
  const [text, setText] = useState(() => useStore.getState().drafts[channelId] ?? '');
  const [auto, setAuto] = useState<AutoState | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Focus when opening a channel or starting a reply.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) ref.current?.focus({preventScroll:true});
  }, [channelId, replyTo?.messageId]);

  // Text inserted from elsewhere (e.g. "Mention" in a user menu).
  const insertRequest = useUI((s) => s.insertRequest);
  useEffect(() => {
    if (!insertRequest || insertRequest.channelId !== channelId) return;
    useUI.setState({ insertRequest: null });
    setText((t) => (t && !t.endsWith(' ') ? `${t} ` : t) + insertRequest.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      el?.focus({preventScroll:true});
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }, [insertRequest, channelId]);

  // Persist drafts (debounced).
  useEffect(() => {
    const t = window.setTimeout(() => setDraft(channelId, text), 300);
    return () => window.clearTimeout(t);
  }, [text, channelId, setDraft]);

  // Auto-grow.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.45)}px`;
  }, [text]);

  // Typing anywhere focuses the composer (like desktop chat apps).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable], [role="dialog"], [role="menu"]')) return;
      if (useUI.getState().modal || useUI.getState().settings) return;
      ref.current?.focus({preventScroll:true});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const memberIds = useStore((s) => (serverId ? s.servers[serverId]?.members : undefined));
  const servers = useStore((s) => s.servers);
  const serverOrder = useStore((s) => s.serverOrder);
  const customs = useMemo(() => allCustomEmojis({ servers, serverOrder }), [servers, serverOrder]);

  const computeAuto = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const s = useStore.getState();
    const slash = before.match(/^\/(\w*)$/);
    if (slash) {
      const q = slash[1].toLowerCase();
      const items = SLASH_COMMANDS.filter((c) => c.name.startsWith(q) && (c.name !== 'nick' || serverId)).map<Suggestion>((c) => ({
        key: c.name,
        icon: <Slash />,
        label: (
          <>
            /{c.name} <span className="ac-args">{t(c.args)}</span>
          </>
        ),
        sub: t(c.description),
        insert: `/${c.name} `,
      }));
      return items.length ? { trigger: '/' as const, start: 0, end: caret, items, index: 0 } : null;
    }
    const m = before.match(/(^|[\s(])([@#:])([\p{L}\p{N}_.-]*)$/u);
    if (!m) return null;
    const trig = m[2] as '@' | '#' | ':';
    const q = m[3].toLowerCase();
    const start = caret - m[3].length - 1;
    let items: Suggestion[] = [];
    if (trig === '@') {
      const ids = serverId ? Object.keys(memberIds ?? {}) : (s.dms[channelId]?.participantIds ?? []);
      items = ids
        .map((id) => s.users[id])
        .filter((u) => u && (u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || memberDisplayName(s, u.id, serverId).toLowerCase().includes(q)))
        .sort((a, b) => Number(b.status !== 'offline') - Number(a.status !== 'offline') || a.displayName.localeCompare(b.displayName))
        .slice(0, 8)
        .map<Suggestion>((u) => ({
          key: u.id,
          icon: <Avatar user={u} size={24} status={u.status} />,
          label: memberDisplayName(s, u.id, serverId),
          sub: u.username,
          insert: `@${u.username} `,
        }));
      if (serverId) {
        (['everyone', 'here'] as const)
          .filter((n) => n.startsWith(q))
          .forEach((n) =>
            items.push({
              key: n,
              icon: (
                <span className="ac-at">
                  <AtSign />
                </span>
              ),
              label: `@${n}`,
              sub: !canEveryone ? t('You can’t notify everyone in this channel') : n === 'everyone' ? t('Notifies everyone in this channel') : t('Notifies everyone who is online'),
              insert: `@${n} `,
            }),
          );
        // Roles: notify everyone who has them (same permission as @everyone).
        (s.servers[serverId]?.roles ?? [])
          .filter((r) => !r.isDefault && r.name.toLowerCase().includes(q))
          .sort((a, b) => b.position - a.position)
          .slice(0, 5)
          .forEach((r) =>
            items.push({
              key: `role:${r.id}`,
              icon: (
                <span className="ac-at ac-role" style={r.color ? { color: r.color } : undefined}>
                  <AtSign />
                </span>
              ),
              label: `@${r.name}`,
              sub: canEveryone ? t('Notifies everyone with this role') : t('You can’t notify roles in this channel'),
              insert: `@${r.name} `,
            }),
          );
      }
    } else if (trig === '#') {
      if (!serverId) return null;
      items = Object.values(s.channels)
        .filter((c) => c.serverId === serverId && c.name.toLowerCase().includes(q) && canSee(s, c.id))
        .slice(0, 8)
        .map<Suggestion>((c) => ({
          key: c.id,
          icon: <ChannelIcon type={c.type} size={18} />,
          label: c.name,
          sub: s.servers[serverId].categories.find((k) => k.id === c.categoryId)?.name,
          insert: `#${c.name} `,
        }));
    } else {
      if (q.length < 2) return null;
      const custom = customs
        .filter((e) => e.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map<Suggestion>((e) => ({
          key: e.id,
          icon: <img className="ac-emoji-img" src={e.src} alt="" />,
          label: `:${e.name}:`,
          sub: e.serverId ? s.servers[e.serverId]?.name : t('ONYX pack'),
          insert: `:${e.name}: `,
        }));
      const uni = searchEmojis(q, 8).map<Suggestion>((e) => ({ key: e.char, icon: <span className="ac-emoji">{e.char}</span>, label: `:${e.name}:`, insert: `${e.char} ` }));
      items = [...custom, ...uni].slice(0, 9);
    }
    return items.length ? { trigger: trig, start, end: caret, items, index: 0 } : null;
  };

  const updateAuto = () => {
    const el = ref.current;
    if (!el) return;
    setAuto(computeAuto(el.value, el.selectionStart));
  };

  const accept = (sug: Suggestion) => {
    if (!auto) return;
    const next = text.slice(0, auto.start) + sug.insert + text.slice(auto.end);
    setText(next);
    setAuto(null);
    const caret = auto.start + sug.insert.length;
    requestAnimationFrame(() => {
      ref.current?.focus({preventScroll:true});
      ref.current?.setSelectionRange(caret, caret);
    });
  };

  const insertAtCaret = (str: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + str + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus({preventScroll:true});
      el?.setSelectionRange(start + str.length, start + str.length);
    });
  };

  const send = () => {
    let content = text.trim();
    if (!content && pending.length === 0) return;
    if (content.length > BRAND.messageLimit) {
      toast({ tone: 'danger', title: t('Message too long'), body: t('Up to {count} characters – free, twice as much as elsewhere.', { count: BRAND.messageLimit }) });
      return;
    }
    if (content.startsWith('/') && serverId) {
      const match=content.match(/^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/);
      const bots=match?matchingBotCommands(channelId,match[1]):[];
      if(bots.length>1){toast({title:t('Choose a bot from the command menu.')});return;}
      if(bots.length===1&&pending.length===0){
         if(requireAccount())return;
        const original=content;setText('');setAuto(null);setDraft(channelId,'');
        void dispatchBot(bots[0].bot,channelId,bots[0].name,match?.[2]??'').then(()=>toast({title:t('Command sent')})).catch(error=>{setText(current=>current||original);toast({tone:'danger',title:t('That didn’t work'),body:describeError(error)});});return;
      }
    }
    if (content.startsWith('/')) {
      const r = resolveSlash(content, serverId);
      if (r === null) {
        setText('');
        setDraft(channelId, '');
        return;
      }
      content = r;
    }
    content = prepareOutgoing(content, serverId, channelId);
    sendMessage(channelId, content, { attachments: pending, replyToId: replyTo?.messageId, replyMention: replyTo?.mention });
    setText('');
    setAuto(null);
    useUI.getState().clearPending(channelId);
    useUI.getState().setReplyTo(null);
  };

  const sendVoice = (att: Attachment) => {
    sendMessage(channelId, '', { attachments: [att], replyToId: replyTo?.messageId, replyMention: replyTo?.mention });
    useUI.getState().setReplyTo(null);
    requestAnimationFrame(() => ref.current?.focus({preventScroll:true}));
  };

  const editLast = () => {
    const s = useStore.getState();
    const list = s.messages[channelId] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].authorId === s.meId && list[i].type === 'default') {
        useUI.getState().setEditing({ channelId, messageId: list[i].id });
        return true;
      }
    }
    return false;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (auto) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        setAuto({ ...auto, index: (auto.index + dir + auto.items.length) % auto.items.length });
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        accept(auto.items[auto.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAuto(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && (sendWithEnter || e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && replyTo) {
      e.preventDefault();
      useUI.getState().setReplyTo(null);
    } else if (e.key === 'ArrowUp' && !text) {
      if (editLast()) e.preventDefault();
    }
  };

  const onPaste = (e: ReactClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addFiles(channelId, files);
    }
  };

  if (blockedUser) {
    return (
      <div className="composer-wrap">
        <div className="composer is-locked">
          <Ban size={18} />
          <span>{t('You blocked {name} and can’t send messages.', { name: blockedUser.displayName })}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => useStore.getState().removeRelationship(blockedUser.id)}>
            {t('Unblock')}
          </button>
        </div>
      </div>
    );
  }

  if (partnerDeleted) {
    return (
      <div className="composer-wrap">
        <div className="composer is-locked">
          <Lock size={18} />
          <span>{t('This account was deleted. You can still read the conversation, but no one receives new messages.')}</span>
        </div>
      </div>
    );
  }

  if (!writable) {
    return (
      <div className="composer-wrap">
        <div className="composer is-locked">
          <Lock size={18} />
          <span>{t('You don’t have permission to send messages in this channel.')}</span>
        </div>
      </div>
    );
  }

  const placeholder = channel ? t('Message #{name}', { name: channel.name }) : dm ? t('Message {name}', { name: `${dm.type === 'dm' ? '@' : ''}${placeholderName}` }) : t('Write a message');
  const over = text.length > BRAND.messageLimit * 0.9;
  const slowmode = channel?.slowmode && !isOwner ? channel.slowmode : 0;

  return (
    <div className="composer-wrap">
      {auto && (
        <div className="autocomplete" role="listbox" aria-label={t('Suggestions')}>
          <div className="ac-head">
            {auto.trigger === '@'
              ? t('Members')
              : auto.trigger === '#'
                ? t('Channels')
                : auto.trigger === ':'
                  ? tx('Emojis matching {query}', { query: <strong>:{text.slice(auto.start + 1, auto.end)}</strong> })
                  : t('Commands')}
          </div>
          {auto.items.map((it, i) => (
            <button
              key={it.key}
              role="option"
              aria-selected={i === auto.index}
              className={cn('ac-item', i === auto.index && 'is-active')}
              onMouseEnter={() => setAuto({ ...auto, index: i })}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(it);
              }}
            >
              <span className="ac-icon">{it.icon}</span>
              <span className="ac-label truncate">{it.label}</span>
              {it.sub && <span className="ac-sub truncate">{it.sub}</span>}
            </button>
          ))}
          <div className="ac-foot">
            <kbd className="kbd kbd-sm">↑</kbd>
            <kbd className="kbd kbd-sm">↓</kbd> {t('select')} · <kbd className="kbd kbd-sm">Tab</kbd> {t('accept')} · <kbd className="kbd kbd-sm">Esc</kbd> {t('close')}
          </div>
        </div>
      )}
      <div className={cn('composer', (replyTo || pending.length > 0) && 'has-attachments', replyTo && 'has-reply')}>
        {replyTo && (
          <div className="composer-reply">
            <span>{tx('Replying to {name}', { name: <strong>{replyName}</strong> })}</span>
            {!replyIsMine && (
              <Tooltip content={replyTo.mention ? t('{name} will be notified', { name: replyName }) : t('{name} won’t be notified', { name: replyName })}>
                <button className={cn('reply-ping', replyTo.mention && 'is-on')} onClick={() => useUI.getState().setReplyTo({ ...replyTo, mention: !replyTo.mention })}>
                  <AtSign size={14} />
                  {replyTo.mention ? t('ON') : t('OFF')}
                </button>
              </Tooltip>
            )}
            <IconButton label={t('Cancel reply')} size="sm" onClick={() => useUI.getState().setReplyTo(null)}>
              <X />
            </IconButton>
          </div>
        )}
        {pending.length > 0 && (
          <div className="composer-files">
            {pending.map((a) => (
              <div key={a.id} className="pending-file">
                <div className="pending-thumb">
                  {a.kind === 'image' && a.url ? (
                    <img src={a.url} alt="" />
                  ) : a.kind === 'audio' ? (
                    <FileMusic size={28} className="is-file" />
                  ) : (
                    <ImageIcon size={28} className={a.kind !== 'image' ? 'is-file' : ''} />
                  )}
                </div>
                <span className="pending-name truncate">{a.name}</span>
                <span className="pending-size">{formatBytes(a.size)}</span>
                <IconButton
                  label={t('Remove attachment')}
                  size="sm"
                  className="pending-remove"
                  danger
                  onClick={() => {
                    if (a.localKey) void deleteAudio([a.localKey]);
                    useUI.getState().removePending(channelId, a.id);
                  }}
                >
                  <X />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        {recording ? (
          <VoiceRecorderBar onSend={sendVoice} onClose={() => setRecording(false)} />
        ) : (
          <div className="composer-row">
            <IconButton
              label={t('Upload a file')}
              tooltip={canAttach ? t('Upload a file · up to {size} MB free', { size: BRAND.uploadLimitMb }) : t('You can’t attach files in this channel')}
              className="composer-plus"
              disabled={!canAttach&&!guest}
              onClick={() => {if(!requireAccount())fileRef.current?.click();}}
            >
              <CirclePlus />
            </IconButton>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(channelId, Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <textarea
              ref={ref}
              className="composer-input"
              value={text}
              rows={1}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim()) sendTyping(channelId);
                setAuto(computeAuto(e.target.value, e.target.selectionStart));
              }}
              onKeyDown={onKeyDown}
              onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && updateAuto()}
              onClick={updateAuto}
              onBlur={() => window.setTimeout(() => setAuto(null), 120)}
              onPaste={onPaste}
            />
            <EmojiPickerPopover
              open={emojiOpen}
              onOpenChange={setEmojiOpen}
              side="top"
              align="end"
              closeOnPick={false}
              onPick={(e, meta) => insertAtCaret(meta.custom ? `:${meta.name}: ` : e)}
              trigger={
                <button className={cn('icon-btn composer-emoji', emojiOpen && 'is-active')} aria-label={t('Choose emoji')}>
                  <FaceSlightlySmiling />
                </button>
              }
            />
            <IconButton
              label={t('Record a voice message')}
              tooltip={canVoice ? t('Record a voice message') : t('You can’t send voice messages in this channel')}
              className="composer-mic"
              disabled={!canVoice&&!guest}
              onClick={() => {if(!requireAccount())setRecording(true);}}
            >
              <Mic />
            </IconButton>
            <Tooltip content={t('Send · Enter')}>
              <button className={cn('composer-send', (text.trim() || pending.length) && 'is-ready')} onClick={send} disabled={!text.trim() && !pending.length} aria-label={t('Send message')}>
                <SendHorizontal size={18} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
      <div className="composer-meta">
        <TypingIndicator channelId={channelId} serverId={serverId} isDM={!!dm} />
        {slowmode > 0 && (
          <span className="composer-slow">
            <Timer size={13} /> {t('Slowmode: {seconds} s', { seconds: slowmode })}
          </span>
        )}
        {serverId && channel && (
          <span className="composer-hint">
            <Hash size={12} /> <AtSign size={12} /> <span>{t('Mention')}</span> · <span>:</span> {t('Emoji')} · <span>/</span> {t('Commands')}
          </span>
        )}
        {serverId && !canEveryone && (/(^|\s)@(everyone|here)\b/.test(text) || roleNames.some((n) => text.toLowerCase().includes(`@${n}`))) && (
          <span className="composer-warn">{t('@everyone, @here and role mentions won’t notify anyone – you don’t have that permission here.')}</span>
        )}
        {over && <span className={cn('composer-count', text.length > BRAND.messageLimit && 'is-over')}>{BRAND.messageLimit - text.length}</span>}
      </div>
    </div>
  );
}

/** "Nova is typing …" (cloud mode, live via Realtime). */
function TypingIndicator({ channelId, serverId, isDM }: { channelId: ID; serverId: ID | null; isDM: boolean }) {
  useTypingChannel(channelId, isDM);
  const ids = useTypingUsers(channelId);
  const list = useStore(useShallow((s) => ids.map((id) => memberDisplayName(s, id, serverId))));
  if (!ids.length) return null;
  const text = list.length === 1 ? t('{name} is typing …', { name: list[0] }) : list.length === 2 ? t('{a} and {b} are typing …', { a: list[0], b: list[1] }) : t('Several people are typing …');
  return (
    <span className="composer-typing" aria-live="polite">
      <span className="typing-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <strong>{text}</strong>
    </span>
  );
}
