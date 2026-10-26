import { CLOUD } from '../../backend/config';
import { inviteUrl } from '../../lib/invites';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, ExternalLink, Info, Link2, Mic, Search, ShieldCheck, Store as StoreIcon, Upload, X, Settings } from 'lucide-react';
import type { ID, Invite } from '../../types';
import { useStore } from '../../store/store';
import { useUI, toast, showMainPane } from '../../store/ui';
import { dmTitle, canSee } from '../../store/selectors';
import { DAY, HOUR, cn, copyText } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { Avatar } from '../ui/Avatar';
import { ChannelIcon } from '../ui/icons';
import { ServerIcon } from '../layout/ServerRail';
import { EmojiPickerPopover } from '../chat/EmojiPicker';
import { Dropdown } from '../ui/Menu';
import { locale, t, tk, tx } from '../../i18n';

/* ---------------------------------------------------------------- */
/* Confirm & prompt                                                   */
/* ---------------------------------------------------------------- */

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm }: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void }) {
  const close = useUI((s) => s.closeModal);
  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            autoFocus
            onClick={() => {
              onConfirm();
              close();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-body">{body}</div>
    </Modal>
  );
}

export function PromptDialog(p: { title: string; label: string; initial: string; confirmLabel?: string; placeholder?: string; maxLength?: number; onSubmit: (v: string) => void }) {
  const close = useUI((s) => s.closeModal);
  const [value, setValue] = useState(p.initial);
  const submit = () => {
    p.onSubmit(value);
    close();
  };
  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={p.title}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit}>{p.confirmLabel ?? t('Save')}</Button>
        </>
      }
    >
      <TextField
        label={p.label}
        value={value}
        autoFocus
        placeholder={p.placeholder}
        maxLength={p.maxLength}
        showCounter={!!p.maxLength}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        onFocus={(e) => e.target.select()}
      />
    </Modal>
  );
}

const PREVIEW_ICON: Record<string, ReactNode> = {
  voice: <Mic />,
  link: <Info />,
  shop: <StoreIcon />,
  auth: <ShieldCheck />,
  upload: <Upload />,
};

export function PreviewDialog({ title, body, icon }: { title: string; body: string; icon?: string }) {
  const close = useUI((s) => s.closeModal);
  return (
    <Modal open onClose={close} size="sm" centered footer={<Button onClick={close}>{t('Got it')}</Button>}>
      <div className="preview-dialog">
        <span className="preview-dialog-icon">{PREVIEW_ICON[icon ?? 'link']}</span>
        <h2>{title}</h2>
        {body.split('\n\n').map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Invite                                                             */
/* ---------------------------------------------------------------- */

const EXPIRY = [
  { label: tk('30 minutes'), ms: 30 * 60_000 },
  { label: tk('1 hour'), ms: HOUR },
  { label: tk('1 day'), ms: DAY },
  { label: tk('7 days'), ms: 7 * DAY },
  { label: tk('Never'), ms: null },
];

export function InviteModal({ serverId, channelId }: { serverId: ID; channelId?: ID }) {
  const close = useUI((s) => s.closeModal);
  const server = useStore((s) => s.servers[serverId]);
  const channels = useStore((s) => s.channels);
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const createInvite = useStore((s) => s.createInvite);
  const target = channelId ?? server?.systemChannelId ?? Object.values(channels).find((c) => c.serverId === serverId && c.type !== 'voice')?.id ?? '';
  const [expiry, setExpiry] = useState(EXPIRY[4]);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<Set<ID>>(new Set());
  const [query, setQuery] = useState('');
  const [failed,setFailed] = useState(false);
  const initial = useRef<{key:string;promise:Promise<Invite|null>}|null>(null);
  const revision = useRef(0);
  const receive = (promise:Promise<Invite|null>) => {
    const request=++revision.current;setCode(null);setCopied(false);setFailed(false);
    void promise.then(invite=>{if(request===revision.current){setCode(invite?.code??null);setFailed(!invite);}}).catch(()=>{if(request===revision.current)setFailed(true);});
  };
  useEffect(() => {
    const key=serverId+':'+target;
    setExpiry(EXPIRY[4]);
    if(!target){setFailed(true);return;}
    if(initial.current?.key!==key)initial.current={key,promise:createInvite(serverId,target,{maxUses:null,expiresInMs:null})};
    receive(initial.current.promise);
    return()=>{revision.current++;};
  }, [serverId,target]);
  const link = inviteUrl(code ?? '…');

  const friends = useMemo(
    () =>
      Object.values(relationships)
        .filter((r) => r.type === 'friend')
        .map((r) => users[r.userId])
        .filter((u) => u && (!query || u.displayName.toLowerCase().includes(query.toLowerCase())))
        .sort((a, b) => Number(!!server?.members[a.id]) - Number(!!server?.members[b.id])),
    [relationships, users, query, server],
  );

  if (!server) return null;
  const ch = channels[target];

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={t('Invite friends to {name}', { name: server.name })}
      description={
        ch
          ? tx('Recipients land in {channel}', {
              channel: (
                <>
                  <ChannelIcon type={ch.type} size={14} /> {ch.name}
                </>
              ),
            })
          : undefined
      }
    >
      <div className="invite-search">
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search for friends')} aria-label={t('Search friends')} />
      </div>
      <div className="invite-friends">
        {friends.map((f) => {
          const member = !!server.members[f.id];
          return (
            <div key={f.id} className="invite-friend">
              <Avatar user={f} size={32} status={f.status} />
              <span className="grow truncate">
                <strong>{f.displayName}</strong>
                <span>{f.username}</span>
              </span>
              <Button
                size="sm"
                variant={sent.has(f.id) || member ? 'secondary' : 'outline'}
                disabled={!code || member || sent.has(f.id)}
                onClick={() => {
                  const s = useStore.getState();
                  const dmId = s.ensureDM(f.id);
                  s.sendMessage(dmId, `${t('Join our server **{name}**!', { name: server.name })} ${link}`);
                  setSent(new Set([...sent, f.id]));
                }}
              >
                {member ? t('Already a member') : sent.has(f.id) ? t('Sent') : t('Invite')}
              </Button>
            </div>
          );
        })}
        {friends.length === 0 && <div className="invite-empty">{t('No matching friends found.')}</div>}
      </div>
      <div className="invite-link-label">{t('Or send an invite link')}</div>
      <div className={cn('invite-link', copied && 'is-copied')}>
        <Link2 size={16} />
        <span className="grow truncate">{code?link:failed?t('Invite unavailable'):t('Loading …')}</span>
        <Button
          size="sm"
          variant={copied ? 'secondary' : 'primary'}
          disabled={!code}
          icon={copied ? <Check /> : <Copy />}
          onClick={() =>
            copyText(`${link}`).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }).catch(()=>toast({tone:'danger',title:t('That didn’t work')}))
          }
        >
          {copied ? t('Copied') : t('Copy')}
        </Button>
      </div>
      {failed && <Button variant="secondary" onClick={()=>receive(createInvite(serverId,target,{maxUses:null,expiresInMs:expiry.ms}))}>{t('Try again')}</Button>}
      <div className="invite-meta">
        {t('Expires:')}{' '}
        <Dropdown
          align="start"
          items={EXPIRY.map((e) => ({
            type: 'radio' as const,
            label: t(e.label),
            checked: e.label === expiry.label,
            onSelect: () => {
              setExpiry(e);
              receive(createInvite(serverId, target, { maxUses: null, expiresInMs: e.ms }));
            },
          }))}
          trigger={<button className="btn-link-inline">{t(expiry.label)}</button>}
        />
        {!CLOUD && <span>· {t('Links are local in the demo and work under “Join a server”.')}</span>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* New DM / group                                                     */
/* ---------------------------------------------------------------- */

export function NewDMModal({ addTo }: { addTo?: ID }) {
  const close = useUI((s) => s.closeModal);
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const existing = useStore((s) => (addTo ? s.dms[addTo] : undefined));
  const [selected, setSelected] = useState<ID[]>([]);
  const [query, setQuery] = useState('');
  const max = 9;

  const friends = useMemo(
    () =>
      Object.values(relationships)
        .filter((r) => r.type === 'friend' && !existing?.participantIds.includes(r.userId))
        .map((r) => users[r.userId])
        .filter((u) => u && (!query || u.displayName.toLowerCase().includes(query.toLowerCase()) || u.username.includes(query.toLowerCase())))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, locale())),
    [relationships, users, query, existing],
  );

  const toggle = (id: ID) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < max ? [...s, id] : s));

  const submit = () => {
    if (!selected.length) return;
    const s = useStore.getState();
    const base = existing ? existing.participantIds.filter((p) => p !== s.meId) : [];
    s.createGroupDM([...base, ...selected]);
    close();
    showMainPane();
  };

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={existing ? t('Add friends') : t('Select friends')}
      description={t('You can add up to {count} more friends.', { count: max })}
      footer={
        <Button block onClick={submit} disabled={!selected.length}>
          {selected.length > 1 || existing ? t('Create group') : t('Create DM')}
        </Button>
      }
    >
      <div className="picker-input">
        {selected.map((id) => (
          <button key={id} className="picker-chip" onClick={() => toggle(id)}>
            {users[id]?.displayName}
            <X size={12} />
          </button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={selected.length ? '' : t('Type a username')} autoFocus aria-label={t('Search friends')} />
      </div>
      <div className="picker-list">
        {friends.map((f) => (
          <button key={f.id} className={cn('picker-row', selected.includes(f.id) && 'is-selected')} onClick={() => toggle(f.id)} role="checkbox" aria-checked={selected.includes(f.id)}>
            <Avatar user={f} size={32} status={f.status} />
            <span className="grow truncate">
              <strong>{f.displayName}</strong>
              <span>{f.username}</span>
            </span>
            <span className="picker-check">{selected.includes(f.id) && <Check size={14} strokeWidth={3} />}</span>
          </button>
        ))}
        {friends.length === 0 && <div className="invite-empty">{t('No friends found.')}</div>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Lightbox                                                           */
/* ---------------------------------------------------------------- */

export function Lightbox({ src, name }: { src: string; name: string }) {
  const close = useUI((s) => s.closeModal);
  return (
    <Modal open onClose={close} size="xl" className="lightbox" hideClose>
      <div className="lightbox-inner" onClick={close}>
        <img src={src} alt={name} onClick={(e) => e.stopPropagation()} />
      </div>
      <div className="lightbox-bar">
        <span className="truncate">{name}</span>
        <a className="btn btn-secondary btn-sm" href={src} download={name}>
          <Download size={15} /> {t('Save')}
        </a>
        <a className="btn btn-ghost btn-sm" href={src} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> {t('Original')}
        </a>
        <button className="btn btn-ghost btn-sm" onClick={close}>
          <X size={15} /> {t('Close')}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Custom status                                                      */
/* ---------------------------------------------------------------- */

const STATUS_SUGGESTIONS = [
  { emoji: '🎮', text: tk('Gaming') },
  { emoji: '🎧', text: tk('Music & focus') },
  { emoji: '📺', text: tk('Live on stream') },
  { emoji: '🍕', text: tk('Grabbing food') },
  { emoji: '😴', text: tk('Off soon') },
];

export function CustomStatusModal() {
  const close = useUI((s) => s.closeModal);
  const me = useStore((s) => s.users[s.meId]);
  const { setCustomStatus } = useStore.getState();
  const [emoji, setEmoji] = useState(me.customStatus?.emoji ?? '');
  const [text, setText] = useState(me.customStatus?.text ?? '');
  const save = () => {
    setCustomStatus(text.trim() ? { emoji: emoji || undefined, text: text.trim() } : undefined);
    close();
    toast({ title: text.trim() ? t('Status updated') : t('Status removed') });
  };
  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={t('Set a custom status')}
      description={t('Visible on your profile, in member lists and direct messages.')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button onClick={save}>{t('Save')}</Button>
        </>
      }
    >
      <div className="status-input">
        <EmojiPickerPopover
          side="bottom"
          align="start"
          onPick={(e, meta) => !meta.custom && setEmoji(e)}
          trigger={
            <button className="status-emoji-btn" aria-label={t('Choose emoji')}>
              {emoji ? <span className="emoji">{emoji}</span> : <span className="emoji muted">🙂</span>}
            </button>
          }
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={80}
          placeholder={t('What are you up to?')}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && save()}
          aria-label={t('Status text')}
        />
        {(text || emoji) && (
          <button
            className="icon-btn icon-btn-sm"
            aria-label={t('Clear')}
            onClick={() => {
              setText('');
              setEmoji('');
            }}
          >
            <X />
          </button>
        )}
      </div>
      <div className="status-suggest">
        {STATUS_SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            className="chip"
            onClick={() => {
              setEmoji(s.emoji);
              setText(t(s.text));
            }}
          >
            <span className="emoji">{s.emoji}</span> {t(s.text)}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Quick switcher                                                     */
/* ---------------------------------------------------------------- */

interface QSItem {
  key: string;
  kind: 'channel' | 'dm' | 'user' | 'server' | 'action';
  label: string;
  sub?: string;
  icon: ReactNode;
  run: () => void;
  unread?: boolean;
}

export function QuickSwitcher() {
  const close = useUI((s) => s.closeModal);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const s = useStore();

  const items = useMemo<QSItem[]>(() => {
    const q = query.trim().toLowerCase();
    const prefix = q[0];
    const term = ['#', '@', '*', '>'].includes(prefix) ? q.slice(1) : q;
    const out: QSItem[] = [];
    const go = (fn: () => void) => () => {
      fn();
      close();
      showMainPane();
    };

    if (!prefix || prefix === '#' || !['@', '*', '>'].includes(prefix)) {
      Object.values(s.channels)
        .filter((c) => s.servers[c.serverId] && c.name.toLowerCase().includes(term) && canSee(s, c.id))
        .forEach((c) =>
          out.push({
            key: c.id,
            kind: 'channel',
            label: c.name,
            sub: s.servers[c.serverId]?.name,
            icon: <ChannelIcon type={c.type} size={18} />,
            run: go(() => {
              if (c.type === 'voice') s.joinVoice(c.id);
              s.selectChannel(c.serverId, c.id);
            }),
            unread: (s.readState[c.id] ?? 0) < (s.messages[c.id]?.at(-1)?.createdAt ?? 0),
          }),
        );
    }
    if (!prefix || prefix === '@' || !['#', '*', '>'].includes(prefix)) {
      Object.values(s.dms).forEach((d) => {
        const title = dmTitle(s, d);
        if (!title.toLowerCase().includes(term)) return;
        const other = d.type === 'dm' ? s.users[d.participantIds.find((p) => p !== s.meId)!] : undefined;
        out.push({
          key: d.id,
          kind: 'dm',
          label: title,
          sub: d.type === 'group' ? t('Group') : other?.username,
          icon: other ? <Avatar user={other} size={22} status={other.status} /> : <ChannelIcon type="text" size={18} />,
          run: go(() => s.openDM(d.id)),
        });
      });
      Object.values(s.relationships)
        .filter((r) => r.type === 'friend')
        .map((r) => s.users[r.userId])
        .filter((u) => u && !Object.values(s.dms).some((d) => d.type === 'dm' && d.participantIds.includes(u.id)) && (u.displayName.toLowerCase().includes(term) || u.username.includes(term)))
        .forEach((u) =>
          out.push({ key: `u${u.id}`, kind: 'user', label: u.displayName, sub: u.username, icon: <Avatar user={u} size={22} status={u.status} />, run: go(() => s.openDMWithUser(u.id)) }),
        );
    }
    if (!prefix || prefix === '*' || !['#', '@', '>'].includes(prefix)) {
      s.serverOrder
        .map((id) => s.servers[id])
        .filter((sv) => sv && sv.name.toLowerCase().includes(term))
        .forEach((sv) => out.push({ key: sv.id, kind: 'server', label: sv.name, sub: 'Server', icon: <ServerIcon server={sv} size={22} />, run: go(() => s.selectServer(sv.id)) }));
    }
    if (prefix === '>' || (!prefix && term && (t('settings').toLowerCase().includes(term) || 'settings'.includes(term)))) {
      out.push({ key: 'a-settings', kind: 'action', label: t('Open settings'), icon: <Settings size={18} />, run: () => useUI.getState().openSettings({ kind: 'user', section: 'account' }) });
      out.push({ key: 'a-appearance', kind: 'action', label: t('Change appearance'), icon: <Settings size={18} />, run: () => useUI.getState().openSettings({ kind: 'user', section: 'appearance' }) });
      out.push({ key: 'a-profile', kind: 'action', label: t('Edit profile'), icon: <Settings size={18} />, run: () => useUI.getState().openSettings({ kind: 'user', section: 'profile' }) });
      out.push({ key: 'a-redeem', kind: 'action', label: t('Redeem code'), icon: <Settings size={18} />, run: () => useUI.getState().openSettings({ kind: 'user', section: 'redeem' }) });
      out.push({ key: 'a-language', kind: 'action', label: t('Change language'), icon: <Settings size={18} />, run: () => useUI.getState().openSettings({ kind: 'user', section: 'language' }) });
    }
    if (!q) {
      // Without a query: unread first, then recent DMs.
      return out.sort((a, b) => Number(!!b.unread) - Number(!!a.unread)).slice(0, 10);
    }
    return out.sort((a, b) => Number(b.label.toLowerCase().startsWith(term)) - Number(a.label.toLowerCase().startsWith(term))).slice(0, 14);
  }, [query, s, close]);

  const run = (i: number) => items[i]?.run();

  return (
    <Modal open onClose={close} size="lg" className="qs" hideClose>
      <div className="qs-inner">
        <h2 className="qs-title">{t('Find a conversation')}</h2>
        <div className="qs-input">
          <Search size={20} />
          <input
            value={query}
            autoFocus
            placeholder={t('Where would you like to go?')}
            aria-label={t('Quick switcher')}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(index);
              }
            }}
          />
        </div>
        <div className="qs-label">{query ? t('Results') : t('Recent & unread')}</div>
        <div className="qs-list" role="listbox">
          {items.length === 0 && <div className="qs-empty">{t('Nothing found. Try another term.')}</div>}
          {items.map((it, i) => (
            <button
              key={it.key}
              role="option"
              aria-selected={i === index}
              className={cn('qs-item', i === index && 'is-active', it.unread && 'is-unread')}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(i)}
            >
              <span className="qs-icon">{it.icon}</span>
              <span className="qs-text truncate">{it.label}</span>
              {it.sub && <span className="qs-sub truncate">{it.sub}</span>}
              {it.unread && <span className="qs-dot" />}
            </button>
          ))}
        </div>
        <div className="qs-foot">
          <span>
            {tx('{tip} Start with {hash} for channels, {at} for people, {star} for servers or {gt} for actions.', {
              tip: <strong>{t('Tip:')}</strong>,
              hash: <code>#</code>,
              at: <code>@</code>,
              star: <code>*</code>,
              gt: <code>&gt;</code>,
            })}
          </span>
        </div>
      </div>
    </Modal>
  );
}
