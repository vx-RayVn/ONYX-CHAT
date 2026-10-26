import {memo,useMemo,useState,useCallback} from 'react';
import {ArrowLeft,Compass,Search,Users,Check,ArrowRight,Sparkles,Zap} from 'lucide-react';
import {useStore} from '../../store/store';
import {showNavPane,toast} from '../../store/ui';
import {useDirectory,type DirectoryEntry,type DirectoryCategory} from '../../backend/directory';
import {t} from '../../i18n';
import {ServerIcon} from '../layout/ServerRail';
import {Banner} from '../ui/Banner';
import {Button,IconButton} from '../ui/Button';
import {cn} from '../../lib/utils';
import {PromoteOwnerCard} from '../settings/PromotionSettings';
import '../../styles/discovery.css';
export const DIRECTORY_CATEGORIES=['general','gaming','music','creative','technology','learning'] as const;
export type {DirectoryCategory};
export const categoryName=(c:DirectoryCategory)=>({general:t('Community'),gaming:t('Gaming'),music:t('Music'),creative:t('Creativity'),technology:t('Technology'),learning:t('Learning')})[c];
export function DiscoverView(){
 const [query,setQuery]=useState(''),[category,setCategory]=useState<DirectoryCategory|null>(null),[offset,setOffset]=useState(0),[revision,retry]=useState(0),[joining,setJoining]=useState<string|null>(null);
 const {rows,busy,error,more}=useDirectory(query,category,offset,revision),servers=useStore(s=>s.servers),me=useStore(s=>s.meId);
 const owner=Object.values(servers).some(server=>server.ownerId===me);
 const featured=useMemo(()=>rows.filter(row=>row.promotion==='top'),[rows]),communities=useMemo(()=>rows.filter(row=>row.promotion!=='top'),[rows]);
 const filter=(next:DirectoryCategory|null)=>{if(next!==category){setCategory(next);setOffset(0);}};
 const join=useCallback(async(row:DirectoryEntry)=>{if(joining)return;if(servers[row.id]){useStore.getState().selectServer(row.id);return;}setJoining(row.id);try{if(!await useStore.getState().joinByInvite(row.code))throw Error();}catch{toast({tone:'danger',title:t('Could not join this server')});}finally{setJoining(null);}},[servers,joining]);
 return <div className="discover-view"><header className="view-header"><IconButton label={t('Back')} className="mobile-only mobile-back" onClick={showNavPane} tooltip={false}><ArrowLeft/></IconButton><div className="view-header-title"><Compass size={21}/><h1>{t('Discover')}</h1></div></header>
  <div className="discover-scroll scroll-thin"><div className="discover-content">
   <section className="discover-hero"><div><span className="eyebrow">ONYX</span><h2>{t('Find your community')}</h2></div><label className="discover-search"><Search size={18}/><input aria-label={t('Search communities')} placeholder={t('Search communities')} maxLength={100} value={query} onChange={event=>{setQuery(event.target.value);setOffset(0);}}/>{query&&<button aria-label={t('Clear search')} onClick={()=>{setQuery('');setOffset(0);}}>×</button>}</label></section>
   <nav className="discover-categories scroll-thin" aria-label={t('Community categories')}><button className={cn('tab',!category&&'is-active')} aria-pressed={!category} onClick={()=>filter(null)}>{t('All')}</button>{DIRECTORY_CATEGORIES.map(item=><button key={item} className={cn('tab',category===item&&'is-active')} aria-pressed={category===item} onClick={()=>filter(item)}>{categoryName(item)}</button>)}</nav>
   <div className="discover-results" aria-busy={busy}><div className="discover-status" role="status">{busy&&rows.length>0?t('Loading…'):''}</div>
    {error&&<div className="discover-error" role="alert"><span>{t('Communities could not be loaded.')}</span><Button size="sm" variant="secondary" onClick={()=>retry(value=>value+1)}>{t('Try again')}</Button></div>}
    {busy&&!rows.length&&<div className="discover-skeleton" aria-label={t('Loading…')}>{[0,1,2,3].map(i=><div key={i}/>)}</div>}
    {(owner||featured.length>0)&&<section className="discover-promoted"><h3 className="discover-section-title"><Sparkles size={15}/>{t('Promoted')}</h3><div className="discover-promoted-grid">{featured.map(row=><DiscoveryCard key={row.id} row={row} joined={!!servers[row.id]} busy={joining!==null} onJoin={join}/>)}{owner&&<PromoteOwnerCard/>}</div></section>}
    {!busy&&!error&&!rows.length&&<div className="discover-empty"><Compass size={36}/><h3>{t('No communities found')}</h3><p>{t('Try another search or category.')}</p></div>}
    {communities.length>0&&<h3 className="discover-section-title">{query?t('Search results'):category?categoryName(category):t('All communities')}</h3>}
    <div className="discover-grid">{communities.map(row=><DiscoveryCard key={row.id} row={row} joined={!!servers[row.id]} busy={joining!==null} onJoin={join}/>)}</div>
    {more&&!error&&<Button className="discover-more" disabled={busy} variant="secondary" onClick={()=>setOffset(value=>value+24)}>{busy?t('Loading…'):t('Load more')}</Button>}
   </div></div></div></div>;
}
const DiscoveryCard=memo(function DiscoveryCard({row,joined,busy,onJoin}:{row:DirectoryEntry;joined:boolean;busy:boolean;onJoin:(row:DirectoryEntry)=>Promise<void>}){
 const promoted=row.promotion==='top',level=row.boost_level??0;
 return <article className={cn('discover-card',promoted&&'is-promoted',row.promotion==='boost'&&`is-boost-${level}`)}><div className="discover-banner"><Banner lazy source={row.banner} color="linear-gradient(125deg,#123c35,#132334)"/>{promoted?<span className="discover-placement"><Sparkles size={12}/>{t('Promoted')}</span>:row.promotion==='boost'?<span className="discover-placement"><Zap size={12}/>{t(level===3?'Mega Boost':level===2?'Super Boost':'Boost')}</span>:null}</div><div className="discover-card-body"><ServerIcon server={{name:row.name,icon:row.icon,iconColor:row.icon_color}} size={46}/><span className="discover-category">{categoryName(row.category)}</span><h3>{row.name}{(row.verified||row.is_official)&&<Check size={15} aria-label={t('Official server')}/>}</h3><p>{row.description||categoryName(row.category)}</p><div className="discover-card-footer"><span><Users size={14}/>{t('{count} members',{count:row.members})}</span><Button variant={promoted?'primary':'secondary'} size="sm" disabled={busy} onClick={()=>void onJoin(row)} icon={<ArrowRight size={14}/>}>{joined?t('Open server'):t('Join server')}</Button></div></div></article>;
});
