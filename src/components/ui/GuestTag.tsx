import {t} from '../../i18n';
import {useStore} from '../../store/store';
export function GuestTag({guest,userId}:{guest?:boolean;userId?:string}){
 const stored=useStore(s=>userId?s.users[userId]?.guest:false);
 return guest||stored?<span className="guest-tag" title={t('Guest account')} aria-label={t('Guest account')}>{t('GUEST')}</span>:null;
}
