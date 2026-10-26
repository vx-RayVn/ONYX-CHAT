import {useEffect} from 'react';
import {useAuth} from '../../backend/auth';
import {finishConnection} from '../../backend/connections';
import {useUI,toast} from '../../store/ui';
import {t} from '../../i18n';
export function useConnectionReturn(ready:boolean){
 const status=useAuth(s=>s.status);
 useEffect(()=>{
  if(!ready||status!=='ready')return;
  const fragment=location.hash,result=new URLSearchParams(fragment.slice(1)).get('connection');
  if(!['finish','failed','cancelled','ok'].includes(result??''))return;
  // Remove receipts before any further navigation; StrictMode cannot submit a second finish.
  history.replaceState(null,'',location.pathname+location.search);
  useUI.getState().openSettings({kind:'user',section:'connections'});
  if(result==='finish')void finishConnection(fragment).then(()=>toast({title:t('Account connected')})).catch(error=>toast({tone:'danger',title:t('Couldn’t update connection'),body:error instanceof Error?error.message:t('Try again in a moment.')}));
  else if(result==='failed')toast({tone:'danger',title:t('Couldn’t update connection'),body:t('Try again in a moment.')});
 },[ready,status]);
}
export function ConnectionReturn(){useConnectionReturn(true);return null;}
