import {GameActivityRoot} from './components/profile/GameActivityRoot';
import {useConnectionReturn} from './components/profile/ConnectionReturn';
import { CommunityRoot } from './components/layout/CommunityRoot';
import { InviteLanding } from './components/modals/InvitePreview';
import { locationInvite } from './lib/invites';
import { Fragment, lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ModalRoot } from './components/modals/ModalRoot';
import { SettingsRoot } from './components/settings/SettingsRoot';
import { TooltipProvider } from './components/ui/Tooltip';
import { Toasts } from './components/ui/misc';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useStore } from './store/store';
import { useUI } from './store/ui';
import { VoiceRoot } from './components/voice/VoiceRoot';
import { loadLanguage, t } from './i18n';
import { CLOUD, CONFIG_ERROR } from './backend/config';
import { syncEmailLanguage, useAuth } from './backend/auth';
import { AuthScreen } from './components/auth/AuthScreen';
import {AppLoading} from './components/auth/AppLoading';
import { toast } from './store/ui';
import { initNotifications } from './notifications/notifier';

/** Dev-only artwork QA page, opened with ?gallery or #gallery (never bundled into production). */
const CosmeticsGallery = import.meta.env.DEV ? lazy(() => import('./dev/CosmeticsGallery')) : null;

function useDevGallery() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => import.meta.env.DEV && (location.hash.startsWith('#gallery') || new URLSearchParams(location.search).has('gallery')),
  );
}

/** Mirrors local preferences onto <html> so CSS can react to them. */
function useRootAttributes() {
  const settings = useStore((s) => s.settings);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const root = document.documentElement;
    const reduced = settings.motion === 'reduced' || (settings.motion === 'system' && systemReduced);
    root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
    root.dataset.motion = reduced ? 'reduced' : 'full';
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    root.dataset.animateMedia = reduced ? 'hover' : settings.animateMedia;
    root.dataset.underlineLinks = String(settings.underlineLinks);
    root.dataset.roleColors = String(settings.showRoleColors);
    root.style.setProperty('--chat-scale', String(settings.fontScale));
    root.style.setProperty('--group-gap', `${settings.groupSpacing}px`);
    const meta = getComputedStyle(root).getPropertyValue('--bg-app').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', meta || '#07090B');
  }, [settings, systemReduced]);
}

function useGlobalHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const ui = useUI.getState();
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (ui.modal?.type === 'quickSwitcher') ui.closeModal();
        else ui.openModal({ type: 'quickSwitcher' });
      } else if (mod && e.key === ',') {
        e.preventDefault();
        ui.openSettings({ kind: 'user', section: 'account' });
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const s = useStore.getState();
        if (s.view.kind !== 'server') return;
        const server = s.servers[s.view.serverId];
        const cats = [...server.categories].sort((a, b) => a.position - b.position);
        const order = [null, ...cats.map((c) => c.id)].flatMap((catId) =>
          Object.values(s.channels)
            .filter((c) => c.serverId === server.id && c.categoryId === catId && c.type !== 'voice')
            .sort((a, b) => a.position - b.position),
        );
        const idx = order.findIndex((c) => c.id === (s.view as { channelId: string | null }).channelId);
        const next = order[idx + (e.key === 'ArrowUp' ? -1 : 1)];
        if (next) {
          e.preventDefault();
          s.selectChannel(server.id, next.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Loads the selected language before rendering; remounts the UI on change. */
/** Dev-only QA deep links (#app=…), see src/dev/devLinks.ts. */
function useDevLinks() {
  useEffect(() => {
    if (!import.meta.env.DEV || !/(app|theme|lang)=/.test(location.hash)) return;
    import('./dev/devLinks').then((m) => m.applyDevLink());
  }, []);
}

function useLanguageReady() {
  const lang = useStore((s) => s.settings.language);
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadLanguage(lang).then(() => alive && setReady(lang));
    return () => {
      alive = false;
    };
  }, [lang]);
  return ready;
}

/** A secret key in .env.local is never used – say so instead of silently falling back to the demo. */
function useConfigWarning(ready: boolean) {
  useEffect(() => {
    if (ready && CONFIG_ERROR === 'secret-key')
      toast({
        tone: 'danger',
        title: t('Secret key refused'),
        body: t('.env.local contains a secret / service_role key. It must never be used in the browser – enter the publishable (anon) key instead. ONYX runs as a local demo until then.'),
      });
  }, [ready]);
}

export default function App() {
  useEffect(initNotifications, []);
  useRootAttributes();
  useGlobalHotkeys();
  useDevLinks();
  const ready = useLanguageReady();
  const gallery = useDevGallery();
  const invite = useSyncExternalStore(cb => { window.addEventListener('popstate',cb); return () => window.removeEventListener('popstate',cb); }, () => locationInvite(location.pathname,location.search));
  const authStatus = useAuth((s) => s.status);
  useConnectionReturn(!!ready);
  useConfigWarning(!!ready);
  // Emails (codes, password reset) come in the app language.
  useEffect(() => {
    if (ready && authStatus === 'ready') syncEmailLanguage();
  }, [ready, authStatus]);
  useEffect(()=>{
    if(!ready||authStatus!=='ready')return;
    const params=new URLSearchParams(location.search);
    if(params.get('settings')==='bugs')useUI.getState().openSettings({kind:'user',section:'bugs'});
    if(['/login','/signup','/app.html'].includes(location.pathname))history.replaceState(null,'','/app'+location.search+location.hash);
  },[ready,authStatus]);
  useEffect(() => {
    if(ready && authStatus === 'ready' && new URLSearchParams(location.search).has('developer')) { const bot=new URLSearchParams(location.search).get('bot');history.replaceState(null,'','/app'); useUI.getState().openSettings({kind:'user',section:'developer',tab:bot&&/^[a-f0-9-]{36}$/i.test(bot)?bot:undefined}); }
  }, [ready, authStatus]);
  if (!ready) return <AppLoading connecting/>;
  if (invite) return <TooltipProvider><InviteLanding code={invite} /><Toasts /></TooltipProvider>;
  if (CosmeticsGallery && gallery) {
    return (
      <TooltipProvider>
        <Suspense fallback={null}>
          <CosmeticsGallery />
        </Suspense>
      </TooltipProvider>
    );
  }
  // Cloud mode: sign-in first; the app shell only renders once the account data is loaded.
  if (CLOUD && authStatus !== 'ready') {
    return (
      <TooltipProvider delayDuration={350} skipDelayDuration={250}>
        <Fragment key={ready}>
          <AuthScreen />
          <Toasts />
        </Fragment>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={250}>
      <Fragment key={ready}>
        <AppShell />
        <SettingsRoot />
        <ModalRoot />
        <Toasts />
      </Fragment>
      <CommunityRoot /><GameActivityRoot />
      <VoiceRoot />
    </TooltipProvider>
  );
}
