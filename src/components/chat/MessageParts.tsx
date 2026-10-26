import { memo } from 'react';
import { externalHttpUrl } from '../../lib/externalUrl';
import { Download, ExternalLink, FileArchive, FilePlay, FileText, FileMusic, Maximize2, FaceSlightlySmilingPlus } from 'lucide-react';
import type { Attachment, Embed, ID, Reaction } from '../../types';
import { useStore } from '../../store/store';
import { useUI, previewNotice } from '../../store/ui';
import { emojiSrc, memberDisplayName } from '../../store/selectors';
import { BRAND } from '../../config/brand';
import { cn, formatBytes, listNames } from '../../lib/utils';
import { t } from '../../i18n';
import { MessageContent } from './MessageContent';
import { Tooltip } from '../ui/Tooltip';
import { EmojiPickerPopover } from './EmojiPicker';
import { AudioPlayer } from './AudioPlayer';
import { CLOUD } from '../../backend/config';
import { downloadUrl, useAttachmentUrl } from '../../backend/media';

/* ---------------------------------------------------------------- */
/* Attachments                                                        */
/* ---------------------------------------------------------------- */

function fileIcon(a: Attachment) {
  if (a.kind === 'video') return <FilePlay />;
  if (a.kind === 'audio') return <FileMusic />;
  if (/\.(zip|rar|7z|tar|gz)$/i.test(a.name)) return <FileArchive />;
  return <FileText />;
}

/** One image: the local preview while sending, afterwards a signed link from Storage. */
function AttachmentImage({ a, count }: { a: Attachment; count: number }) {
  const url = useAttachmentUrl(a);
  const ratio = a.width && a.height ? a.width / a.height : 16 / 9;
  const maxW = count > 1 ? 260 : 440;
  const maxH = count > 1 ? 220 : 340;
  let w = Math.min(maxW, a.width ?? maxW);
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  const open = () => url && useUI.getState().openModal({ type: 'lightbox', src: url, name: a.name });
  return (
    <div className="att-image" style={count === 1 ? { width: w, aspectRatio: `${ratio}` } : undefined}>
      <button className="att-image-btn" onClick={open} aria-label={t('Enlarge {name}', { name: a.name })}>
        {url ? <img src={url} alt={a.name} loading="lazy" draggable={false} /> : <span className="att-image-loading" aria-hidden />}
      </button>
      <div className="att-image-tools">
        <Tooltip content={t('Enlarge')}>
          <button onClick={open} aria-label={t('Enlarge')}>
            <Maximize2 size={16} />
          </button>
        </Tooltip>
        <Tooltip content={t('Download')}>
          <button onClick={() => void download(a, url)} aria-label={t('Download')}>
            <Download size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/** Voice message or audio file stored online: the player gets a signed link. */
function CloudAudio({ a }: { a: Attachment }) {
  const url = useAttachmentUrl(a);
  if (url === undefined) return <div className="att-file att-loading">{t('Loading …')}</div>;
  return <AudioPlayer attachment={a} src={url ?? undefined} />;
}

/** Saves an attachment under its original name. */
async function download(a: Attachment, local?: string | null) {
  const href = a.path && CLOUD ? await downloadUrl(a.path, a.name) : local;
  if (!href) return;
  const link = document.createElement('a');
  link.href = href;
  link.download = a.name;
  link.rel = 'noopener';
  link.click();
}

export const Attachments = memo(function Attachments({ items }: { items: Attachment[] }) {
  const images = items.filter((a) => a.kind === 'image' && (a.url || a.path));
  const audios = items.filter((a) => a.kind === 'audio' && (a.localKey || a.path));
  const files = items.filter((a) => !images.includes(a) && !audios.includes(a));

  return (
    <div className="attachments">
      {images.length > 0 && (
        <div className={cn('att-images', images.length > 1 && 'is-grid', images.length === 3 && 'is-three')}>
          {images.map((a) => (
            <AttachmentImage key={a.id} a={a} count={images.length} />
          ))}
        </div>
      )}
      {audios.map((a) => (a.localKey ? <AudioPlayer key={a.id} attachment={a} /> : <CloudAudio key={a.id} a={a} />))}
      {files.map((a) => {
        const available = !a.unavailable && (!!a.path || !!a.url);
        return (
          <div key={a.id} className="att-file">
            <span className={cn('att-file-icon', `kind-${a.kind}`)}>{fileIcon(a)}</span>
            <div className="att-file-text">
              <span className="att-file-name truncate">{a.name}</span>
              <span className="att-file-meta">
                {formatBytes(a.size)}
                {!available && <> · {CLOUD ? t('Uploading …') : t('Preview – file storage follows')}</>}
              </span>
            </div>
            <Tooltip content={available ? t('Download') : CLOUD ? t('Uploading …') : t('Downloads are enabled once file storage exists')}>
              <span>
                <button className="icon-btn" disabled={!available} aria-label={t('Download')} onClick={() => void download(a, a.url)}>
                  <Download />
                </button>
              </span>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
});

/* ---------------------------------------------------------------- */
/* Embeds                                                             */
/* ---------------------------------------------------------------- */

export const EmbedView = memo(function EmbedView({ embed, serverId }: { embed: Embed; serverId?: ID | null }) {
  const titleUrl = externalHttpUrl(embed.url);
  const actionUrl = externalHttpUrl(embed.action?.url ?? BRAND.shop.url);
  const action = () => {
    if (actionUrl) window.open(actionUrl, '_blank', 'noopener,noreferrer');
    else previewNotice(t('Shop link'), t('The shop link is configured in src/config/brand.ts. Once it is set, this button opens the OnyxServices shop in a new tab.'), 'shop');
  };
  return (
    <div className="embed" style={{ ['--embed-color' as string]: embed.color ?? 'var(--line-strong)' }}>
      <div className="embed-main">
        {embed.provider && <div className="embed-provider">{embed.provider}</div>}
        {embed.author && <div className="embed-author">{embed.author}</div>}
        {embed.title && (
          <div className="embed-title" dir="auto">
            {titleUrl ? (
              <a href={titleUrl} target="_blank" rel="noopener noreferrer">
                {embed.title}
              </a>
            ) : (
              embed.title
            )}
          </div>
        )}
        {embed.description && (
          <div className="embed-desc" dir="auto">
            <MessageContent content={embed.description} serverId={serverId} />
          </div>
        )}
        {embed.fields && embed.fields.length > 0 && (
          <div className="embed-fields">
            {embed.fields.map((f, i) => (
              <div key={i} className={cn('embed-field', f.inline && 'is-inline')}>
                <div className="embed-field-name" dir="auto">
                  <MessageContent content={f.name} serverId={serverId} inline />
                </div>
                <div className="embed-field-value" dir="auto">
                  <MessageContent content={f.value} serverId={serverId} />
                </div>
              </div>
            ))}
          </div>
        )}
        {embed.image && (
          <button className="embed-image" onClick={() => useUI.getState().openModal({ type: 'lightbox', src: embed.image!, name: embed.title ?? t('Image') })}>
            <img src={embed.image} alt="" loading="lazy" draggable={false} />
          </button>
        )}
        {embed.action && actionUrl && (
          <button className="btn btn-primary btn-sm embed-action" onClick={action}>
            {embed.action.label === 'Open shop' ? t('Open shop') : embed.action.label}
            <ExternalLink size={14} />
          </button>
        )}
        {embed.footer && (
          <div className="embed-footer" dir="auto">
            {embed.footer}
          </div>
        )}
      </div>
      {embed.thumbnail && <img className="embed-thumb" src={embed.thumbnail} alt="" />}
    </div>
  );
});

/* ---------------------------------------------------------------- */
/* Reactions                                                          */
/* ---------------------------------------------------------------- */

export function ReactionEmoji({ emoji }: { emoji: string }) {
  const custom = emoji.match(/^<a?:(\w+):([\w-]+)>$/);
  const src = useStore((s) => (custom ? emojiSrc(s, custom[2]) : null));
  if (custom) return src ? <img className="reaction-img" src={src} alt={`:${custom[1]}:`} /> : <span>:{custom[1]}:</span>;
  return <span className="reaction-char">{emoji}</span>;
}

function ReactionPill({ reaction, channelId, messageId, serverId }: { reaction: Reaction; channelId: ID; messageId: ID; serverId?: ID | null }) {
  const meId = useStore((s) => s.meId);
  const label = useStore((s) => {
    const mineFirst = [...reaction.userIds].sort((a, b) => (a === s.meId ? -1 : b === s.meId ? 1 : 0));
    return listNames(
      mineFirst.map((id) => (id === s.meId ? t('You') : memberDisplayName(s, id, serverId))),
      3,
    );
  });
  const toggle = useStore((s) => s.toggleReaction);
  const mine = reaction.userIds.includes(meId);
  const custom = reaction.emoji.match(/^<a?:(\w+):/);
  return (
    <Tooltip
      content={
        <span className="reaction-tip">
          <ReactionEmoji emoji={reaction.emoji} />
          <span>{t('{names} reacted with {emoji}', { names: label, emoji: custom ? `:${custom[1]}:` : reaction.emoji })}</span>
        </span>
      }
      delay={250}
    >
      <button className={cn('reaction', mine && 'is-mine')} onClick={() => toggle(channelId, messageId, reaction.emoji)} aria-pressed={mine}>
        <ReactionEmoji emoji={reaction.emoji} />
        <span className="reaction-count tnum">{reaction.userIds.length}</span>
      </button>
    </Tooltip>
  );
}

export const Reactions = memo(function Reactions({
  reactions,
  channelId,
  messageId,
  serverId,
  canReact,
}: {
  reactions: Reaction[];
  channelId: ID;
  messageId: ID;
  serverId?: ID | null;
  canReact: boolean;
}) {
  const toggle = useStore((s) => s.toggleReaction);
  return (
    <div className="reactions">
      {reactions.map((r) => (
        <ReactionPill key={r.emoji} reaction={r} channelId={channelId} messageId={messageId} serverId={serverId} />
      ))}
      {canReact && (
        <EmojiPickerPopover
          side="top"
          align="start"
          onPick={(e) => toggle(channelId, messageId, e)}
          trigger={
            <button className="reaction reaction-add" aria-label={t('Add reaction')}>
              <FaceSlightlySmilingPlus size={17} />
            </button>
          }
        />
      )}
    </div>
  );
});
