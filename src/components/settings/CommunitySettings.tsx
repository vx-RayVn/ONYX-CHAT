import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Eye, EyeOff, ImagePlus, LockKeyhole, Shield } from 'lucide-react';
import { t } from '../../i18n';
import { useStore } from '../../store/store';
import { toast } from '../../store/ui';
import { CLOUD } from '../../backend/config';
import { describeError } from '../../backend/queue';
import { useCommunity, saveServerTag, saveBadgeMetadata, badgeName, badgeDescription, type BadgeMetadata } from '../../backend/community';
import { BADGES, BADGE_BY_ID } from '../../data/badges';
import type { BadgeId } from '../../types';
import { readAsDataURL } from '../../lib/image';
import { Button } from '../ui/Button';
import { TextField, Switch } from '../ui/Field';
import { BadgeIcon } from '../ui/icons';
import { Avatar } from '../ui/Avatar';
import { SettingsHeader, SettingsSection } from './SettingsLayout';
import { ServerTagPicker } from '../profile/ServerTag';
import { canServer } from '../../store/selectors';

async function badgeImage(file: File): Promise<string> {
  if (!['image/png', 'image/webp'].includes(file.type) || file.size > 120000) throw new Error(t('Choose a PNG or WebP image up to 120 KB.'));
  const bitmap = await createImageBitmap(file); bitmap.close();
  return readAsDataURL(file);
}
export function ImageInput({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  return <div className="badge-image-input">
    <span className="badge-upload-preview">{value ? <img src={value} alt="" /> : <ImagePlus size={28}/>}</span>
    <div className="badge-upload-actions"><label className="btn btn-secondary">{t('Upload image')}<input type="file" accept="image/png,image/webp" onChange={e => {
      const file = e.target.files?.[0];
      if (file) void badgeImage(file).then(onChange).catch(error => toast({ tone: 'danger', title: t('Image not applied'), body: describeError(error) }));
      e.target.value = '';
    }} /></label><small>PNG / WebP · 120 KB</small></div>
    {value && <Button variant="ghost" onClick={() => onChange(null)}>{t('Remove')}</Button>}
  </div>;
}
export function ServerTagSettings({ serverId }: { serverId: string }) {
  const initial = useCommunity(s => s.tags[serverId]);
  const [label, setLabel] = useState(initial?.label ?? ''), [image, setImage] = useState(initial?.image ?? null), [enabled, setEnabled] = useState(initial?.enabled ?? true), [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const me = useStore(s=>s.users[s.meId]);
  const server = useStore(s=>s.servers[serverId]);
  useEffect(() => { if (!dirty.current) { setLabel(initial?.label ?? ''); setImage(initial?.image ?? null); setEnabled(initial?.enabled ?? true); } }, [initial]);
  const canEdit = useStore(s => canServer(s, serverId, 'manageBadges'));
  return <><SettingsHeader title={t('Server tag')} />
    <div className="tag-settings-layout"><section className="community-surface tag-settings-form">
      <TextField label={t('Name')} value={label} maxLength={4} showCounter onChange={e => { dirty.current = true; setLabel(e.target.value.replace(/\s/g, '')); }} />
      <div><h3>{t('Image')}</h3><ImageInput value={image} onChange={value => { dirty.current = true; setImage(value); }} /></div>
      <div className="tag-enabled"><div><strong>{t('Enabled')}</strong><p>{t('Members can choose this tag in their profile.')}</p></div><Switch checked={enabled} onChange={value => {dirty.current=true;setEnabled(value);}} label={t('Enabled')}/></div>
      <Button disabled={!CLOUD || !canEdit || !label.trim()} loading={busy} onClick={() => {
        setBusy(true);
        void saveServerTag(serverId, { label: label.trim(), image, enabled }).then(() => {dirty.current=false;toast({title:t('Saved')});}).catch(error => toast({ tone: 'danger', title: t('That didn’t work'), body: describeError(error) })).finally(() => setBusy(false));
      }}>{t('Save')}</Button>
      {!CLOUD && <p>{t('This feature needs an ONYX account.')}</p>}
    </section><aside className="community-surface tag-settings-preview"><span className="community-eyebrow">{t('Preview')}</span><div className="tag-preview-chat"><Avatar user={me} size={40}/><div><div className="tag-preview-name"><strong>{me.displayName}</strong><span className="server-tag">{image ? <img src={image} alt=""/> : <Shield size={13}/>}<span>{label||'…'}</span></span></div><p>{server?.name}</p></div></div></aside></div>
  </>;
}
export function OfficialBadgesSettings() {
  const me = useStore(s => s.users[s.meId]), earned = useStore(s => s.earnedBadges), setShown = useStore(s => s.setShownBadges);
  useCommunity(s => s.revision);
  const shown = me.badges.filter(id => BADGE_BY_ID[id]);
  const held = BADGES.filter(b=>!!earned[b.id]||me.badges.includes(b.id));
  return <><SettingsHeader title={t('Badges')} description={t('Choose which earned badges appear on your profile.')} />
    <ServerTagPicker/>
    <SettingsSection title={t('Shown on your profile')} className="badge-showcase"><div className="badge-showcase-summary"><span>{t('{count} earned',{count:held.length})}</span><span>{t('{count} shown',{count:shown.length})}</span></div>
      {shown.length ? <div className="badge-order-list">{shown.map((id,index)=><div className="badge-order-item" key={id}><BadgeIcon badge={id} size={26}/><span>{badgeName(id)??t(BADGE_BY_ID[id].name)}</span><Button size="sm" variant="ghost" disabled={!index} icon={<ArrowUp size={16}/>} aria-label={t('Move up')} onClick={()=>{const next=[...shown];[next[index-1],next[index]]=[next[index],next[index-1]];setShown(next);}}/><Button size="sm" variant="ghost" icon={<EyeOff size={16}/>} aria-label={t('Hide')} onClick={()=>setShown(shown.filter(b=>b!==id))}/></div>)}</div> : <p className="badge-showcase-empty">{t('No badges selected')}</p>}
    </SettingsSection>
    <div className="official-badge-grid">{BADGES.map(b=>{
      const owned=held.some(x=>x.id===b.id),visible=shown.includes(b.id);
      return <article key={b.id} className={owned?'is-earned':'is-locked'}><span className="badge-catalog-icon"><BadgeIcon badge={b.id} size={40} locked={!owned}/></span><div className="badge-catalog-info"><h3>{badgeName(b.id)??t(b.name)}</h3><p>{badgeDescription(b.id)??t(b.description)}</p><small>{owned?t('Earned'):t('Not earned')}</small></div><Button size="sm" variant={visible?'secondary':'ghost'} disabled={!owned} aria-pressed={visible} aria-label={visible?t('Hide'):t('Show on profile')} icon={!owned?<LockKeyhole size={17}/>:visible?<Check size={17}/>:<Eye size={17}/>} onClick={()=>setShown(visible?shown.filter(id=>id!==b.id):[...shown,b.id])}/></article>;
    })}</div></>;
}
export function BadgeCatalogAdmin() {
  const catalog=useCommunity(s=>s.catalog);
  const [id,setId]=useState<BadgeId>('verified'),[draft,setDraft]=useState<BadgeMetadata|null>(null),[busy,setBusy]=useState(false);
  const row=draft??catalog[id]??{id,name:t(BADGE_BY_ID[id].name),description:t(BADGE_BY_ID[id].description),image:null,edited_by:null};
  return <><SettingsHeader title={t('Official badge editor')}/>
    <div className="badge-admin-layout"><nav className="badge-admin-catalog" aria-label={t('Badges')}>{BADGES.map(b=><button key={b.id} aria-pressed={id===b.id} className={id===b.id?'is-active':''} onClick={()=>{setId(b.id);setDraft(null);}}><BadgeIcon badge={b.id} size={30}/><span>{badgeName(b.id)??t(b.name)}</span>{id===b.id&&<Check size={16}/>}</button>)}</nav>
      <section className="community-surface badge-admin-detail" key={id}><div className="badge-admin-preview"><span className="badge-admin-art"><BadgeIcon badge={id} size={64} imageOverride={row.image}/></span><div><span className="community-eyebrow">{t('Preview')}</span><h3>{row.name}</h3><p>{row.description}</p></div></div>
        <div className="badge-admin-fields"><TextField label={t('Name')} value={row.name} maxLength={50} showCounter onChange={e=>setDraft({...row,name:e.target.value})}/><label className="field"><span className="field-label">{t('Description')}</span><textarea className="badge-description" value={row.description} maxLength={300} rows={3} onChange={e=>setDraft({...row,description:e.target.value})}/></label><ImageInput value={row.image} onChange={image=>setDraft({...row,image})}/></div>
        <div className="badge-admin-footer"><div className="row-actions"><Button variant="ghost" disabled={!draft||busy} onClick={()=>setDraft(null)}>{t('Cancel')}</Button><Button loading={busy} disabled={!row.name.trim()} onClick={()=>{setBusy(true);void saveBadgeMetadata(row).then(()=>{setDraft(null);toast({title:t('Saved')});}).catch(error=>toast({tone:'danger',title:t('That didn’t work'),body:describeError(error)})).finally(()=>setBusy(false));}}>{t('Save')}</Button></div></div>
      </section></div></>;
}
