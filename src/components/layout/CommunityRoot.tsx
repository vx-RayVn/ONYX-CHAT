import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CLOUD } from '../../backend/config';
import { supabase } from '../../backend/client';
import { clearCommunity,refreshCommunity,useCommunity } from '../../backend/community';
import { useStore } from '../../store/store';

export function CommunityRoot() {
  const ids=useStore(useShallow(s=>Object.keys(s.users))),servers=useStore(useShallow(s=>Object.keys(s.servers))),me=useStore(s=>s.meId);
  useEffect(()=>{
    if(!CLOUD||!me)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>void refreshCommunity().catch(()=>useCommunity.setState({error:'unavailable'})),100);};
    refresh();
    const channel=supabase().channel(`community:${me}`).on('postgres_changes',{event:'*',schema:'public',table:'badge_catalog'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'server_tags'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'profile_tags'},refresh).subscribe(status=>{if(status==='SUBSCRIBED')refresh();});
    return()=>{clearTimeout(timer);void supabase().removeChannel(channel);clearCommunity();};
  },[me,ids.join(),servers.join()]);
  return null;
}
