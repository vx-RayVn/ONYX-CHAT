import { create } from 'zustand';
import { CLOUD } from './config';
import { supabase } from './client';
import { useStore } from '../store/store';
import { BADGE_BY_ID } from '../data/badges';
import type { BadgeId, BannerSource } from '../types';
import { sourceFromDb, mediaUrl } from './media';
import { isUuid, uniqueUuids } from '../lib/ids';

export interface BadgeMetadata { id: BadgeId; name: string; description: string; image: string | null; edited_by: string | null; customized?: boolean }
export interface ServerTag { server_id: string; label: string; image: string | null; enabled: boolean; invite_code: string | null }
export interface InvitePreview { code: string; server_id: string; name: string; icon?: string; banner?: BannerSource; description?: string; members: number; created_at: string }
export const useCommunity = create<{ tags: Record<string,ServerTag>; selected: Record<string,string>; catalog: Record<string,BadgeMetadata>; revision: number; error: string | null }>(() => ({tags:{},selected:{},catalog:{},revision:0,error:null}));
let generation=0;
export function clearCommunity() { generation++; useCommunity.setState({tags:{},selected:{},catalog:{},error:null}); }
export async function refreshCommunity() {
  if (!CLOUD) return;
  const state=useStore.getState(), me=state.meId, seq=++generation;
  if (!isUuid(me)) return;
  const sb=supabase(), ids=uniqueUuids([me,...Object.keys(state.users)]);
  const fetchRows=async(table:'profile_tags'|'server_tags',column:'user_id'|'server_id',values:string[])=>{
    const rows:Record<string,string>[]=[];
    for(let start=0;start<values.length;start+=200){
      const result=await sb.from(table).select('*').in(column,values.slice(start,start+200));
      if(result.error)throw result.error;
      rows.push(...(result.data??[]));
    }
    return rows;
  };
  const [catalog, selected]=await Promise.all([sb.from('badge_catalog').select('*'),fetchRows('profile_tags','user_id',ids)]);
  if (catalog.error) throw catalog.error;
  const servers=uniqueUuids([...Object.keys(state.servers),...selected.map(r=>r.server_id)]);
  const tags=await fetchRows('server_tags','server_id',servers);
  if(seq!==generation||useStore.getState().meId!==me)return;
  const entries=(catalog.data??[]) as BadgeMetadata[];
  useCommunity.setState(s=>({catalog:Object.fromEntries(entries.map(r=>[r.id,r])),selected:Object.fromEntries(selected.map(r=>[r.user_id,r.server_id])),tags:Object.fromEntries(tags.map(r=>[r.server_id,r as unknown as ServerTag])),revision:s.revision+1,error:null}));
}
export async function saveBadgeMetadata(row: BadgeMetadata) {
  if(!CLOUD)throw new Error('Cloud account required');
  const me=useStore.getState().meId;
  const {data,error}=await supabase().from('badge_catalog').update({name:row.name.trim(),description:row.description.trim(),image:row.image,edited_by:me,updated_at:new Date().toISOString()}).eq('id',row.id).select('*').single();
  if(error)throw error;
  if(useStore.getState().meId!==me)return;
  generation++;
  useCommunity.setState(s=>({catalog:{...s.catalog,[row.id]:data as BadgeMetadata},revision:s.revision+1}));
}
export async function selectServerTag(serverId: string|null) {
  if(!CLOUD)throw new Error('Cloud account required');
  const me=useStore.getState().meId;
  const response=await supabase().rpc('choose_server_tag',{p_server_id:serverId});
  if(response.error)throw response.error;
  if(useStore.getState().meId!==me)return;
  generation++;
  useCommunity.setState(s=>{const selected={...s.selected};if(response.data)selected[me]=response.data as string;else delete selected[me];return {selected,revision:s.revision+1};});
}
export async function saveServerTag(serverId:string, patch:{label:string;image:string|null;enabled:boolean}) {
  const me=useStore.getState().meId;
  if(!CLOUD||!useStore.getState().servers[serverId])throw new Error('Cloud account required');
  const {data,error}=await supabase().rpc('save_server_tag',{p_server_id:serverId,p_label:patch.label,p_image:patch.image,p_enabled:patch.enabled}).single();
  if(error)throw error;
  if(useStore.getState().meId!==me)return;
  generation++;
  const tag=data as ServerTag;
  useCommunity.setState(s=>{
    const previous=s.tags[serverId],selected={...s.selected};
    if(!tag.enabled||previous?.label!==tag.label||previous?.image!==tag.image)for(const [user,id] of Object.entries(selected))if(id===serverId)delete selected[user];
    return {tags:{...s.tags,[serverId]:tag},selected,revision:s.revision+1,error:null};
  });
}
export async function getInvitePreview(code:string):Promise<InvitePreview|null> {
  if(!CLOUD)return null;
  const {data,error}=await supabase().rpc('invite_preview',{p_code:code});
  if(error)throw error;
  return data?{...data,icon:mediaUrl(data.icon),banner:sourceFromDb(data.banner)}:null;
}
export function badgeName(id:BadgeId) { const row=useCommunity.getState().catalog[id];return row?.customized||row?.edited_by?row.name:null; }
export function badgeDescription(id:BadgeId) { const row=useCommunity.getState().catalog[id];return row?.customized||row?.edited_by?row.description:null; }
export function knownBadge(id:string){return !!BADGE_BY_ID[id as BadgeId];}
