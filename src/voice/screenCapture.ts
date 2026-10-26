/** Screen capture capabilities and failures, without assuming support from an OS version. */
export type ScreenCaptureIssue = 'unavailable' | 'insecure' | 'policy' | 'permission' | 'unsupported' | 'activation' | 'source' | 'busy' | 'failed';
export type ScreenDevice = 'iphone' | 'ipad' | 'android' | 'desktop';

export function screenCaptureAvailability(env: { secure: boolean; capture: unknown; policyAllowed?: boolean }): ScreenCaptureIssue | null {
  if (!env.secure) return 'insecure';
  if (env.policyAllowed === false) return 'policy';
  return typeof env.capture === 'function' ? null : 'unavailable';
}

export function screenCapturePlatform(ua: string, platform = '', touchPoints = 0): { device: ScreenDevice; browser: string | null } {
  const device = /iPad/.test(ua) || (platform === 'MacIntel' && touchPoints > 1) ? 'ipad'
    : /iPhone|iPod/.test(ua) ? 'iphone' : /Android/i.test(ua) ? 'android' : 'desktop';
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? 'Edge'
    : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
    : /OPR\/|OPiOS\//.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /Chrome\/|Chromium\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : null;
  return { device, browser };
}

/** A cancelled picker and a denied permission share NotAllowedError: never pretend to know which happened. */
export function screenCaptureFailure(error: unknown): ScreenCaptureIssue {
  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError': return 'permission';
    case 'NotSupportedError':
    case 'DeviceUnsupportedError': return 'unsupported';
    case 'InvalidStateError': return 'activation';
    case 'NotFoundError':
    case 'DevicesNotFoundError': return 'source';
    case 'NotReadableError':
    case 'TrackStartError': return 'busy';
    default: return 'failed';
  }
}
