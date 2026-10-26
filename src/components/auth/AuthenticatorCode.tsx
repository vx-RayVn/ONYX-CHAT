import {t} from '../../i18n';
import {TextField} from '../ui/Field';
export function AuthenticatorCode({value,onChange,disabled=false}:{value:string;onChange:(code:string)=>void;disabled?:boolean}){
 return <div className="authenticator-code"><TextField label={t('Authenticator code')} value={value} onChange={event=>onChange(event.target.value.replace(/[^0-9]/g,'').slice(0,6))} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus disabled={disabled} placeholder="000000" dir="ltr"/></div>;
}
