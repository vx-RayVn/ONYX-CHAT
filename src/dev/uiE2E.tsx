/** Local UI regression fixture; no Auth initialization or real accounts. */
import { createRoot } from 'react-dom/client';
import { buildSeed } from '../data/seed';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { AppShell } from '../components/layout/AppShell';
import { SettingsRoot } from '../components/settings/SettingsRoot';
import { ModalRoot } from '../components/modals/ModalRoot';
import { TooltipProvider } from '../components/ui/Tooltip';
import { Toasts } from '../components/ui/misc';
import { useCommunity,refreshCommunity } from '../backend/community';
import { InviteLanding } from '../components/modals/InvitePreview';
import { useAuth } from '../backend/auth';
import {AppLoading} from '../components/auth/AppLoading';
import { ConnectionReturn } from '../components/profile/ConnectionReturn';
import {GameActivityRoot} from '../components/profile/GameActivityRoot';
import { useAccount } from '../backend/moderation';
import { useVoice } from '../voice/state';
import { loadLanguage, type Lang } from '../i18n';

export async function mountUIE2E() {
  const params = new URLSearchParams(location.search);
  const seed = buildSeed();
  const person = seed.users[seed.meId];
  const member = seed.servers.s_onyx.members[seed.meId];
  useStore.setState((s) => {
    Object.assign(s, seed);
    s.meId = 'alice';
    s.users = {
      alice: { ...person, id: 'alice', displayName: 'Alice', country: 'DD', profileColors: ['#164e63', '#123524'] },
      bob: { ...person, id: 'bob', displayName: 'Bob', username: 'bob', country: 'DD', profileColors: ['#1b4d62', '#21142a'] },
      charlie: { ...person, id:'charlie',displayName:'Charlie',username:'charlie' },
    };
    for (const server of Object.values(s.servers)) {
      server.ownerId = 'alice';
      server.members = { alice: { ...member, userId: 'alice' }, bob: { ...member, userId: 'bob' } };
    }
    s.dms = { 'ui-dm': { id: 'ui-dm', type: 'dm', participantIds: ['alice', 'bob'], lastActivityAt: Date.now() }, 'ui-second': {id:'ui-second',type:'dm',participantIds:['alice','charlie'],lastActivityAt:Date.now()-1000} };
    s.relationships = { bob: { userId: 'bob', type: 'friend', since: Date.now() } };
    s.messages = {};
    s.voice = {};
    s.dmProfileOpen = true;
    s.view = { kind: 'dm', dmId: 'ui-dm' };
    s.settings.language = 'en';
    s.settings.animateMedia = 'hover';
  });
  document.title = 'ONYX UI E2E';
  if(params.has('empty-friends'))useStore.setState(s=>{s.relationships={};});
  if(params.has('guest'))useStore.setState(s=>{s.users[s.meId].guest=true;});
  if(params.get('page')==='friends')useStore.setState(s=>{s.view={kind:'home',page:'friends'};});
  if(new URLSearchParams(location.search).has('community')) {
    useCommunity.setState({tags:{s_onyx:{server_id:'s_onyx',label:'ONYX',image:null,enabled:true,invite_code:'fixtureinvite'}},selected:{bob:'s_onyx'}});
    useStore.setState(s=>{
      s.users.bob.displayName='rayvn';
      s.messages['ui-dm']=[{id:'ui-message',channelId:'ui-dm',authorId:'bob',type:'default',content:'Local layout regression',createdAt:Date.now(),reactions:[],attachments:[],embeds:[]}];
    });
  }
  document.documentElement.dataset.theme = 'graphite';
  document.documentElement.dataset.motion = 'full';
  document.documentElement.dataset.animateMedia = 'hover';
  useUI.getState().setMobilePanel(params.has('nav')?'nav':'main');
  useAccount.setState({admin:params.has('admin')});
  const call=params.get('call');
  if(call) {
    useStore.setState(s=>{s.call={dmId:'ui-dm',callId:'layout-only',state:call==='connected'?'connected':'ringing',startedAt:Date.now(),video:false};});
    useVoice.setState({status:'connected',mode:'cloud',room:'dm:ui-dm',peers:call==='connected'?{bob:{id:'bob',quality:'good',camera:null,screen:null,screenAudio:false,micOff:true}}:{}});
  }
  let serverId='s_onyx';
  if(params.has('strict-ids')){
    const ids:Record<string,string>={alice:'00000000-0000-4000-8000-0000000000f1',bob:'00000000-0000-4000-8000-0000000000f2',charlie:'00000000-0000-4000-8000-0000000000f3',s_onyx:'00000000-0000-4000-8000-0000000000a1'};
    for(const id of Object.keys(useStore.getState().servers))ids[id]??=crypto.randomUUID();
    const remap=(value:unknown):unknown=>typeof value==='string'?ids[value]??value:Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[ids[key]??key,remap(item)])):value;
    useStore.setState(s=>{Object.assign(s,remap(s));s.users['deleted-user']={...s.users[ids.bob],id:'deleted-user',username:'deleted',displayName:'Deleted user'};});
    serverId=ids.s_onyx;
    void refreshCommunity().catch(()=>useCommunity.setState({error:'unavailable'}));
  }
  if(params.has('official'))useStore.setState(s=>{s.servers[serverId].isOfficial=true;s.servers[serverId].ownerId=Object.values(s.users).find(u=>u.displayName==='Bob')!.id;});
  if(params.has('official'))useStore.getState().selectServer(serverId);
  if(params.has('create-server'))useUI.getState().openModal({type:'createServer'});
  if(params.get('page')==='shop')useStore.setState(s=>{s.view={kind:'home',page:'shop'};});
  if(params.has('invite'))useUI.getState().openModal({type:'invite',serverId});
  if(params.has('other-offline'))useStore.setState(s=>{const other=Object.values(s.users).find(u=>u.displayName==='Bob');if(other){other.status='offline';other.accountStatus='online';}});
  const section = params.get('section');
  if (section) useUI.getState().openSettings({ kind: 'user', section: section as 'account' });
  if(params.has('server-section'))useUI.getState().openSettings({kind:'server',serverId,section:params.get('server-section') as 'badges'});
  const lang=params.get('lang');
  if(lang){await loadLanguage(lang as Lang);useStore.setState(s=>{s.settings.language=lang as Lang;});}
  if(params.has('landing'))useAuth.setState({status:params.has('signed-in')?'ready':'signedOut'});
  if(params.has('return-connection')||params.has('game-activity'))useAuth.setState({status:'ready'});
  createRoot(document.getElementById('root')!).render(<TooltipProvider>{params.has('loading')?<AppLoading connecting={params.get('loading')==='connecting'}/>:params.has('landing')?<InviteLanding code="fixtureinvite"/>:<><AppShell />{params.has('game-activity')&&<GameActivityRoot/>}<SettingsRoot /><ModalRoot />{params.has('return-connection')&&<ConnectionReturn/>}</>}<Toasts /></TooltipProvider>);
}
