/**
 * What this browser can do for voice and video – checked once, used to hide
 * or explain controls honestly instead of offering something that fails.
 */
import { t } from '../i18n';
import { isBrowserSupported } from 'livekit-client';
import { screenCaptureAvailability, screenCapturePlatform } from './screenCapture';

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const nav = typeof navigator === 'undefined' ? undefined : navigator;

export const isIOS = /iPad|iPhone|iPod/.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);
export const isAndroid = /Android/i.test(ua);
export const isMobile = isIOS || isAndroid;
export const isFirefox = /Firefox\/|FxiOS/.test(ua);
export const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
/** Desktop/Android Chromium; iOS browser names do not imply desktop Chromium audio support. */
export const isChromium = !isIOS && /Chrome\/|Chromium\/|Edg\//.test(ua);
export const isSafari = !isChromium && !isFirefox && /Safari\//.test(ua);

export const screenPlatform = screenCapturePlatform(ua, nav?.platform, nav?.maxTouchPoints);

/** Check again at the start attempt; an absent API must not silently fail. */
export function screenCaptureUnavailableReason() {
  type CapturePolicy = { allowsFeature: (feature: string) => boolean; features?: () => string[] };
  const doc = typeof document === 'undefined' ? undefined : document as Document & { permissionsPolicy?: CapturePolicy; featurePolicy?: CapturePolicy };
  const policy = doc?.permissionsPolicy ?? doc?.featurePolicy;
  let policyAllowed: boolean | undefined;
  try {
    // Some engines expose a policy API without knowing the display-capture directive.
    if (policy && (!policy.features || policy.features().includes('display-capture'))) policyAllowed = policy.allowsFeature('display-capture');
  } catch { /* No reliable policy information; let the browser handle the request. */ }
  return screenCaptureAvailability({ secure: typeof window !== 'undefined' && window.isSecureContext,
    capture: nav?.mediaDevices?.getDisplayMedia, policyAllowed });
}

export const support = {
  rtc: typeof window !== 'undefined' && isBrowserSupported(),
  /** Microphone and camera at all (needs a secure context: https or localhost). */
  media: typeof nav?.mediaDevices?.getUserMedia === 'function',
  /** Feature detection, including mobile browsers when they actually expose screen capture. */
  screenShare: screenCaptureUnavailableReason() === null,
  /** Feature detection, including Safari on macOS since 18.4. */
  outputSelection: typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,
  /**
   * The Web Audio mix may boost volume only if its output remains routable,
   * or if this browser can use the default output only in the first place.
   */
  volumeBoost: typeof AudioContext !== 'undefined' && ('setSinkId' in AudioContext.prototype || !(typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype)),
  /** Browser picture-in-picture for a video. */
  pictureInPicture: typeof document !== 'undefined' && !!document.pictureInPictureEnabled,
  fullscreen: typeof document !== 'undefined' && !!document.fullscreenEnabled,
};

/** How much sound screen sharing can include here. */
export type ScreenAudio = 'system' | 'tab' | 'none';
export const screenAudio: ScreenAudio = !support.screenShare || isMobile ? 'none' : isChromium ? (/Windows|CrOS/.test(ua) ? 'system' : 'tab') : 'none';

/** Audio limitations shown inside the share menu, after the user asks to share. */
export function screenShareNote(): string | null {
  if (!support.screenShare) return null;
  if (screenAudio === 'none') return t('This browser can share the picture, but not screen audio. You can still speak through your microphone.');
  if (screenAudio === 'tab') return t('On this system, share a browser tab to include sound.');
  return null;
}

/** Why microphone and camera are unavailable (null when they work). */
export function mediaNote(): string | null {
  if (!support.rtc) return t('This browser can’t connect to voice or video calls. Try a current version of Chrome, Edge, Firefox or Safari.');
  if (support.media) return null;
  if (typeof window !== 'undefined' && !window.isSecureContext) return t('Microphone and camera only work over a secure connection (https).');
  return t('This browser doesn’t give access to a microphone or camera.');
}
