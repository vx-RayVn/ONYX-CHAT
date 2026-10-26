import { useMemo } from 'react';
import { Popover } from 'radix-ui';
import { AtSign, Inbox } from 'lucide-react';
import { useStore } from '../../store/store';
import { CLOUD } from '../../backend/config';
import { useUI } from '../../store/ui';
import { isMention, memberDisplayName, canSee } from '../../store/selectors';
import { cn, formatMessageTime } from '../../lib/utils';
import { t } from '../../i18n';
import { GemMark, OnyxServicesLogo } from '../ui/icons';
import { IconButton } from '../ui/Button';
import { EmptyState, EmptyArt } from '../ui/misc';
import { Avatar } from '../ui/Avatar';
import { MessageContent } from '../chat/MessageContent';
import { Tooltip } from '../ui/Tooltip';
import { FEATURES } from '../../config/features';

function MentionsInbox() {
  const messages = useStore((s) => s.messages);
  const channels = useStore((s) => s.channels);
  const servers = useStore((s) => s.servers);
  const users = useStore((s) => s.users);

  const items = useMemo(() => {
    const state = useStore.getState();
    const out: { channelId: string; serverId: string; messageId: string; authorId: string; content: string; createdAt: number }[] = [];
    Object.values(channels).forEach((c) => {
      if (!canSee(state, c.id)) return;
      (messages[c.id] ?? []).forEach((m) => {
        if (m.type === 'default' && isMention(state, m)) out.push({ channelId: c.id, serverId: c.serverId, messageId: m.id, authorId: m.authorId, content: m.content, createdAt: m.createdAt });
      });
    });
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  }, [messages, channels]);

  const jump = (serverId: string, channelId: string, messageId: string) => {
    useStore.getState().selectChannel(serverId, channelId);
    useUI.getState().setMobilePanel('main');
    window.setTimeout(() => useUI.getState().flash(messageId), 60);
  };

  return (
    <div className="inbox">
      <div className="inbox-head">
        <AtSign size={18} />
        <span>{t('Mentions')}</span>
      </div>
      <div className="inbox-list">
        {items.length === 0 && <EmptyState compact art={<EmptyArt icon={<Inbox />} />} title={t('All caught up')} body={t('Messages that mention you will appear here.')} />}
        {items.map((it) => {
          const server = servers[it.serverId];
          const channel = channels[it.channelId];
          const author = users[it.authorId];
          return (
            <Popover.Close asChild key={it.messageId}>
              <button className="inbox-item" onClick={() => jump(it.serverId, it.channelId, it.messageId)}>
                <div className="inbox-where">
                  <span className="truncate">{server?.name}</span>
                  <span className="inbox-dot">·</span>
                  <span className="truncate">#{channel?.name}</span>
                </div>
                <div className="inbox-msg">
                  <Avatar user={author} size={32} />
                  <div className="inbox-msg-body">
                    <div className="inbox-msg-head">
                      <strong>{memberDisplayName({ servers, users }, it.authorId, it.serverId)}</strong>
                      <span>{formatMessageTime(it.createdAt)}</span>
                    </div>
                    <div className="inbox-msg-text">
                      <MessageContent content={it.content} serverId={it.serverId} inline />
                    </div>
                  </div>
                </div>
              </button>
            </Popover.Close>
          );
        })}
      </div>
    </div>
  );
}

export function TopBar() {
  const view = useStore((s) => s.view);
  const goHome = useStore((s) => s.goHome);

  return (
      <div className="topbar-actions header-actions">
        {!CLOUD && <Tooltip content={t('What already works in this version')}>
          <button
            className="demo-pill"
            onClick={() =>
              useUI.getState().openModal({
                type: 'preview',
                icon: 'link',
                title: t('Local preview'),
                body: t(
                  'This version of ONYX runs entirely in your browser. Messages, servers, profiles and settings are stored locally and survive a reload – but only you can see them.\n\nSign-in, real communication between users, voice connections and payments will be connected in the next phase. You can reset the demo at any time under Settings › Demo & Data.',
                ),
              })
            }
          >
            <span className="demo-dot" />
            <span>{t('Local demo')}</span>
          </button>
        </Tooltip>}
        <Popover.Root>
          <Tooltip content={t('Mentions')} side="bottom">
            <Popover.Trigger asChild>
              <IconButton label={t('Mentions')} tooltip={false}>
                <Inbox />
              </IconButton>
            </Popover.Trigger>
          </Tooltip>
          <Popover.Portal>
            <Popover.Content className="popover inbox-pop" align="end" sideOffset={8} collisionPadding={12}>
              <MentionsInbox />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <IconButton
          label={t('OnyxServices shop')}
          tooltipSide="bottom"
          active={view.kind === 'home' && view.page === 'shop'}
          onClick={() => {
            goHome('shop');
            useUI.getState().setMobilePanel('main');
          }}
        >
          <OnyxServicesLogo size={22} className="topbar-os-logo" />
        </IconButton>
        {FEATURES.onyxPlus && <button
          className={cn('plus-pill', view.kind === 'home' && view.page === 'plus' && 'is-active')}
          aria-label="ONYX Plus"
          onClick={() => {
            goHome('plus');
            useUI.getState().setMobilePanel('main');
          }}
        >
          <GemMark size={16} />
          <span>Plus</span>
        </button>}
      </div>
  );
}
