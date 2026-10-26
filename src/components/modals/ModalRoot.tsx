import { InvitePreviewModal } from './InvitePreview';
import { useUI } from '../../store/ui';
import { CreateServerModal } from './CreateServerModal';
import { CreateCategoryModal, CreateChannelModal } from './CreateChannelModal';
import { ConfirmDialog, CustomStatusModal, InviteModal, Lightbox, NewDMModal, PreviewDialog, PromptDialog, QuickSwitcher } from './Dialogs';
import { ProfileModal } from '../profile/ProfileModal';
import { CropModal } from './CropModal';
import { PlusCheckoutModal } from '../home/PlusView';
import { BanDialog, ReportDialog, SuspendDialog } from './ModerationDialogs';
import { DeleteAccountModal } from './DeleteAccountModal';
import { ScreenShareHelp } from '../voice/ScreenShareHelp';
import {GuestUpgrade} from '../auth/GuestUpgrade';
import {AccountSwitcher} from '../auth/AccountSwitcher';
import { FEATURES } from '../../config/features';

export function ModalRoot() {
  const modal = useUI((s) => s.modal);
  if (!modal) return null;
  switch (modal.type) {
    case 'accountSwitcher':return <AccountSwitcher/>;
    case 'guestUpgrade': return <GuestUpgrade reason={modal.reason} mode={modal.mode}/>;
    case 'createServer':
      return <CreateServerModal step={modal.step} />;
    case 'createChannel':
      return <CreateChannelModal serverId={modal.serverId} categoryId={modal.categoryId} channelType={modal.channelType} />;
    case 'createCategory':
      return <CreateCategoryModal serverId={modal.serverId} />;
    case 'invite':
      return <InviteModal serverId={modal.serverId} channelId={modal.channelId} />;
    case 'confirm':
      return <ConfirmDialog {...modal} />;
    case 'prompt':
      return <PromptDialog {...modal} />;
    case 'newDM':
      return <NewDMModal addTo={modal.addTo} />;
    case 'profile':
      return <ProfileModal key={modal.userId} userId={modal.userId} serverId={modal.serverId} />;
    case 'quickSwitcher':
      return <QuickSwitcher />;
    case 'lightbox':
      return <Lightbox src={modal.src} name={modal.name} />;
    case 'customStatus':
      return <CustomStatusModal />;
    case 'crop':
      return <CropModal kind={modal.kind} src={modal.src} poster={modal.poster} animated={modal.animated} />;
    case 'plusCheckout':
      return FEATURES.onyxPlus ? <PlusCheckoutModal /> : null;
    case 'preview':
      return <PreviewDialog title={modal.title} body={modal.body} icon={modal.icon} />;
    case 'ban':
      return <BanDialog serverId={modal.serverId} userId={modal.userId} />;
    case 'report':
      return <ReportDialog target={modal.target} />;
    case 'suspend':
      return <SuspendDialog userId={modal.userId} onDone={modal.onDone} />;
    case 'deleteAccount':
      return <DeleteAccountModal />;
    case 'invitePreview':
      return <InvitePreviewModal code={modal.code} />;
    case 'screenShareHelp':
      return <ScreenShareHelp issue={modal.issue} />;
    default:
      return null;
  }
}
