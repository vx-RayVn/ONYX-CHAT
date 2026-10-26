import {DiscoverView} from '../home/DiscoverView';
import {useDesktopChrome} from '../../hooks/useDesktopChrome';
import { cn } from '../../lib/utils';
import { useIsMobile, useMediaQuery } from '../../hooks/useMediaQuery';
import { useTouchViewport } from '../../hooks/useTouchViewport';
import {usePaneSwipe} from '../../hooks/usePaneSwipe';
import {useRef} from 'react';
import { useStore } from '../../store/store';
import { useUI } from '../../store/ui';
import { ServerRail } from './ServerRail';
import { ServerSidebar } from './ServerSidebar';
import { HomeSidebar } from './HomeSidebar';
import { ChatView } from '../chat/ChatView';
import { VoiceView } from '../voice/VoiceView';
import { FriendsView } from '../home/FriendsView';
import { PlusView } from '../home/PlusView';
import { ShopView } from '../home/ShopView';
import { SupportersView } from '../home/SupportersView';
import { NoChannelView } from '../chat/NoChannelView';
import { NoAccessView, ViewAsBanner } from '../chat/Access';
import { canSee } from '../../store/selectors';
import { NotifyPrompt } from '../notifications/NotifyBits';
import { useTabBadge } from '../../notifications/badge';
import {GuestBanner,GuestHome} from '../home/GuestHome';
import { FEATURES } from '../../config/features';

function MainContent() {
  const guest=useStore(s=>s.users[s.meId]?.guest);
  const view = useStore((s) => s.view);
  const channel = useStore((s) => (s.view.kind === 'server' && s.view.channelId ? s.channels[s.view.channelId] : undefined));
  const visible = useStore((s) => !channel || canSee(s, channel.id));

  if (view.kind === 'home') {
    switch (view.page) {
      case 'discover': return guest ? <GuestHome/> : <DiscoverView/>;
      case 'plus':
        return FEATURES.onyxPlus ? <PlusView /> : guest ? <GuestHome /> : <FriendsView />;
      case 'supporters':
        return FEATURES.onyxPlus ? <SupportersView /> : guest ? <GuestHome /> : <FriendsView />;
      case 'shop':
        return <ShopView />;
      default:
        return guest?<GuestHome/>:<FriendsView />;
    }
  }
  if (view.kind === 'dm') return <ChatView key={view.dmId} channelId={view.dmId} />;
  if (!channel) return <NoChannelView serverId={view.serverId} />;
  if (!visible) return <NoAccessView channelId={channel.id} />;
  if (channel.type === 'voice') return <VoiceView key={channel.id} channelId={channel.id} />;
  return <ChatView key={channel.id} channelId={channel.id} />;
}

export function AppShell() {
  useDesktopChrome();
  const guest=useStore(s=>s.users[s.meId]?.guest);
  const view = useStore((s) => s.view);
  const isMobile = useIsMobile();
  const touch = useMediaQuery('(pointer: coarse)');
  useTouchViewport(isMobile || touch);
  const mobilePanel = useUI((s) => s.mobilePanel);
  const bodyRef=useRef<HTMLDivElement>(null);
  usePaneSwipe(bodyRef,isMobile);
  useTabBadge();

  return (
    <div className={cn('app', isMobile && 'is-mobile', isMobile && `mobile-${mobilePanel}`)}>
      <GuestBanner/>
      <div className="app-body" ref={bodyRef}>
        <div className="rail-pane" inert={isMobile&&mobilePanel!=='nav'}><ServerRail /></div>
        <div className="workspace">
          <div className="channel-pane" inert={isMobile&&mobilePanel!=='nav'}>{view.kind === 'server' ? <ServerSidebar serverId={view.serverId} /> : <HomeSidebar />}</div>
          <main className="main" inert={isMobile&&mobilePanel!=='main'}>
            {!guest&&<NotifyPrompt />}
            {view.kind === 'server' && <ViewAsBanner serverId={view.serverId} />}
            <MainContent />
          </main>
        </div>
      </div>
    </div>
  );
}
