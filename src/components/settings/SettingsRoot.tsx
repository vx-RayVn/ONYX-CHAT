import { useUI } from '../../store/ui';
import { UserSettings } from './UserSettings';
import { ServerSettings } from './ServerSettings';
import { CategorySettings, ChannelSettings } from './ChannelSettings';

export function SettingsRoot() {
  const settings = useUI((s) => s.settings);
  if (!settings) return null;
  if (settings.kind === 'user') return <UserSettings section={settings.section} />;
  if (settings.kind === 'server') return <ServerSettings serverId={settings.serverId} section={settings.section} roleId={settings.roleId} />;
  if (settings.kind === 'category') return <CategorySettings serverId={settings.serverId} categoryId={settings.categoryId} section={settings.section} />;
  return <ChannelSettings channelId={settings.channelId} section={settings.section} />;
}
