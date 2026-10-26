/**
 * Development-only deep links for QA screenshots (never used in production):
 *   #app=home:plus | home:supporters | home:shop | home:friends
 *   #app=dm:<dmId> | server:<serverId>:<channelId> | profile:<userId>
 *   #app=settings:<section>[:<tab>]
 *   #app=server-settings:<serverId>:<section> | channel-settings:<channelId>:<section>
 *   #app=category-settings:<serverId>:<categoryId> | viewas:<serverId>:<roleId,…|everyone>
 *   #app=profile:<userId>:<serverId>
 * Optional: &theme=<theme> &lang=<code> &w=<mobile pane: nav|main>
 */
import { useStore } from '../store/store';
import { useUI, type ChannelSettingsSection, type ServerSettingsSection, type UserSettingsSection } from '../store/ui';
import type { Lang } from '../i18n';
import type { Theme } from '../types';

export function applyDevLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const app = params.get('app');
  const s = useStore.getState();
  const ui = useUI.getState();
  const theme = params.get('theme');
  const lang = params.get('lang');
  if (theme) s.setSetting('theme', theme as Theme);
  if (lang) s.setSetting('language', lang as Lang);
  if (!app) return;
  const [kind, a, b, c] = app.split(':');
  if (kind === 'home') s.goHome((a as 'friends') || 'friends');
  if (kind === 'dm' && a) s.openDM(a);
  if (kind === 'server' && a) {
    if (b) s.selectChannel(a, b);
    else s.selectServer(a);
  }
  if (kind === 'profile' && a) ui.openModal({ type: 'profile', userId: a, serverId: b });
  if (kind === 'server-settings' && a) ui.openSettings({ kind: 'server', serverId: a, section: (b as ServerSettingsSection) || 'overview' });
  if (kind === 'channel-settings' && a) ui.openSettings({ kind: 'channel', channelId: a, section: (b as ChannelSettingsSection) || 'overview' });
  if (kind === 'category-settings' && a && b) ui.openSettings({ kind: 'category', serverId: a, categoryId: b, section: 'permissions' });
  if (kind === 'viewas' && a) {
    if (c) s.selectChannel(a, c);
    else s.selectServer(a);
    useStore.getState().setViewAs({ serverId: a, roleIds: !b || b === 'everyone' ? [] : b.split(',') });
  }
  if (kind === 'settings') ui.openSettings({ kind: 'user', section: (a as UserSettingsSection) || 'account', tab: b });
  const pane = params.get('w');
  if (pane === 'main' || pane === 'nav') ui.setMobilePanel(pane);
}
