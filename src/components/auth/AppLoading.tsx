import {t} from '../../i18n';
import {OnyxMark} from '../ui/icons';

/** Real authentication/data loading only. Never delays a ready session. */
export function AppLoading({connecting=false}:{connecting?:boolean}){
 return <main className="app-loading" role="status" aria-live="polite" aria-busy="true">
  <div className="app-loading-emblem" aria-hidden="true"><OnyxMark size={112}/></div>
  <div className="app-loading-track" aria-hidden="true"><span/></div>
  <span className="sr-only">{connecting?t('Connecting…'):t('Loading your servers and messages…')}</span>
 </main>;
}
