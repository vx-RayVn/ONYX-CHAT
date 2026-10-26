import { ServerTagPicker } from '../profile/ServerTag';
/**
 * Profile Studio: free personalisation with one clear gallery per area and a
 * live preview. Hovering (or focusing) a tile tries it on in the preview,
 * clicking applies it everywhere (chat, member list, popouts, full profile).
 * Every design is available right away – collections are only a quiet label.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, Crop, Frame, ImagePlus, Palette, Plus, RotateCcw, Sparkles, Star, Trash, Type, Upload, UserRound, Image as ImageIcon, Zap, X } from 'lucide-react';
import type { AvatarSource, BorderLine, NameStyle, User } from '../../types';
import { useStore } from '../../store/store';
import { toast, useUI } from '../../store/ui';
import { useMe } from '../../store/selectors';
import {
  BORDER_LINE_COLORS,
  COLLECTION_BY_ID,
  DEFAULT_NAME_STYLE,
  NAME_COLORS,
  NAME_EFFECTS,
  NAME_FONTS,
  NAME_PRESETS,
  PALETTES,
  itemsOf,
  type CosmeticItem,
  type CosmeticType,
} from '../../data/cosmetics';
import { prepareProfileImage, pickFile, UploadError } from '../../lib/image';
import { cn, formatMessageTime } from '../../lib/utils';
import { t } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Segmented, Switch, TextArea, TextField } from '../ui/Field';
import { FreeTag } from '../ui/icons';
import { ColorPicker } from '../ui/ColorPicker';
import { ProfileCard } from '../profile/ProfileCard';
import { activityLine } from '../chat/MemberList';
import { StyledName, isDefaultStyle } from '../cosmetics/StyledName';
import { ProfileEffect } from '../cosmetics/Effects';
import { BorderLine as BorderLineArt, ProfileFrame } from '../cosmetics/Frames';
import { SettingsHeader, SettingsSection } from './SettingsLayout';

type StudioTab = 'profile' | 'name' | 'decoration' | 'frame' | 'banner' | 'effect' | 'colors';
type Patch = Partial<User>;
type Preview = (p: Patch | null) => void;

const TABS: StudioTab[] = ['profile', 'name', 'decoration', 'frame', 'banner', 'effect', 'colors'];

export const DEFAULT_BORDER_LINE: BorderLine = {
  avatar: false,
  card: false,
  color: '#10b981',
  color2: '#6ee7b7',
  speed: 'normal',
};

/* ---------------------------------------------------------------- */
/* Gallery                                                            */
/* ---------------------------------------------------------------- */

interface GalleryProps {
  type: CosmeticType;
  isActive: (item: CosmeticItem) => boolean;
  apply: (item: CosmeticItem | null) => void;
  patchFor: (item: CosmeticItem | null) => Patch;
  renderArt: (item: CosmeticItem) => ReactNode;
  onPreview: Preview;
  /** Label of the "none" tile; omit for galleries without one. */
  noneLabel?: string;
  noneActive?: boolean;
  tileClass?: string;
  title?: string;
}

function Gallery({ type, isActive, apply, patchFor, renderArt, onPreview, noneLabel, noneActive, tileClass, title }: GalleryProps) {
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const [filter, setFilter] = useState<'all' | 'favorites' | 'animated'>('all');
  const items = itemsOf(type);
  const visible = items.filter((i) => (filter === 'favorites' ? favorites.includes(`${type}:${i.id}`) : filter === 'animated' ? i.animated : true));
  const hasAnimated = items.some((i) => i.animated) && items.some((i) => !i.animated);

  const tile = (item: CosmeticItem) => {
    const key = `${type}:${item.id}`;
    const active = isActive(item);
    const fav = favorites.includes(key);
    const c = COLLECTION_BY_ID[item.collection];
    return (
      <div key={key} className={cn('studio-tile anim-host', tileClass, active && 'is-active')}>
        <button
          className="studio-tile-btn"
          onMouseEnter={() => onPreview(patchFor(item))}
          onFocus={() => onPreview(patchFor(item))}
          onMouseLeave={() => onPreview(null)}
          onBlur={() => onPreview(null)}
          onClick={() => apply(item)}
          aria-pressed={active}
          aria-label={`${t(item.name)} · ${t(c.name)}`}
        >
          <span className="studio-tile-art">{renderArt(item)}</span>
          <span className="studio-tile-name truncate">{t(item.name)}</span>
          <span className="studio-tile-meta" title={t('Collection: {name}', { name: t(c.name) })}>
            <span
              className="studio-tile-dot"
              style={{
                background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})`,
              }}
            />
            <span className="truncate">{t(c.name)}</span>
            {item.animated && <Zap size={10} className="studio-tile-anim" aria-label={t('Animated')} />}
          </span>
          {active && (
            <span className="preset-check">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </button>
        <button className={cn('studio-fav', fav && 'is-on')} onClick={() => toggleFavorite(key)} aria-pressed={fav} aria-label={fav ? t('Remove from favorites') : t('Add to favorites')}>
          <Star size={13} />
        </button>
      </div>
    );
  };

  return (
    <section className="gallery">
      <div className="gallery-head">
        {title && <h3 className="gallery-title">{title}</h3>}
        <div className="gallery-filter" role="radiogroup" aria-label={t('Filter')}>
          {(['all', 'favorites', ...(hasAnimated ? (['animated'] as const) : [])] as const).map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} className={cn('chip chip-sm', filter === f && 'is-active')} onClick={() => setFilter(f)}>
              {f === 'favorites' && <Star size={11} />}
              {f === 'animated' && <Zap size={11} />}
              {f === 'all' ? t('All') : f === 'favorites' ? t('Favorites') : t('Animated')}
            </button>
          ))}
        </div>
      </div>
      <div className="studio-grid">
        {noneLabel && filter === 'all' && (
          <button
            className={cn('studio-tile studio-none', tileClass, noneActive && 'is-active')}
            onClick={() => apply(null)}
            onMouseEnter={() => onPreview(patchFor(null))}
            onFocus={() => onPreview(patchFor(null))}
            onMouseLeave={() => onPreview(null)}
            onBlur={() => onPreview(null)}
            aria-pressed={noneActive}
          >
            <span className="studio-tile-art">
              <X size={22} />
            </span>
            <span className="studio-tile-name">{noneLabel}</span>
          </button>
        )}
        {visible.map(tile)}
      </div>
      {visible.length === 0 && <div className="studio-empty">{filter === 'favorites' ? t('No favorites yet – tap the star on any item.') : t('Nothing here yet.')}</div>}
    </section>
  );
}

/* Mini profile card used in frame / effect tiles */
function MiniCard({ children }: { children?: ReactNode }) {
  return (
    <span className="mini-card">
      <span className="mini-card-banner" />
      <span className="mini-card-av" />
      <span className="mini-card-line" />
      <span className="mini-card-line is-short" />
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Uploads                                                            */
/* ---------------------------------------------------------------- */

function useImageUpload() {
  const [busy, setBusy] = useState<'avatar' | 'banner' | null>(null);
  const upload = async (kind: 'avatar' | 'banner') => {
    const [file] = await pickFile('image/png,image/jpeg,image/webp,image/gif');
    if (!file) return;
    setBusy(kind);
    try {
      const img = await prepareProfileImage(file, kind);
      useUI.getState().openModal({
        type: 'crop',
        kind,
        src: img.src,
        poster: img.poster,
        animated: img.animated,
      });
    } catch (e) {
      toast({
        tone: 'danger',
        title: t('Image not applied'),
        body: e instanceof UploadError ? e.message : t('The file could not be read.'),
      });
    } finally {
      setBusy(null);
    }
  };
  return { busy, upload };
}

/* ---------------------------------------------------------------- */
/* Border Line (lives in Decoration and Profile frame)                */
/* ---------------------------------------------------------------- */

function BorderLinePanel({ target }: { target: 'avatar' | 'card' }) {
  const me = useMe();
  const update = useStore((s) => s.updateMe);
  const bl = me.borderLine ?? DEFAULT_BORDER_LINE;
  const set = (patch: Partial<BorderLine>) => update({ borderLine: { ...bl, ...patch } });
  const on = bl[target];
  const demo = { ...bl, hoverOnly: false };
  const presetActive = BORDER_LINE_COLORS.some((c) => c.colors[0] === bl.color && c.colors[1] === bl.color2);

  return (
    <div className={cn('bl-panel anim-host', on && 'is-on')}>
      <div className="bl-panel-head">
        <span className={cn('bl-panel-demo', `is-${target}`)} aria-hidden>
          {target === 'avatar' ? (
            <Avatar
              user={{
                ...me,
                avatarDecoration: undefined,
                borderLine: { ...demo, avatar: true },
              }}
              size={44}
              frame
            />
          ) : (
            <span className="bl-panel-card">
              <BorderLineArt style={{ ...demo, card: true }} shape="rect" />
            </span>
          )}
        </span>
        <div className="bl-panel-text">
          <strong>{t('Border Line')}</strong>
          <span>
            {target === 'avatar'
              ? t('An animated light that runs around your avatar – combines with any decoration.')
              : t('An animated light along the edge of your profile card – combines with any frame.')}
          </span>
        </div>
        <Switch checked={on} onChange={(v) => set({ [target]: v })} label={target === 'avatar' ? t('Border Line around the avatar') : t('Border Line around the profile card')} />
      </div>
      {on && (
        <div className="bl-panel-body">
          <div className="bl-swatches" role="radiogroup" aria-label={t('Color')}>
            {BORDER_LINE_COLORS.map((c, i) => {
              const active = bl.color === c.colors[0] && bl.color2 === c.colors[1];
              return (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={active}
                  className={cn('bl-swatch', active && 'is-active')}
                  style={{
                    ['--a' as string]: c.colors[0],
                    ['--b' as string]: c.colors[1],
                  }}
                  onClick={() => set({ color: c.colors[0], color2: c.colors[1] })}
                  title={i === 0 ? `${t(c.name)} · ${t('ONYX default')}` : t(c.name)}
                >
                  <span className="bl-swatch-dot" />
                  <span className="bl-swatch-name">{t(c.name)}</span>
                </button>
              );
            })}
            <span className={cn('bl-custom', !presetActive && 'is-active')}>
              <ColorPicker value={bl.color} onChange={(v) => set({ color: v })} label={t('Main color')} presets={NAME_COLORS} />
              <ColorPicker value={bl.color2} onChange={(v) => set({ color2: v })} label={t('Glow color')} presets={NAME_COLORS} />
              <span className="bl-swatch-name">{t('Custom')}</span>
            </span>
          </div>
          <div className="bl-panel-row">
            <Segmented
              value={bl.speed}
              onChange={(v) => set({ speed: v })}
              label={t('Speed')}
              size="sm"
              options={[
                { value: 'slow', label: t('Slow') },
                { value: 'normal', label: t('Normal') },
                { value: 'fast', label: t('Fast') },
              ]}
            />
            <label className="bl-hover">
              <Switch checked={!!bl.hoverOnly} onChange={(v) => set({ hoverOnly: v })} label={t('Only on hover')} />
              <span>{t('Only on hover')}</span>
            </label>
            {(bl.color !== DEFAULT_BORDER_LINE.color || bl.color2 !== DEFAULT_BORDER_LINE.color2 || bl.speed !== 'normal' || bl.hoverOnly) && (
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw />}
                onClick={() =>
                  set({
                    color: DEFAULT_BORDER_LINE.color,
                    color2: DEFAULT_BORDER_LINE.color2,
                    speed: 'normal',
                    hoverOnly: false,
                  })
                }
              >
                {t('Reset to ONYX green')}
              </Button>
            )}
          </div>
          <p className="settings-note">{t('Color and speed are shared by the avatar and the profile card edge. With reduced motion the light stays visible but does not move.')}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Tabs                                                               */
/* ---------------------------------------------------------------- */

function ProfileTab({ onPreview }: { onPreview: Preview }) {
  const me = useMe();
  const update = useStore((s) => s.updateMe);
  const { busy, upload } = useImageUpload();
  const same = (a?: AvatarSource, b?: AvatarSource) => a?.kind === 'art' && b?.kind === 'art' && a.style === b.style && a.hue === b.hue && a.seed === b.seed && a.motif === b.motif;
  return (
    <>
      <div className="studio-avatar-row anim-host">
        <Avatar user={{ ...me, borderLine: undefined }} size={72} frame />
        <div className="studio-avatar-text">
          <strong>{t('Avatar')}</strong>
          <span>{t('PNG, JPG, WebP or animated GIF – then position and zoom it. Or pick an artwork below.')}</span>
          <div className="row-actions">
            <Button size="sm" icon={<Upload />} loading={busy === 'avatar'} onClick={() => upload('avatar')}>
              {t('Upload avatar')}
            </Button>
            {me.avatar?.kind === 'image' && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Crop />}
                onClick={() =>
                  me.avatar?.kind === 'image' &&
                  useUI.getState().openModal({
                    type: 'crop',
                    kind: 'avatar',
                    src: me.avatar.src,
                    poster: me.avatar.poster,
                    animated: me.avatar.animated,
                  })
                }
              >
                {t('Adjust')}
              </Button>
            )}
            {me.avatar && (
              <Button size="sm" variant="ghost" icon={<Trash />} onClick={() => update({ avatar: undefined })}>
                {t('Remove')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="studio-fields">
        <TextField
          label={t('Display name')}
          value={me.displayName}
          maxLength={32}
          showCounter
          onChange={(e) => update({ displayName: e.target.value })}
          onBlur={() => !me.displayName.trim() && update({ displayName: me.username })}
          hint={t('Your username @{name} stays the same.', {
            name: me.username,
          })}
        />
        <TextField
          label={t('Pronouns')}
          value={me.pronouns ?? ''}
          maxLength={40}
          placeholder={t('e.g. he/him, she/her, they/them')}
          onChange={(e) => update({ pronouns: e.target.value || undefined })}
        />
        <TextArea
          label={t('About me')}
          value={me.bio ?? ''}
          maxLength={300}
          showCounter
          rows={4}
          onChange={(e) => update({ bio: e.target.value || undefined })}
          placeholder={t('Tell people about yourself')}
          hint={t('Markdown is supported, e.g. **bold** or ||spoiler||.')}
        />
      </div>

      <Gallery
        title={t('Avatar artworks')}
        type="avatar"
        isActive={(i) => same(me.avatar, i.avatar)}
        apply={(i) => i && update({ avatar: i.avatar })}
        patchFor={(i) => (i ? { avatar: i.avatar } : {})}
        onPreview={onPreview}
        tileClass="is-round"
        renderArt={(i) => (
          <Avatar
            user={{
              ...me,
              avatar: i.avatar,
              avatarDecoration: undefined,
              borderLine: undefined,
            }}
            size={60}
          />
        )}
      />
    </>
  );
}

function BannerTab({ onPreview }: { onPreview: Preview }) {
  const me = useMe();
  const update = useStore((s) => s.updateMe);
  const { busy, upload } = useImageUpload();
  return (
    <>
      <div className="studio-upload-row">
        <div>
          <strong>{t('Your own banner')}</strong>
          <span>{t('Upload an image (GIFs stay animated) and choose the visible area.')}</span>
        </div>
        <div className="row-actions">
          <Button size="sm" icon={<ImagePlus />} loading={busy === 'banner'} onClick={() => upload('banner')}>
            {t('Upload banner')}
          </Button>
          {me.banner?.kind === 'image' && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Crop />}
              onClick={() =>
                me.banner?.kind === 'image' &&
                useUI.getState().openModal({
                  type: 'crop',
                  kind: 'banner',
                  src: me.banner.src,
                  poster: me.banner.poster,
                  animated: me.banner.animated,
                })
              }
            >
              {t('Adjust position')}
            </Button>
          )}
        </div>
      </div>
      <Gallery
        type="banner"
        isActive={(i) => me.banner?.kind === 'preset' && me.banner.id === i.id}
        apply={(i) => update({ banner: i ? { kind: 'preset', id: i.id } : undefined })}
        patchFor={(i) => ({
          banner: i ? { kind: 'preset', id: i.id } : undefined,
        })}
        onPreview={onPreview}
        noneLabel={t('None')}
        noneActive={!me.banner}
        tileClass="is-wide"
        renderArt={(i) => <Banner source={{ kind: 'preset', id: i.id }} />}
      />
    </>
  );
}

function ColorsTab({ onPreview }: { onPreview: Preview }) {
  const me = useMe();
  const update = useStore((s) => s.updateMe);
  const colors = me.profileColors ?? [];
  const custom = colors.length ? colors : ['#0f2a22', '#0b1512'];
  const isPalette = PALETTES.some((p) => p.colors.join() === colors.join());
  const setColor = (i: number, v: string) => {
    const next = [...custom];
    next[i] = v;
    update({ profileColors: next });
  };
  const draftColor = (i: number, v: string | null) => {
    if (!v) return onPreview(null);
    const next = [...custom];
    next[i] = v;
    onPreview({ profileColors: next });
  };
  const stopLabel = (i: number) => (i === 0 ? t('Top') : i === custom.length - 1 ? t('Bottom') : t('Middle'));

  return (
    <>
      <SettingsSection title={t('Profile colors')} description={t('A gradient that tints your whole profile card and full profile – including all its sections.')}>
        <div className="palette-grid">
          <button
            className={cn('palette', !colors.length && 'is-active')}
            onClick={() => update({ profileColors: undefined })}
            onMouseEnter={() => onPreview({ profileColors: undefined })}
            onMouseLeave={() => onPreview(null)}
          >
            <span className="palette-swatch is-default" />
            <span>{t('Default')}</span>
          </button>
          {PALETTES.map((p) => {
            const active = colors.join() === p.colors.join();
            return (
              <button
                key={p.id}
                className={cn('palette', active && 'is-active')}
                onClick={() => update({ profileColors: p.colors })}
                onMouseEnter={() => onPreview({ profileColors: p.colors })}
                onMouseLeave={() => onPreview(null)}
              >
                <span
                  className="palette-swatch"
                  style={{
                    background: `linear-gradient(160deg, ${p.colors.join(', ')})`,
                  }}
                >
                  {active && <Check size={14} strokeWidth={3} />}
                </span>
                <span>{t(p.name)}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>
      <SettingsSection title={t('Custom gradient')} description={t('Pick two or three colors. Changes appear in the preview while you choose.')}>
        <div className={cn('gradient-editor', colors.length > 0 && !isPalette && 'is-active')}>
          <span
            className="gradient-bar"
            style={{
              background: `linear-gradient(90deg, ${custom.join(', ')})`,
            }}
          />
          <div className="gradient-stops">
            {custom.map((c, i) => (
              <div key={i} className="gradient-stop">
                <ColorPicker
                  value={c}
                  onChange={(v) => setColor(i, v)}
                  onDraft={(v) => draftColor(i, v)}
                  label={stopLabel(i)}
                  presets={['#0f2a22', '#10b981', '#1e3a5f', '#4c1d95', '#7f1d1d', '#a16207', '#0f766e', '#831843', '#1d4ed8', '#0b0f12']}
                />
                <span>{stopLabel(i)}</span>
                {i === 2 && (
                  <button className="icon-btn icon-btn-sm" onClick={() => update({ profileColors: custom.slice(0, 2) })} aria-label={t('Remove color')}>
                    <X />
                  </button>
                )}
              </div>
            ))}
            {custom.length < 3 && (
              <button className="color-add" onClick={() => update({ profileColors: [custom[0], '#10b981', custom[1]] })}>
                <Plus size={14} /> {t('Third color')}
              </button>
            )}
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

function NameTab({ onPreview }: { onPreview: Preview }) {
  const me = useMe();
  const update = useStore((s) => s.updateMe);
  const style = me.nameStyle ?? DEFAULT_NAME_STYLE;
  const [slot, setSlot] = useState(0);
  const set = (patch: Partial<NameStyle>) => update({ nameStyle: { ...style, ...patch } });
  const preview = (patch: Partial<NameStyle> | null) => onPreview(patch ? { nameStyle: { ...style, ...patch } } : null);
  const colors = style.colors;
  const withColor = (v: string) => {
    const next = [...colors];
    next[Math.min(slot, next.length)] = v;
    return next.slice(0, 3);
  };
  const effect = NAME_EFFECTS.find((e) => e.id === style.effect);
  const fill = (e: (typeof NAME_EFFECTS)[number]) => (colors.length >= e.minColors ? colors : [...colors, ...['#10b981', '#38bdf8', '#a78bfa'].slice(colors.length, e.minColors)]);
  const same = (a: NameStyle, b: NameStyle) => a.font === b.font && a.effect === b.effect && a.colors.join() === b.colors.join() && !!a.italic === !!b.italic && !!a.uppercase === !!b.uppercase;

  return (
    <>
      <div className="name-stage">
        <span className="name-stage-big">
          <StyledName style={style}>{me.displayName}</StyledName>
        </span>
        <span className="name-stage-user">
          @{me.username} · {t('Your username stays the same – only the display name is styled.')}
        </span>
        {!isDefaultStyle(style) && (
          <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => update({ nameStyle: DEFAULT_NAME_STYLE })}>
            {t('Reset name style')}
          </Button>
        )}
      </div>

      <SettingsSection title={t('Presets')}>
        <div className="name-presets">
          {NAME_PRESETS.map((p) => {
            const active = same(p.style, style);
            return (
              <button
                key={p.id}
                className={cn('name-preset anim-host', active && 'is-active')}
                onClick={() => update({ nameStyle: p.style })}
                onMouseEnter={() => onPreview({ nameStyle: p.style })}
                onFocus={() => onPreview({ nameStyle: p.style })}
                onMouseLeave={() => onPreview(null)}
                onBlur={() => onPreview(null)}
                aria-pressed={active}
              >
                <StyledName style={p.style}>{me.displayName}</StyledName>
                <small>{t(p.name)}</small>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title={t('Font')}>
        <div className="font-grid">
          {NAME_FONTS.map((f) => (
            <button
              key={f.id}
              className={cn('font-tile', style.font === f.id && 'is-active')}
              onClick={() => set({ font: f.id })}
              onMouseEnter={() => preview({ font: f.id })}
              onMouseLeave={() => preview(null)}
              aria-pressed={style.font === f.id}
            >
              <span
                className="font-sample"
                style={{
                  fontFamily: f.family,
                  fontWeight: f.weight,
                  fontStyle: style.italic ? 'italic' : undefined,
                  textTransform: style.uppercase ? 'uppercase' : undefined,
                }}
              >
                {me.displayName}
              </span>
              <small>{t(f.name)}</small>
            </button>
          ))}
        </div>
        <div className="name-toggles">
          <Segmented
            value={style.italic ? 'italic' : 'normal'}
            onChange={(v) => set({ italic: v === 'italic' || undefined })}
            label={t('Font style')}
            options={[
              { value: 'normal', label: t('Normal') },
              {
                value: 'italic',
                label: <span style={{ fontStyle: 'italic' }}>{t('Italic')}</span>,
              },
            ]}
          />
          <label className="name-toggle">
            <Switch checked={!!style.uppercase} onChange={(v) => set({ uppercase: v || undefined })} label={t('Show in capitals')} />
            <span>
              <strong>{t('Show in capitals')}</strong>
              <small>{t('Only changes how the name is displayed.')}</small>
            </span>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title={t('Effect')}>
        <div className="effect-grid">
          {NAME_EFFECTS.map((e) => (
            <button
              key={e.id}
              className={cn('effect-tile anim-host', style.effect === e.id && 'is-active')}
              onClick={() => set({ effect: e.id, colors: fill(e) })}
              onMouseEnter={() => preview({ effect: e.id, colors: fill(e) })}
              onMouseLeave={() => preview(null)}
              aria-pressed={style.effect === e.id}
            >
              <StyledName
                style={{
                  font: style.font,
                  effect: e.id,
                  colors: fill(e).length ? fill(e) : ['#10b981'],
                  italic: style.italic,
                }}
              >
                Aa
              </StyledName>
              <small>
                {t(e.name)}
                {e.animated && <Zap size={10} />}
              </small>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('Colors')} description={effect?.id === 'prism' ? t('Prism uses its own rainbow – colors are ignored.') : t('Up to three colors. Two or more create a gradient.')}>
        <div className="name-colors">
          <div className="color-slots">
            {[0, 1, 2].map((i) =>
              i < colors.length ? (
                <div key={i} className={cn('color-slot-wrap', slot === i && 'is-active')}>
                  <ColorPicker
                    value={colors[i]}
                    label={t('Color {n}', { n: i + 1 })}
                    presets={NAME_COLORS}
                    onChange={(v) => {
                      setSlot(i);
                      const next = [...colors];
                      next[i] = v;
                      set({ colors: next });
                    }}
                    onDraft={(v) => {
                      if (!v) return preview(null);
                      const next = [...colors];
                      next[i] = v;
                      preview({ colors: next });
                    }}
                    trigger={<button className={cn('color-slot', slot === i && 'is-active')} style={{ background: colors[i] }} onClick={() => setSlot(i)} aria-label={t('Color {n}', { n: i + 1 })} />}
                  />
                  <button
                    className="color-slot-x"
                    onClick={() => {
                      set({ colors: colors.filter((_, j) => j !== i) });
                      setSlot(0);
                    }}
                    aria-label={t('Remove color')}
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : i === colors.length ? (
                <button
                  key={i}
                  className="color-slot is-add"
                  onClick={() => {
                    set({
                      colors: [...colors, NAME_COLORS[(colors.length + 1) % NAME_COLORS.length]],
                    });
                    setSlot(colors.length);
                  }}
                  aria-label={t('Add color')}
                >
                  <Plus size={14} />
                </button>
              ) : null,
            )}
          </div>
          <div className="swatch-row" role="group" aria-label={t('Quick colors')}>
            {NAME_COLORS.map((c) => (
              <button
                key={c}
                className={cn('swatch', colors[slot] === c && 'is-active')}
                style={{ background: c }}
                onClick={() => set({ colors: withColor(c) })}
                onMouseEnter={() => preview({ colors: withColor(c) })}
                onMouseLeave={() => preview(null)}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Preview                                                            */
/* ---------------------------------------------------------------- */

function StudioPreview({ user }: { user: User }) {
  const line = activityLine(user);
  return (
    <div className="studio-preview-sticky">
      <div className="profile-preview-label">{t('Live preview')}</div>
      <ProfileCard user={user} variant="preview" />
      <div className="studio-mini">
        <span className="profile-preview-label">{t('In chat')}</span>
        <div className="mini-msg anim-host">
          <Avatar user={user} size={40} frame />
          <div className="mini-msg-body">
            <div className="mini-msg-head">
              <span className="msg-author">
                <StyledName style={user.nameStyle}>{user.displayName}</StyledName>
              </span>
              <span className="msg-time">{formatMessageTime(Date.now() - 4 * 60_000)}</span>
            </div>
            <p>{t('gg! Who’s up for another round? 🎮')}</p>
          </div>
        </div>
        <span className="profile-preview-label">{t('In the member list')}</span>
        <div className="member mini-member anim-host">
          <Avatar user={user} size={32} status={user.status} frame />
          <span className="member-text">
            <span className="member-name-row">
              <span className="member-name truncate">
                <StyledName style={user.nameStyle}>{user.displayName}</StyledName>
              </span>
            </span>
            {line && <span className="member-sub truncate">{line.text}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Root                                                               */
/* ---------------------------------------------------------------- */

export function ProfileSettings() {
  const me = useMe();
  const update = useStore((s) => s.updateMe);
  const initialTab = useUI((s) => (s.settings?.kind === 'user' ? s.settings.tab : undefined)) as StudioTab | undefined;
  const [tab, setTab] = useState<StudioTab>(initialTab && TABS.includes(initialTab) ? initialTab : 'profile');
  const [patch, setPatch] = useState<Patch | null>(null);
  const preview = useMemo(() => ({ ...me, ...(patch ?? {}) }), [me, patch]);

  const tabs: { id: StudioTab; label: string; icon: ReactNode }[] = [
    { id: 'profile', label: t('Profile'), icon: <UserRound /> },
    { id: 'name', label: t('Name style'), icon: <Type /> },
    { id: 'decoration', label: t('Decoration'), icon: <Sparkles /> },
    { id: 'frame', label: t('Profile frame'), icon: <Frame /> },
    { id: 'banner', label: t('Banner'), icon: <ImageIcon /> },
    { id: 'effect', label: t('Effect'), icon: <Zap /> },
    { id: 'colors', label: t('Colors'), icon: <Palette /> },
  ];

  const go = (id: StudioTab) => {
    setPatch(null);
    setTab(id);
  };

  let content: ReactNode = null;
  switch (tab) {
    case 'profile':
      content = <ProfileTab onPreview={setPatch} />;
      break;
    case 'name':
      content = <NameTab onPreview={setPatch} />;
      break;
    case 'decoration':
      content = (
        <>
          <BorderLinePanel target="avatar" />
          <Gallery
            title={t('Decorations')}
            type="decoration"
            isActive={(i) => me.avatarDecoration === i.id}
            apply={(i) => update({ avatarDecoration: i?.id })}
            patchFor={(i) => ({ avatarDecoration: i?.id })}
            onPreview={setPatch}
            noneLabel={t('None')}
            noneActive={!me.avatarDecoration}
            tileClass="is-round"
            renderArt={(i) => <Avatar user={{ ...me, avatarDecoration: i.id, borderLine: undefined }} size={56} frame />}
          />
        </>
      );
      break;
    case 'frame':
      content = (
        <>
          <BorderLinePanel target="card" />
          <Gallery
            title={t('Frames')}
            type="frame"
            isActive={(i) => me.profileFrame === i.id}
            apply={(i) => update({ profileFrame: i?.id })}
            patchFor={(i) => ({ profileFrame: i?.id })}
            onPreview={setPatch}
            noneLabel={t('None')}
            noneActive={!me.profileFrame}
            renderArt={(i) => (
              <MiniCard>
                <ProfileFrame id={i.id} />
              </MiniCard>
            )}
          />
        </>
      );
      break;
    case 'effect':
      content = (
        <Gallery
          type="effect"
          isActive={(i) => me.profileEffect === i.id}
          apply={(i) => update({ profileEffect: i?.id })}
          patchFor={(i) => ({ profileEffect: i?.id })}
          onPreview={setPatch}
          noneLabel={t('None')}
          noneActive={!me.profileEffect}
          renderArt={(i) => (
            <MiniCard>
              <ProfileEffect effect={i.id} />
            </MiniCard>
          )}
        />
      );
      break;
    case 'banner':
      content = <BannerTab onPreview={setPatch} />;
      break;
    case 'colors':
      content = <ColorsTab onPreview={setPatch} />;
      break;
  }

  return (
    <div className="studio">
      <SettingsHeader title={t('Profile Studio')} tag={<FreeTag />} description={t('Every design is free and available right away. Hover to try something on, click to apply.')} />
      <nav className="studio-nav" role="tablist" aria-label={t('Profile Studio')}>
        {tabs.map((tb) => (
          <button key={tb.id} role="tab" aria-selected={tab === tb.id} className={cn('studio-nav-item', tab === tb.id && 'is-active')} onClick={() => go(tb.id)}>
            {tb.icon}
            <span>{tb.label}</span>
          </button>
        ))}
      </nav>
      <div className="studio-body">
        <div className="studio-main" role="tabpanel">
          {tab === 'profile' && <ServerTagPicker />}
          {content}
        </div>
        <aside className="studio-preview">
          <StudioPreview user={preview} />
        </aside>
      </div>
    </div>
  );
}
