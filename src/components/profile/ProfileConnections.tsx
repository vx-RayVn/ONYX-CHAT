import { ExternalLink } from 'lucide-react';
import { useProfileConnections } from '../../backend/connections';
import { BRAND_LOGOS } from '../../data/brandLogos';
import { t } from '../../i18n';
import { connectionURL } from '../../lib/socialConnections';

export function ProfileConnections({ userId }: { userId: string }) {
  const { items } = useProfileConnections(userId);
  const visible = items.filter((item) => item.is_visible);
  if (!visible.length) return null;
  return <section className="pcard-section">
    <h3 className="pcard-h">{t('Connections')}</h3>
    {visible.map(item=>{
      const brand=BRAND_LOGOS.find(b=>b.id===item.provider);if(!brand)return null;
      const href=connectionURL(item),content=<><svg viewBox="0 0 24 24" width={22} height={22} aria-hidden><path d={brand.path} fill="currentColor" /></svg><span>{brand.name}<small>{item.display_name??(item.provider==='steam'?t('Steam account'):item.external_id)}</small></span>{href&&<ExternalLink size={14}/>}</>;
      return href?<a key={item.provider} className="profile-connection" href={href} target="_blank" rel="noopener noreferrer">{content}</a>:<div key={item.provider} className="profile-connection">{content}</div>;
    })}
  </section>;
}
