import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Popover } from 'radix-ui';
import { Apple, Clock, FaceSlightlySmiling, Flag, Gamepad2, Heart, Leaf, Lightbulb, Plane, Search, X } from 'lucide-react';
import { useStore } from '../../store/store';
import { allCustomEmojis, type AvailableEmoji } from '../../store/selectors';
import { t } from '../../i18n';
import { DEFAULT_FREQUENT, EMOJIS, EMOJI_CATEGORIES, EMOJI_BY_CHAR, searchEmojis, type EmojiCategoryId } from '../../lib/emoji';
import { cn } from '../../lib/utils';
import { ServerIcon } from '../layout/ServerRail';

const CAT_ICON: Record<EmojiCategoryId, ReactElement> = {
  people: <FaceSlightlySmiling />,
  nature: <Leaf />,
  food: <Apple />,
  activity: <Gamepad2 />,
  travel: <Plane />,
  objects: <Lightbulb />,
  symbols: <Heart />,
  flags: <Flag />,
};

interface Hover {
  display: ReactElement;
  name: string;
  hint?: string;
}

interface PickerProps {
  onPick: (emoji: string, meta: { custom: boolean; name: string }) => void;
  onClose?: () => void;
}

export function EmojiPicker({ onPick }: PickerProps) {
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<Hover | null>(null);
  const servers = useStore((s) => s.servers);
  const serverOrder = useStore((s) => s.serverOrder);
  const freq = useStore((s) => s.frequentEmojis);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState('frequent');

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, []);

  const customs = useMemo(() => allCustomEmojis({ servers, serverOrder }), [servers, serverOrder]);
  const customByServer = useMemo(() => {
    const map = new Map<string, AvailableEmoji[]>();
    customs.forEach((e) => map.set(e.serverId, [...(map.get(e.serverId) ?? []), e]));
    return [...map.entries()];
  }, [customs]);

  const frequent = useMemo(() => {
    const ranked = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([e]) => e);
    return [...new Set([...ranked, ...DEFAULT_FREQUENT])].slice(0, 16);
  }, [freq]);

  const results = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase().replace(/:/g, '');
    return {
      custom: customs.filter((e) => e.name.toLowerCase().includes(q)),
      unicode: searchEmojis(q, 80),
    };
  }, [query, customs]);

  const renderFrequent = (e: string) => {
    const custom = e.match(/^<a?:(\w+):([\w-]+)>$/);
    if (custom) {
      const ce = customs.find((x) => x.id === custom[2]);
      if (!ce) return null;
      return renderCustom(ce);
    }
    return renderUnicode(e, EMOJI_BY_CHAR.get(e)?.name ?? '');
  };

  const renderUnicode = (char: string, name: string) => (
    <button
      key={char}
      className="ep-cell"
      onClick={() => onPick(char, { custom: false, name })}
      onMouseEnter={() => setHover({ display: <span className="ep-preview-emoji">{char}</span>, name: `:${name}:` })}
      aria-label={name.replace(/_/g, ' ')}
    >
      <span className="ep-char">{char}</span>
    </button>
  );

  const renderCustom = (e: AvailableEmoji) => (
    <button
      key={e.id}
      className="ep-cell"
      onClick={() => onPick(`<:${e.name}:${e.id}>`, { custom: true, name: e.name })}
      onMouseEnter={() =>
        setHover({ display: <img src={e.src} alt="" className="ep-preview-img" />, name: `:${e.name}:`, hint: t('from {name}', { name: servers[e.serverId]?.name || t('a server') }) })
      }
      aria-label={e.name}
    >
      <img src={e.src} alt="" className="ep-img" draggable={false} />
    </button>
  );

  const jump = (id: string) => {
    const el = scrollRef.current?.querySelector(`[data-section="${id}"]`) as HTMLElement | null;
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 4, behavior: 'smooth' });
  };

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section]'));
    let current = sections[0]?.dataset.section ?? 'frequent';
    for (const s of sections) if (s.offsetTop - root.scrollTop <= 24) current = s.dataset.section!;
    setActiveSection(current);
  };

  return (
    <div className="emoji-picker" onMouseLeave={() => setHover(null)}>
      <div className="ep-top">
        <div className="ep-search">
          <Search size={16} />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search emoji – e.g. fire, gg, laugh')} aria-label={t('Search emoji')} />
          {query && (
            <button className="ep-clear" onClick={() => setQuery('')} aria-label={t('Clear search')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="ep-body">
        {!results && (
          <nav className="ep-rail scroll-thin" aria-label={t('Categories')}>
            <button className={cn('ep-rail-btn', activeSection === 'frequent' && 'is-active')} onClick={() => jump('frequent')} aria-label={t('Frequently used')}>
              <Clock />
            </button>
            {customByServer.map(([sid]) => (
              <button key={sid} className={cn('ep-rail-btn ep-rail-server', activeSection === sid && 'is-active')} onClick={() => jump(sid)} aria-label={servers[sid]?.name}>
                <ServerIcon server={servers[sid]} size={24} />
              </button>
            ))}
            <span className="ep-rail-sep" />
            {EMOJI_CATEGORIES.map((c) => (
              <button key={c.id} className={cn('ep-rail-btn', activeSection === c.id && 'is-active')} onClick={() => jump(c.id)} aria-label={t(c.label)}>
                {CAT_ICON[c.id]}
              </button>
            ))}
          </nav>
        )}
        <div className="ep-scroll" ref={scrollRef} onScroll={onScroll}>
          {results ? (
            <>
              {results.custom.length > 0 && (
                <section>
                  <h4 className="ep-head">{t('Custom emojis')}</h4>
                  <div className="ep-grid">{results.custom.map(renderCustom)}</div>
                </section>
              )}
              <section>
                <h4 className="ep-head">{t('Search results')}</h4>
                {results.unicode.length === 0 && results.custom.length === 0 ? (
                  <div className="ep-empty">{t('No emoji found.')}</div>
                ) : (
                  <div className="ep-grid">{results.unicode.map((e) => renderUnicode(e.char, e.name))}</div>
                )}
              </section>
            </>
          ) : (
            <>
              <section data-section="frequent">
                <h4 className="ep-head">{t('Frequently used')}</h4>
                <div className="ep-grid">{frequent.map(renderFrequent)}</div>
              </section>
              {customByServer.map(([sid, list]) => (
                <section key={sid} data-section={sid}>
                  <h4 className="ep-head">
                    <ServerIcon server={servers[sid]} size={16} />
                    <span className="truncate">{servers[sid]?.name}</span>
                  </h4>
                  <div className="ep-grid">{list.map(renderCustom)}</div>
                </section>
              ))}
              {EMOJI_CATEGORIES.map((c) => (
                <section key={c.id} data-section={c.id}>
                  <h4 className="ep-head">{t(c.label)}</h4>
                  <div className="ep-grid">{EMOJIS.filter((e) => e.category === c.id).map((e) => renderUnicode(e.char, e.name))}</div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="ep-foot">
        {hover ? (
          <>
            {hover.display}
            <div className="ep-foot-text">
              <span className="ep-foot-name">{hover.name}</span>
              {hover.hint && <span className="ep-foot-hint">{hover.hint}</span>}
            </div>
          </>
        ) : (
          <span className="ep-foot-hint">{t('Emojis from your servers work in every chat – free for everyone.')}</span>
        )}
      </div>
    </div>
  );
}

interface PopoverProps extends PickerProps {
  trigger: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  closeOnPick?: boolean;
}

export function EmojiPickerPopover({ trigger, onPick, side = 'top', align = 'end', open, onOpenChange, closeOnPick = true }: PopoverProps) {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = onOpenChange ?? setInner;
  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover ep-pop" side={side} align={align} sideOffset={8} collisionPadding={12} onOpenAutoFocus={(e) => e.preventDefault()}>
          <EmojiPicker
            onPick={(e, meta) => {
              onPick(e, meta);
              if (closeOnPick) setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
