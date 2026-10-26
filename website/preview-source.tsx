/** Build-only artwork source. Imports the real UI without mounting Auth or connecting media. */
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server.browser';
import {flushSync} from 'react-dom';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/orbitron';
import '../src/styles/tokens.css';
import '../src/styles/themes.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import '../src/styles/art.css';
import '../src/styles/cosmetics.css';
import '../src/styles/layout.css';
import '../src/styles/chat.css';
import '../src/styles/profile.css';
import '../src/styles/views.css';
import '../src/styles/studio.css';
import '../src/styles/voice.css';
import '../src/styles/responsive.css';
import {ProfileCard} from '../src/components/profile/ProfileCard';
import {ProfileFrame} from '../src/components/cosmetics/Frames';
import {ProfileEffect} from '../src/components/cosmetics/Effects';
import {AvatarDecoration} from '../src/components/cosmetics/Decorations';
import {StyledName} from '../src/components/cosmetics/StyledName';
import {Banner} from '../src/components/ui/Banner';
import {TooltipProvider} from '../src/components/ui/Tooltip';
import {Wordmark} from '../src/components/ui/icons';
import {AppShell} from '../src/components/layout/AppShell';
import {CallPanel} from '../src/components/voice/CallPanel';
import {ITEMS,NAME_PRESETS} from '../src/data/cosmetics';
import {buildSeed} from '../src/data/seed';
import {useStore} from '../src/store/store';
import {useUI} from '../src/store/ui';
import {useVoice} from '../src/voice/state';
import {CLOUD} from '../src/backend/config';
import profile from './rayvn-profile.json';
import type {User} from '../src/types';

if(CLOUD)throw Error('Website artwork must run locally, without a cloud session.');
const seed=buildSeed(),rayvn=profile as User;
const onyx:User={...rayvn,id:'website-onyx',username:'onyx',displayName:'ONYX',avatar:{kind:'image',src:'/brand/onyx-logo-128.webp'},avatarColor:'#10b981',profileColors:['#103d30','#0b1418'],nameStyle:undefined,profileEffect:undefined,profileFrame:undefined,avatarDecoration:undefined,customStatus:undefined,memberNumber:undefined,badges:[]};
useStore.setState(s=>{Object.assign(s,seed);s.meId=onyx.id;s.users={[onyx.id]:onyx,[rayvn.id]:rayvn};s.dms={'website-chat':{id:'website-chat',type:'dm',participantIds:[onyx.id,rayvn.id],lastActivityAt:Date.now()}};s.relationships={[rayvn.id]:{userId:rayvn.id,type:'friend',since:Date.now()}};s.messages={'website-chat':[
 {id:'website-message-1',channelId:'website-chat',authorId:rayvn.id,type:'default',content:'Anyone up for a game?',createdAt:Date.now()-120000,reactions:[],attachments:[],embeds:[]},
 {id:'website-message-2',channelId:'website-chat',authorId:onyx.id,type:'default',content:'I’m in. Meet you in voice.',createdAt:Date.now()-100000,reactions:[{emoji:'🔥',userIds:[rayvn.id]}],attachments:[],embeds:[]},
 {id:'website-message-3',channelId:'website-chat',authorId:rayvn.id,type:'default',content:'Give me five minutes 🎧',createdAt:Date.now()-80000,reactions:[],attachments:[],embeds:[]},
 ]};s.notes={};s.voice={};s.view={kind:'dm',dmId:'website-chat'};s.dmProfileOpen=true;s.settings.language='en';s.settings.animateMedia='always';s.settings.showCountry=true;s.settings.showActivity=false;s.call=null;for(const server of Object.values(s.servers)){server.members={[onyx.id]:{userId:onyx.id,joinedAt:Date.now(),roleIds:[]},[rayvn.id]:{userId:rayvn.id,joinedAt:Date.now(),roleIds:[]}};server.ownerId=onyx.id;}s.serverOrder=s.serverOrder.slice(0,2);});
useUI.getState().setMobilePanel('main');
// Static rendering must see this isolated public fixture, not a persisted initial snapshot.
useStore.getInitialState=useStore.getState;
document.documentElement.dataset.theme='graphite';document.documentElement.dataset.motion='full';document.documentElement.dataset.animateMedia='always';
const root=createRoot(document.getElementById('root')!);
const markup=(node:React.ReactNode,prefix:string)=>renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>,{identifierPrefix:'web-'+prefix+'-'});
const allowed={banner:['prism-glass','emerald-aurora','synthwave','night-ridge','sakura-banner','neon-rain','void-rift-banner','winter-banner'],effect:['sakura-petals','shooting-stars','aurora-veil','fireflies','void-open','winter-snowfall'],frame:['onyx-fracture-frame','celestial-frame','sakura-frame','void-frame','plasma-frame','winter-frame'],decoration:['headset','laurel','orbit','sakura','neon-ears','plasma-arc']};
const catalogue=Object.fromEntries(Object.entries(allowed).map(([type,ids])=>[type,ITEMS.filter(item=>item.type===type&&ids.includes(item.id)).map(item=>({id:item.id,label:item.name,animated:!!item.animated,html:markup(type==='banner'?<Banner source={{kind:'preset',id:item.id}}/>:type==='effect'?<ProfileEffect effect={item.id}/>:type==='frame'?<ProfileFrame id={item.id}/>:<AvatarDecoration id={item.id}/>,type+'-'+item.id)}))]));
catalogue.name=NAME_PRESETS.filter(item=>['prism','velocity','synth','emerald-glow','impact'].includes(item.id)).map(item=>({id:item.id,label:item.name,animated:item.style.effect==='prism',html:markup(<StyledName style={item.style} className="truncate">rayvn</StyledName>,'name-'+item.id)}));
const previewUser={...rayvn,id:onyx.id};
const profileHTML=markup(<ProfileCard user={previewUser} variant="preview" hideSections/>,'rayvn');
const exportData={profile:profileHTML,wordmark:markup(<Wordmark/>,'wordmark'),catalogue,defaults:{banner:rayvn.banner?.kind==='preset'?rayvn.banner.id:'prism-glass',effect:rayvn.profileEffect,frame:rayvn.profileFrame,decoration:rayvn.avatarDecoration,name:'prism'},colors:rayvn.profileColors};
const mount=(mode:string)=>{if(mode==='profile'){flushSync(()=>root.render(<TooltipProvider><ProfileCard user={previewUser} variant="preview" hideSections/></TooltipProvider>));return;}if(mode==='call'){useStore.setState(s=>{s.call={dmId:'website-chat',callId:null,state:'connected',startedAt:Date.now()-732000,video:false};s.voice['website-chat']=[{userId:onyx.id,joinedAt:Date.now()},{userId:rayvn.id,joinedAt:Date.now()}];});useVoice.setState({status:'connected',mode:'local',room:'website-chat',grants:{speak:true,video:true,screen:true},peers:{[rayvn.id]:{id:rayvn.id,quality:'good',camera:null,screen:null,screenAudio:false,micOff:false}}});flushSync(()=>root.render(<TooltipProvider><div className="website-call-art"><CallPanel dmId="website-chat"/></div></TooltipProvider>));}else{useStore.setState(s=>{s.call=null;s.voice={};});useVoice.setState({status:'idle',peers:{}});flushSync(()=>root.render(<TooltipProvider><AppShell/></TooltipProvider>));}};
Object.assign(window,{__websiteArtwork:{data:exportData,mount}});mount('chat');
