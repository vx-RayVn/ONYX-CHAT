import {useId,type ReactNode} from 'react';
import {Select} from 'radix-ui';
import {Check,ChevronDown} from 'lucide-react';
import {FieldWrap} from './Field';
import {isRTL} from '../../i18n';

export function SelectField({label,value,onChange,options,disabled,placeholder,required}:{label:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string;icon?:ReactNode}[];disabled?:boolean;placeholder?:string;required?:boolean}){
 const id=useId();
 return <FieldWrap label={label} htmlFor={id}><Select.Root dir={isRTL()?'rtl':'ltr'} value={value} onValueChange={onChange} disabled={disabled} required={required}><Select.Trigger id={id} aria-label={label} className="onyx-select-trigger input"><Select.Value placeholder={placeholder}/><Select.Icon><ChevronDown size={16}/></Select.Icon></Select.Trigger><Select.Portal><Select.Content className="onyx-select-menu" position="popper" sideOffset={6} collisionPadding={12}><Select.Viewport>{options.map(option=><Select.Item className="onyx-select-option" key={option.value} value={option.value}>{option.icon}<Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator className="onyx-select-check"><Check size={16}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldWrap>;
}
