import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Dialog, Popover } from 'radix-ui';
import { Maximize2, X } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { ID } from '../../types';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { ProfileCard } from './ProfileCard';
import { SelfProfileCard } from './SelfProfileCard';
import { t } from '../../i18n';

interface Props {
  userId: ID;
  serverId?: ID;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

function Content({ userId, serverId, close }: { userId: ID; serverId?: ID; close: () => void }) {
  const user = useStore((s) => s.users[userId]);
  const meId = useStore((s) => s.meId);
  if (!user) return null;
  if (userId === meId) return <SelfProfileCard serverId={serverId} onClose={close} />;
  return (
    <ProfileCard user={user} serverId={serverId} onClose={close}>
      <button
        className="pcard-expand"
        onClick={() => {
          close();
          useUI.getState().openModal({ type: 'profile', userId, serverId });
        }}
      >
        <Maximize2 size={13} /> {t('Full profile')}
      </button>
    </ProfileCard>
  );
}

/** Wraps any trigger (avatar, name, member row) with the profile popout. */
export function UserPopover({ userId, serverId, children, side = 'right', align = 'start' }: Props) {
  return <ProfileSurface side={side} align={align} content={close=><Content userId={userId} serverId={serverId} close={close}/>}>{children}</ProfileSurface>;
}

export function ProfileSurface({children,content,side='right',align='start'}:{children:ReactElement;content:(close:()=>void)=>ReactNode;side?:Props['side'];align?:Props['align']}) {
  const [open, setOpen] = useState(false);
  const sheet=useMediaQuery('(max-width: 767px), (pointer: coarse)');
  const ref=useRef<HTMLDivElement>(null);
  if(sheet)return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild>{children}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="profile-sheet-overlay"/><Dialog.Content ref={ref} className="profile-sheet" aria-describedby={undefined} onOpenAutoFocus={e=>{e.preventDefault();ref.current?.focus({preventScroll:true});}}>
    <Dialog.Title className="sr-only">{t('Profile')}</Dialog.Title><Dialog.Close className="profile-sheet-close icon-btn" aria-label={t('Close')}><X size={22}/></Dialog.Close><div className="profile-sheet-scroll">{content(()=>setOpen(false))}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="popover profile-pop"
          side={side}
          align={align}
          sideOffset={12}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          {content(()=>setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
