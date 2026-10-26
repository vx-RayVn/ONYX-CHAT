import {t} from '../../i18n';
import '../../styles/commerce.css';
export function PurchasePolicyLinks(){
 return <details className="billing-policy-disclosure"><summary>{t('Purchase information')}</summary><nav className="billing-policy-links" aria-label={t('Purchase terms')}><a href="https://onyxchat.site/guidelines/#purchase-terms" target="_blank" rel="noopener noreferrer">{t('Purchase terms')}</a><a href="https://onyxchat.site/guidelines/#cancel-subscription" target="_blank" rel="noopener noreferrer">{t('Cancel subscription')}</a><a href="https://onyxchat.site/guidelines/#withdraw-contract" target="_blank" rel="noopener noreferrer">{t('Withdraw contract')}</a></nav></details>;
}
