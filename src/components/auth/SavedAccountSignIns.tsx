import {useState} from 'react';
import {useSavedAccounts,forgetAccount} from '../../backend/accounts';
import {resumeSavedAccount,accountSwitchError} from '../../backend/auth';
import {t} from '../../i18n';
import {UserRound,Trash2} from 'lucide-react';
import {IconButton} from '../ui/Button';

export function SavedAccountSignIns(){
 const accounts=useSavedAccounts(s=>s.accounts),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!accounts.length)return null;
 const resume=async(id:string)=>{if(busy)return;setBusy(true);setError('');try{await resumeSavedAccount(id);}catch(error){setError(accountSwitchError(error));}finally{setBusy(false);}};
 return <section className="saved-account-signins" aria-label={t('Remembered accounts')}><p className="field-label">{t('Remembered accounts')}</p><ul className="account-switch-list">{accounts.map(account=><li key={account.id}>
  <button className="account-switch-identity" type="button" disabled={busy} onClick={()=>void resume(account.id)} aria-label={t('Switch to {name}',{name:account.name})}><span className="account-switch-avatar" aria-hidden="true"><UserRound size={22}/></span><span className="account-switch-label"><strong>{account.name}</strong><small>{account.email}</small></span></button>
  <IconButton label={t('Forget {name} on this device',{name:account.name})} disabled={busy} onClick={()=>{try{forgetAccount(account.id);}catch(error){setError(accountSwitchError(error));}}}><Trash2 size={17}/></IconButton>
 </li>)}</ul>{error&&<p className="field-error" role="alert">{error}</p>}</section>;
}
