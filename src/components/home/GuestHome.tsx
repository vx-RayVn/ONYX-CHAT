import {LogOut,Plus,UserRound} from 'lucide-react';
import {useStore} from '../../store/store';
import {useUI,showMainPane} from '../../store/ui';
import {t} from '../../i18n';
import {signOut} from '../../backend/auth';
import {Button} from '../ui/Button';
import {ServerIcon} from '../layout/ServerRail';
import {OnyxServicesLogo} from '../ui/icons';
export function endGuestSession(){useUI.getState().openModal({type:'confirm',title:t('End guest session'),body:t('Without an account, you cannot return to this guest profile after signing out. Your messages stay under your guest name.'),confirmLabel:t('End guest session'),danger:true,onConfirm:()=>{useUI.getState().closeSettings();void signOut();}});}
export function GuestBanner(){
 const guest=useStore(s=>s.users[s.meId]?.guest);if(!guest)return null;
 return <div className="guest-ribbon"><span><UserRound size={16}/>{t('You’re using ONYX as a guest.')}</span><Button size="sm" variant="secondary" onClick={()=>useUI.getState().openModal({type:'guestUpgrade'})}>{t('Create free account')}</Button></div>;
}
export function GuestHome(){
 const servers=useStore(s=>s.servers),open=useStore(s=>s.selectServer),ui=useUI.getState();
 return <section className="guest-home"><div className="guest-home-heading"><span className="auth-security-icon"><UserRound size={26}/></span><h1>{t('You’re in. Say hello.')}</h1><p>{t('Join a server, send a message or meet your people in voice.')}</p></div><div className="guest-server-list">{Object.values(servers).map(server=><button key={server.id} onClick={()=>open(server.id)}><ServerIcon server={server} size={44}/><strong>{server.name}</strong></button>)}</div><div className="guest-home-actions"><Button icon={<Plus/>} onClick={()=>ui.openModal({type:'createServer',step:'join'})}>{t('Join a server')}</Button><Button variant="secondary" onClick={()=>ui.openModal({type:'guestUpgrade'})}>{t('Create free account')}</Button><Button variant="secondary" icon={<OnyxServicesLogo size={20}/>} onClick={()=>{useStore.getState().goHome('shop');showMainPane();}}>OnyxServices</Button><Button variant="ghost" icon={<LogOut/>} onClick={endGuestSession}>{t('End guest session')}</Button><Button variant="danger-ghost" onClick={()=>ui.openModal({type:'deleteAccount'})}>{t('Delete guest profile')}</Button></div></section>;
}
