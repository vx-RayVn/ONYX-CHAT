import { useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Ellipsis, X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { t } from '../../i18n';
import { IconButton } from '../ui/Button';
import { TopBar } from './TopBar';

/** Preserve the desktop toolbar; give touch screens one spacious actions panel. */
export function HeaderTools({children,primary}:{children?:ReactNode;primary?:ReactNode}) {
  const compact=useIsMobile();
  const [open,setOpen]=useState(false);
  if(!compact)return <>{(primary||children)&&<div className="view-header-tools">{primary}{children}</div>}<TopBar/></>;
  return <div className="header-touch-tools">{primary}<Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><IconButton label={t('More actions')} tooltip={false} active={open}><Ellipsis/></IconButton></Popover.Trigger>
    <Popover.Portal><Popover.Content className="popover header-overflow" align="end" sideOffset={8} collisionPadding={12} aria-label={t('More actions')}>
      <div className="header-overflow-head"><strong>{t('More actions')}</strong><Popover.Close asChild><IconButton label={t('Close')} tooltip={false}><X/></IconButton></Popover.Close></div>
      <div className="header-overflow-actions">{children}</div><TopBar/>
    </Popover.Content></Popover.Portal>
  </Popover.Root></div>;
}
