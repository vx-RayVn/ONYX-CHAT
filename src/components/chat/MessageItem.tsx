import {GuestTag} from '../ui/GuestTag';
import {BotPopover} from '../profile/BotPopover';
import {InviteEmbeds} from '../modals/InvitePreview';
import { ServerTagPill } from '../profile/ServerTag';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Copy, CornerUpLeft, Ellipsis, EyeOff, FaceSlightlySmilingPlus, Flag, Link, Pencil, Phone, PhoneMissed, Pin, PinOff, Reply, Trash } from 'lucide-react';
import type { ID, Message, User } from '../../types';
import { useStore } from '../../store/store';
import { useUI, toast } from '../../store/ui';
import { can, canWrite, isMention, memberDisplayName, topColor } from '../../store/selectors';
import { cn, copyText, formatClock, formatLongDateTime, formatMessageTime, hashString } from '../../lib/utils';
import { QUICK_REACTIONS } from '../../lib/emoji';
import { t, tk, tn, tx } from '../../i18n';
import { StyledName } from '../cosmetics/StyledName';
import { Avatar } from '../ui/Avatar';
import { BotTag } from '../ui/misc';
import { Tooltip } from '../ui/Tooltip';
import { ContextMenu, Dropdown, type MenuSpec } from '../ui/Menu';
import { UserPopover } from '../profile/UserPopover';
import { MessageContent, plainPreview, tokensToText } from './MessageContent';
import { Attachments, EmbedView, Reactions } from './MessageParts';
import { EmojiPickerPopover } from './EmojiPicker';
import { prepareOutgoing } from './outgoing';
import { PlusCheck,PlusPill } from '../ui/PlusCheck';
import { CLOUD } from '../../backend/config';
import { DELETED_USER_ID } from '../../backend/map';
import { CallNotice, useCallMissed } from '../voice/CallNotice';

/* ---------------------------------------------------------------- */
/* Menu                                                               */
/* ---------------------------------------------------------------- */

export function confirmDelete(m: Message) {
  const s = useStore.getState();
  useUI.getState().openModal({
    type: 'confirm',
    title: t('Delete message'),
    body: (
      <div className="confirm-preview">
        <p>{t('Do you really want to delete this message?')}</p>
        <div className="confirm-msg">
          <Avatar user={s.users[m.authorId]} size={32} />
          <div>
            <strong>{s.users[m.authorId]?.displayName}</strong>
            <span>{m.content ? plainPreview(m.content).slice(0, 180) : m.attachments.length ? tn(m.attachments.length, '{count} attachment', '{count} attachments') : t('Embed')}</span>
          </div>
        </div>
        <p className="confirm-tip">{t('Tip: hold Shift to delete without confirmation.')}</p>
      </div>
    ),
    confirmLabel: t('Delete'),
    danger: true,
    onConfirm: () => s.deleteMessage(m.channelId, m.id),
  });
}

function messageMenu(m: Message, serverId: ID | null): MenuSpec {
  const s = useStore.getState();
  const ui = useUI.getState();
  const mine = m.authorId === s.meId;
  const mod = can(s, m.channelId, 'manageMessages');
  const react = can(s, m.channelId, 'addReactions');
  const writable = canWrite(s, s.channels[m.channelId]);
  // Reports go to the ONYX team – cloud mode only.
  const reportable = CLOUD && !mine && m.type === 'default' && m.authorId !== DELETED_USER_ID;
  return [
    react && {
      type: 'custom',
      render: (
        <div className="menu-quick">
          {QUICK_REACTIONS.concat('💯').map((e) => (
            <button key={e} className="menu-quick-btn" onClick={() => s.toggleReaction(m.channelId, m.id, e)}>
              {e}
            </button>
          ))}
        </div>
      ),
    },
    react && { type: 'separator' },
    writable && {
      label: t('Reply'),
      icon: <Reply />,
      onSelect: () =>
        ui.setReplyTo({
          channelId: m.channelId,
          messageId: m.id,
          mention: !mine,
        }),
    },
    mine &&
      m.type === 'default' && {
        label: t('Edit message'),
        icon: <Pencil />,
        onSelect: () => ui.setEditing({ channelId: m.channelId, messageId: m.id }),
      },
    mod && {
      label: m.pinned ? t('Unpin message') : t('Pin message'),
      icon: m.pinned ? <PinOff /> : <Pin />,
      onSelect: () => s.togglePin(m.channelId, m.id),
    },
    !!m.content && {
      label: t('Copy text'),
      icon: <Copy />,
      onSelect: () => copyText(plainPreview(m.content)).then(() => toast({ title: t('Text copied') })),
    },
    {
      label: t('Mark unread'),
      icon: <EyeOff />,
      onSelect: () => s.markUnreadFrom(m.channelId, m.id),
    },
    {
      label: t('Copy message link'),
      icon: <Link />,
      onSelect: () => copyText(`https://onyxchat.site/channels/${serverId ?? '@me'}/${m.channelId}/${m.id}`).then(() => toast({ title: t('Link copied') })),
    },
    (mine || mod || reportable) && { type: 'separator' },
    (mine || mod) && {
      label: t('Delete message'),
      icon: <Trash />,
      danger: true,
      onSelect: () => confirmDelete(m),
    },
    reportable && {
      label: t('Report message'),
      icon: <Flag />,
      danger: true,
      onSelect: () => ui.openModal({ type: 'report', target: { kind: 'message', channelId: m.channelId, messageId: m.id } }),
    },
    { type: 'separator' },
    {
      label: t('Copy message ID'),
      icon: <Copy />,
      onSelect: () => copyText(m.id).then(() => toast({ title: t('Message ID copied') })),
    },
  ];
}

/* ---------------------------------------------------------------- */
/* Pieces                                                             */
/* ---------------------------------------------------------------- */

function AuthorName({ userId, serverId, className, withCheck }: { userId: ID; serverId: ID | null; className?: string; withCheck?: boolean }) {
  const name = useStore((s) => memberDisplayName(s, userId, serverId));
  const color = useStore((s) => (s.settings.showRoleColors && serverId ? topColor(s.servers[serverId], userId) : undefined));
  const style = useStore((s) => s.users[userId]?.nameStyle);
  const plusSince = useStore((s) => s.users[userId]?.plusSince);
  const plusUntil = useStore((s) => s.users[userId]?.plusUntil);
  return (
    <span className="msg-identity">
      <UserPopover userId={userId} serverId={serverId ?? undefined} side="right" align="start">
        <span className={cn('msg-author', className)} role="button" tabIndex={0}>
          <StyledName style={style} color={color}>
            {name}
          </StyledName>
        </span>
      </UserPopover>
      <GuestTag userId={userId}/><ServerTagPill userId={userId} />
      {withCheck && <><PlusCheck since={plusSince} until={plusUntil} size={15} /><PlusPill since={plusSince} until={plusUntil}/></>}
    </span>
  );
}

function ReplyPreview({ message, serverId }: { message: Message; serverId: ID | null }) {
  const target = useStore((s) => s.messages[message.channelId]?.find((x) => x.id === message.replyToId));
  const author = useStore((s) => (target ? s.users[target.authorId] : undefined));
  const name = useStore((s) => (target ? memberDisplayName(s, target.authorId, serverId) : ''));
  const color = useStore((s) => (target && s.settings.showRoleColors && serverId ? topColor(s.servers[serverId], target.authorId) : undefined));
  const flash = useUI((s) => s.flash);
  return (
    <div className="msg-reply">
      <span className="msg-reply-spine" />
      {target ? (
        <button className="msg-reply-body" onClick={() => flash(target.id)}>
          <Avatar user={target.bot ? {displayName:target.bot.name,avatarColor:'#64748b',avatar:target.bot.avatar?{kind:'image',src:target.bot.avatar}:undefined} : author} size={16} />
          <span className="msg-reply-name" style={color ? { color } : undefined}>
            {message.replyMention ? '@' : ''}
            {target.bot?.name ?? name}
          </span>
          <span className="msg-reply-text truncate" dir="auto">
            {target.content ? <MessageContent content={target.content} serverId={serverId} inline /> : <em>{t('Click to see the attachment')}</em>}
          </span>
        </button>
      ) : (
        <span className="msg-reply-body is-missing">
          <em>{t('Original message was deleted')}</em>
        </span>
      )}
    </div>
  );
}

function EditBox({ message }: { message: Message }) {
  const [value, setValue] = useState(() => tokensToText(message.content));
  const ref = useRef<HTMLTextAreaElement>(null);
  const setEditing = useUI((s) => s.setEditing);
  const edit = useStore((s) => s.editMessage);
  const serverId = useStore((s) => s.channels[message.channelId]?.serverId ?? null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const save = () => {
    const text = value.trim();
    if (!text && message.attachments.length === 0) {
      setEditing(null);
      confirmDelete(message);
      return;
    }
    edit(message.channelId, message.id, prepareOutgoing(text, serverId, message.channelId));
    setEditing(null);
  };

  return (
    <div className="msg-edit">
      <textarea
        ref={ref}
        className="msg-edit-input"
        value={value}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(null);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
        aria-label={t('Edit message')}
      />
      <div className="msg-edit-hint">
        {tx('Escape to {cancel} · Enter to {save}', {
          cancel: <button onClick={() => setEditing(null)}>{t('cancel')}</button>,
          save: <button onClick={save}>{t('save')}</button>,
        })}
      </div>
    </div>
  );
}

function Toolbar({ message, serverId, writable }: { message: Message; serverId: ID | null; writable: boolean }) {
  const meId = useStore((s) => s.meId);
  const toggle = useStore((s) => s.toggleReaction);
  const { setReplyTo, setEditing } = useUI.getState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mine = message.authorId === meId;
  const mod = useStore((s) => can(s, message.channelId, 'manageMessages'));
  const react = useStore((s) => can(s, message.channelId, 'addReactions'));

  return (
    <div className={cn('msg-toolbar', (pickerOpen || menuOpen) && 'is-open')} onClick={(e) => e.stopPropagation()}>
      {react &&
        QUICK_REACTIONS.map((e) => (
          <Tooltip key={e} content={t('React with {emoji}', { emoji: e })}>
            <button className="tb-btn tb-emoji" onClick={() => toggle(message.channelId, message.id, e)} aria-label={t('React with {emoji}', { emoji: e })}>
              {e}
            </button>
          </Tooltip>
        ))}
      {react && <span className="tb-sep" />}
      {react && (
        <EmojiPickerPopover
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          side="left"
          align="start"
          onPick={(e) => toggle(message.channelId, message.id, e)}
          trigger={
            <button className="tb-btn" aria-label={t('Add reaction')}>
              <Tooltip content={t('Add reaction')}>
                <FaceSlightlySmilingPlus />
              </Tooltip>
            </button>
          }
        />
      )}
      {writable && (
        <Tooltip content={t('Reply')}>
          <button
            className="tb-btn"
            onClick={() =>
              setReplyTo({
                channelId: message.channelId,
                messageId: message.id,
                mention: !mine,
              })
            }
            aria-label={t('Reply')}
          >
            <CornerUpLeft />
          </button>
        </Tooltip>
      )}
      {mine && message.type === 'default' && (
        <Tooltip content={t('Edit')}>
          <button
            className="tb-btn"
            onClick={() =>
              setEditing({
                channelId: message.channelId,
                messageId: message.id,
              })
            }
            aria-label={t('Edit')}
          >
            <Pencil />
          </button>
        </Tooltip>
      )}
      {(mine || mod) && (
        <Tooltip content={t('Delete · Shift = without confirmation')}>
          <button className="tb-btn tb-danger" onClick={(e) => (e.shiftKey ? useStore.getState().deleteMessage(message.channelId, message.id) : confirmDelete(message))} aria-label={t('Delete')}>
            <Trash />
          </button>
        </Tooltip>
      )}
      <Dropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        side="left"
        align="start"
        items={messageMenu(message, serverId)}
        trigger={
          <button className="tb-btn" aria-label={t('More actions')}>
            <Ellipsis />
          </button>
        }
      />
    </div>
  );
}

const JOIN_LINES = [tk('Welcome, {name}! Great to have you here.'), tk('{name} just landed. 🎉'), tk('{name} joined the party.'), tk('A wild {name} appeared!'), tk('{name} is here – say hi!')];

function SystemMessage({ message, serverId }: { message: Message; serverId: ID | null }) {
  const use24h = useStore((s) => s.settings.use24h);
  const meId = useStore((s) => s.meId);
  const flash = useUI((s) => s.flash);
  const missed = useCallMissed(message);
  let icon = <ArrowRight />;
  let tone = 'is-join';
  let body: ReactNode;
  if (message.type === 'join') {
    const isCreation = message.authorId === meId && useStore.getState().servers[serverId ?? '']?.ownerId === meId;
    const line = JOIN_LINES[hashString(message.id) % JOIN_LINES.length];
    body = isCreation
      ? tx('{name} created this server. Welcome to your new community!', {
          name: <AuthorName userId={message.authorId} serverId={serverId} />,
        })
      : tx(line, {
          name: <AuthorName userId={message.authorId} serverId={serverId} />,
        });
  } else if (message.type === 'pin') {
    icon = <Pin />;
    tone = 'is-pin';
    body = tx('{name} pinned {message} to this channel.', {
      name: <AuthorName userId={message.authorId} serverId={serverId} />,
      message: (
        <button className="sys-link" onClick={() => message.replyToId && flash(message.replyToId)}>
          {t('a message')}
        </button>
      ),
    });
  } else {
    icon = missed ? <PhoneMissed /> : <Phone />;
    tone = missed ? 'is-call is-missed' : 'is-call';
    body = <CallNotice message={message} name={<AuthorName userId={message.authorId} serverId={serverId} />} />;
  }
  return (
    <div className={cn('msg msg-system', tone)} data-mid={message.id}>
      <div className="msg-gutter">
        <span className="sys-icon">{icon}</span>
      </div>
      <div className="msg-main">
        <span className="sys-text">{body}</span>
        <Tooltip content={formatLongDateTime(message.createdAt, use24h)}>
          <time className="msg-time">{formatMessageTime(message.createdAt, use24h)}</time>
        </Tooltip>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Message                                                            */
/* ---------------------------------------------------------------- */

interface Props {
  message: Message;
  grouped: boolean;
  serverId: ID | null;
  compact: boolean;
}

export const MessageItem = memo(function MessageItem({ message, grouped, serverId, compact }: Props) {
  const profile = useStore((s) => s.users[message.authorId]);
  const author: User | undefined = message.bot ? {id:message.bot.id,username:message.bot.name,displayName:message.bot.name,avatar:message.bot.avatar?{kind:'image',src:message.bot.avatar}:undefined,avatarColor:'#64748b',status:'offline',badges:[],bot:true,createdAt:0} : profile;
  const meId = useStore((s) => s.meId);
  const use24h = useStore((s) => s.settings.use24h);
  const showPreviews = useStore((s) => s.settings.showLinkPreviews);
  const writable = useStore((s) => canWrite(s, s.channels[message.channelId]));
  const canReact = useStore((s) => can(s, message.channelId, 'addReactions'));
  const editing = useUI((s) => s.editing?.messageId === message.id);
  const highlighted = useUI((s) => s.highlight === message.id);
  const replying = useUI((s) => s.replyTo?.messageId === message.id);
  // Same rules as notifications: permission for @everyone/roles, server suppression, nothing inside code.
  const mentioned = useStore((s) => isMention(s, message));

  if (message.type !== 'default') return <SystemMessage message={message} serverId={serverId} />;

  const edited = message.editedAt ? (
    <Tooltip content={formatLongDateTime(message.editedAt, use24h)}>
      <span className="msg-edited">({t('edited')})</span>
    </Tooltip>
  ) : null;

  const timeEl = (
    <Tooltip content={formatLongDateTime(message.createdAt, use24h)}>
      <time className="msg-time" dateTime={new Date(message.createdAt).toISOString()}>
        {formatMessageTime(message.createdAt, use24h)}
      </time>
    </Tooltip>
  );

  const body = (
    <>
      {editing ? (
        <EditBox message={message} />
      ) : (
        message.content && (
          <div className="msg-content" dir="auto">
            <MessageContent content={message.content} serverId={serverId} edited={edited} />
          </div>
        )
      )}
      {message.attachments.length > 0 && <Attachments items={message.attachments} />}
      {showPreviews && message.embeds.map((e, i) => <EmbedView key={i} embed={e} serverId={serverId} />)}
      {showPreviews && !editing && <InviteEmbeds content={message.content}/>}
      {message.reactions.length > 0 && <Reactions reactions={message.reactions} channelId={message.channelId} messageId={message.id} serverId={serverId} canReact={canReact} />}
    </>
  );

  const showHead = compact || !grouped;

  return (
    <ContextMenu items={() => messageMenu(message, serverId)}>
      <div
        className={cn(
          'msg anim-host',
          compact && 'msg-compact',
          grouped && !compact && 'is-grouped',
          mentioned && 'is-mentioned',
          highlighted && 'is-highlight',
          replying && 'is-replying',
          editing && 'is-editing',
          message.authorId === meId && 'is-mine',
        )}
        data-mid={message.id}
      >
        {message.replyToId && !compact && <ReplyPreview message={message} serverId={serverId} />}
        {compact ? (
          <div className="msg-compact-row">
            <Tooltip content={formatLongDateTime(message.createdAt, use24h)}>
              <time className="msg-compact-time tnum">{formatClock(message.createdAt, use24h)}</time>
            </Tooltip>
            <div className="msg-compact-main">
              {message.replyToId && <ReplyPreview message={message} serverId={serverId} />}
              <span className="msg-compact-head">
                {message.bot ? <BotPopover bot={message.bot}><button className="msg-author">{message.bot.name}</button></BotPopover> : <AuthorName userId={message.authorId} serverId={serverId} withCheck />}
                {author?.bot && <BotTag verified={!message.bot} />}
              </span>
              {body}
            </div>
          </div>
        ) : (
          <>
            <div className="msg-gutter">
              {showHead ? (
                message.bot ? <BotPopover bot={message.bot}><button className="msg-avatar" aria-label={message.bot.name}><Avatar user={author} size={40}/></button></BotPopover> :
                <UserPopover userId={message.authorId} serverId={serverId ?? undefined} side="right" align="start">
                  <button
                    className="msg-avatar"
                    aria-label={t('Profile of {name}', {
                      name: author?.displayName ?? '',
                    })}
                  >
                    <Avatar user={author} size={40} frame />
                  </button>
                </UserPopover>
              ) : (
                <Tooltip content={formatLongDateTime(message.createdAt, use24h)}>
                  <time className="msg-hover-time tnum">{formatClock(message.createdAt, use24h)}</time>
                </Tooltip>
              )}
            </div>
            <div className="msg-main">
              {showHead && (
                <div className="msg-head">
                  {message.bot ? <BotPopover bot={message.bot}><button className="msg-author">{message.bot.name}</button></BotPopover> : <AuthorName userId={message.authorId} serverId={serverId} withCheck />}
                  {author?.bot && <BotTag verified={!message.bot} />}
                  {timeEl}
                </div>
              )}
              {body}
            </div>
          </>
        )}
        {!editing && <Toolbar message={message} serverId={serverId} writable={writable} />}
      </div>
    </ContextMenu>
  );
});
