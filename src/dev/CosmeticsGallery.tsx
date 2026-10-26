/**
 * Development-only QA page (open the app with "?gallery"): renders every
 * decoration, frame, effect and banner large and side by side, so artwork can
 * be checked at real sizes. Not part of production builds.
 */
import { useState } from 'react';
import { useStore } from '../store/store';
import { NAME_PRESETS, itemsOf, type CosmeticType } from '../data/cosmetics';
import { StyledName } from '../components/cosmetics/StyledName';
import { Avatar } from '../components/ui/Avatar';
import { Banner } from '../components/ui/Banner';
import { ProfileCard } from '../components/profile/ProfileCard';
import { MessageContent } from '../components/chat/MessageContent';
import { Flag } from '../components/ui/Flag';
import { EMOJIS } from '../lib/emoji';
import './gallery.css';

type GalleryType = CosmeticType | 'names' | 'flags';
const TYPES: GalleryType[] = ['decoration', 'frame', 'effect', 'banner', 'names', 'flags'];

export default function CosmeticsGallery() {
  const me = useStore((s) => s.users[s.meId]);
  const params = new URLSearchParams(location.hash.startsWith('#gallery') ? location.hash.slice(1).replace(/^gallery=?/, 'gallery=') : location.search);
  const [type, setType] = useState<GalleryType>((params.get('gallery')?.split('&')[0] as GalleryType) || 'decoration');
  const only = params.get('only');
  const items = type === 'names' || type === 'flags' ? [] : itemsOf(type).filter((i) => !only || i.id === only);
  const base = { ...me, avatarDecoration: undefined, profileFrame: undefined, profileEffect: undefined, borderLine: undefined };
  return (
    <div className="dev-gallery">
      <nav>
        {TYPES.map((tp) => (
          <button key={tp} className={tp === type ? 'is-active' : undefined} onClick={() => setType(tp)}>
            {tp}
          </button>
        ))}
      </nav>
      {type === 'names' && (
        <div className="dev-names">
          {NAME_PRESETS.map((p) => (
            <div key={p.id} className="dev-name-row">
              <span className="name-preset">
                <StyledName style={p.style}>{me.displayName}</StyledName>
                <small>{p.name}</small>
              </span>
              <span className="msg-author" style={{ fontSize: 15, fontWeight: 650 }}>
                <StyledName style={p.style}>{me.displayName}</StyledName>
              </span>
              <span className="member" style={{ width: 200 }}>
                <span className="member-text">
                  <span className="member-name-row">
                    <span className="member-name truncate">
                      <StyledName style={p.style}>Maximilian von Schattenwald</StyledName>
                    </span>
                  </span>
                </span>
              </span>
              <h2 className="pcard-name" style={{ maxWidth: 220 }}>
                <StyledName style={p.style} className="truncate">
                  {me.displayName}
                </StyledName>
              </h2>
              <span className="name-stage-big">
                <StyledName style={p.style}>{me.displayName}</StyledName>
              </span>
            </div>
          ))}
        </div>
      )}
      {type === 'flags' && (
        <div className="dev-flags">
          <MessageContent
            content={'BR, DE and US stay plain text here. Flags: 🇧🇷 🇩🇪 🇺🇸 🇯🇵 🇺🇦 🇨🇦 🇲🇽 🇪🇺 \u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} – and **🇧🇷 bold**'}
            serverId={null}
          />
          <MessageContent content="🇧🇷🇩🇪" serverId={null} />
          <span className="msg-author" style={{ fontSize: 15, fontWeight: 650 }}>
            <StyledName style={NAME_PRESETS[1].style}>Lena 🇩🇪 BR</StyledName>
          </span>
          <div className="dev-flag-row">
            {['DE', 'BR', 'US', 'CA', 'MX', 'IN', 'AR'].map((c) => (
              <Flag key={c} code={c} size={24} />
            ))}
          </div>
          <div className="dev-flag-row" style={{ fontFamily: 'var(--font-emoji)', fontSize: 26 }}>
            {EMOJIS.filter((e) => e.category === 'flags')
              .slice(0, 48)
              .map((e) => e.char)
              .join(' ')}
          </div>
        </div>
      )}
      <div className={`dev-grid is-${type}`}>
        {items.map((i) => (
          <figure key={i.id} className="anim-host">
            {type === 'decoration' && <Avatar user={{ ...base, avatarDecoration: i.id }} size={params.has('big') ? 240 : 120} frame />}
            {type === 'frame' && <ProfileCard user={{ ...base, profileFrame: i.id }} variant="preview" hideSections={!params.has('full')} />}
            {type === 'effect' && <ProfileCard user={{ ...base, profileEffect: i.id }} variant="preview" />}
            {type === 'banner' && (
              <span className="dev-banner">
                <Banner source={{ kind: 'preset', id: i.id }} />
              </span>
            )}
            <figcaption>{i.id}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
