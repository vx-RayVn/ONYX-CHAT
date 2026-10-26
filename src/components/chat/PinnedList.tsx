import { useMemo } from 'react';
import { Pin, PinOff } from 'lucide-react';
import type { ID, Message } from '../../types';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { memberDisplayName } from '../../store/selectors';
import { formatMessageTime } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { EmptyArt, EmptyState } from '../ui/misc';
import { IconButton } from '../ui/Button';
import { MessageContent } from './MessageContent';
import { Popover } from 'radix-ui';
import { t } from '../../i18n';

const EMPTY: Message[] = [];

export function MessagePreviewCard({ m, serverId, action }: { m: Message; serverId: ID | null; action?: React.ReactNode }) {
  const author = useStore((s) => s.users[m.authorId]);
  const name = useStore((s) => memberDisplayName(s, m.authorId, serverId));
  return (
    <div className="preview-card">
      <Avatar user={author} size={36} />
      <div className="preview-card-body">
        <div className="preview-card-head">
          <strong>{name}</strong>
          <span>{formatMessageTime(m.createdAt)}</span>
        </div>
        {m.content && (
          <div className="preview-card-text" dir="auto">
            <MessageContent content={m.content} serverId={serverId} />
          </div>
        )}
        {m.attachments.length > 0 && <div className="preview-card-att">📎 {m.attachments.map((a) => a.name).join(', ')}</div>}
        {!m.content && m.embeds[0]?.title && <div className="preview-card-att">{m.embeds[0].title}</div>}
      </div>
      {action}
    </div>
  );
}

export function PinnedList({ channelId }: { channelId: ID }) {
  const messages = useStore((s) => s.messages[channelId] ?? EMPTY);
  const serverId = useStore((s) => s.channels[channelId]?.serverId ?? null);
  const togglePin = useStore((s) => s.togglePin);
  const pinned = useMemo(() => messages.filter((m) => m.pinned).reverse(), [messages]);
  const flash = useUI((s) => s.flash);

  return (
    <div className="pins">
      <div className="pop-head">
        <Pin size={18} />
        <span>{t('Pinned messages')}</span>
      </div>
      <div className="pins-list">
        {pinned.length === 0 ? (
          <EmptyState compact art={<EmptyArt icon={<Pin />} />} title={t('Nothing pinned yet')} body={t('Pin important messages from the message menu – they will show up here.')} />
        ) : (
          pinned.map((m) => (
            <div key={m.id} className="pins-item">
              <Popover.Close asChild>
                <button className="pins-jump" onClick={() => flash(m.id)}>
                  {t('Jump')}
                </button>
              </Popover.Close>
              <MessagePreviewCard
                m={m}
                serverId={serverId}
                action={
                  <IconButton label={t('Unpin')} size="sm" className="pins-unpin" onClick={() => togglePin(channelId, m.id)}>
                    <PinOff />
                  </IconButton>
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
