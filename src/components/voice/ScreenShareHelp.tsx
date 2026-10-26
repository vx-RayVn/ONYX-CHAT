import { MonitorUp } from 'lucide-react';
import { t } from '../../i18n';
import { useUI } from '../../store/ui';
import type { ScreenCaptureIssue } from '../../voice/screenCapture';
import { screenPlatform } from '../../voice/support';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

function explanation(issue: ScreenCaptureIssue, browser: string): string {
  switch (issue) {
    case 'unavailable':
      switch (screenPlatform.device) {
        case 'iphone': return t('{browser} on this iPhone does not provide screen capture to websites. ONYX cannot enable a feature missing from the browser.', { browser });
        case 'ipad': return t('{browser} on this iPad does not provide screen capture to websites. ONYX cannot enable a feature missing from the browser.', { browser });
        case 'android': return t('{browser} on this Android device does not provide screen capture to websites. ONYX cannot enable a feature missing from the browser.', { browser });
        default: return t('{browser} does not provide screen capture to websites. ONYX cannot enable a feature missing from the browser.', { browser });
      }
    case 'insecure': return t('Screen capture requires a secure connection. Open ONYX over HTTPS and try again.');
    case 'policy': return t('Screen capture is blocked by this page’s browser policy. Open ONYX directly in a separate tab. On a managed device, ask your administrator to allow screen capture.');
    case 'permission': return t('Screen sharing was cancelled or permission was denied. Nothing is being shared. Try again, select a source and allow screen recording in your browser or system settings.');
    case 'unsupported': return t('The browser reported that this type of screen capture is not supported. Try another source or share from a computer.');
    case 'activation': return t('Return to the ONYX tab and start sharing with the screen button. The browser requires a direct click or tap in an active tab.');
    case 'source': return t('The browser could not find a screen, window or tab to share. Choose another source or check your system’s screen-recording permissions.');
    case 'busy': return t('The operating system could not start screen capture. Check screen-recording permissions, close other capture apps and try again. Protected content may not be shareable.');
    case 'failed': return t('Screen capture failed unexpectedly. Try again or choose another source. If it keeps happening, report it to ONYX with your browser and device.');
  }
}

function alternative(): string {
  switch (screenPlatform.device) {
    case 'iphone':
    case 'ipad': return t('Update {system} and try the latest Safari. If sharing is still unavailable, share from a computer. Adding ONYX to the Home Screen does not enable missing screen capture.', { system: screenPlatform.device === 'ipad' ? 'iPadOS' : 'iOS' });
    case 'android': return t('Update your browser. If sharing is still unavailable, share from a computer. Desktop mode and installing ONYX as a website app do not enable missing screen capture.');
    default: return t('Try a current desktop version of Chrome, Edge, Firefox or Safari. Updating the browser may add screen-sharing support.');
  }
}

/** Only opened by a share attempt; it never takes space away from the call stage. */
export function ScreenShareHelp({ issue }: { issue: ScreenCaptureIssue }) {
  const close = useUI((s) => s.closeModal);
  const browser = screenPlatform.browser ?? t('This browser');
  const device = { iphone: 'iPhone', ipad: 'iPad', android: 'Android', desktop: '' }[screenPlatform.device];
  return (
    <Modal open onClose={close} size="md" className="screen-share-dialog" title={t('Screen sharing unavailable')} description={[browser, device].filter(Boolean).join(' · ')}
      bodyClassName="screen-share-help" footer={<Button onClick={close}>{t('Got it')}</Button>}>
      <span className="screen-share-help-icon" aria-hidden><MonitorUp /></span>
      <p>{explanation(issue, browser)}</p>
      {issue === 'unavailable' && <p>{alternative()}</p>}
      <p className="screen-share-help-call">{t('Your call stays connected. You can still watch other people’s streams.')}</p>
    </Modal>
  );
}
