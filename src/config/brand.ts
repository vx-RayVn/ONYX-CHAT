/**
 * Brand configuration. Central place for names, logos and external links so
 * they can be changed without touching components.
 */
const asset = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`;

/**
 * Official brand images (public/brand – stable paths, so they also work when
 * referenced from saved demo data such as server icons and avatars).
 */
export const BRAND_IMAGES = {
  /** ONYX Chat logo: white mark on the emerald rounded square. */
  onyxLogo: { sm: asset('onyx-logo-128.webp'), lg: asset('onyx-logo-512.webp') },
  /** ONYX mark alone (white, transparent background) for coloured surfaces. */
  onyxMark: { sm: asset('onyx-mark-64.webp'), lg: asset('onyx-mark-256.webp') },
  /** Official OnyxServices logo (shop). */
  onyxServicesLogo: { sm: asset('onyxservices-logo-128.webp'), lg: asset('onyxservices-logo-512.webp') },
  /** Public founder avatar, without a personal name in the asset URL. */
  founderAvatar: { sm: asset('community-avatar.svg'), lg: asset('community-avatar.svg') },
  /** App icon as PNG (notifications) and the tab icon (base for the unread badge). */
  appIcon: asset('apple-touch-icon.png'),
  favicon: asset('favicon-64.png'),
} as const;

export const BRAND = {
  name: 'ONYX',
  tagline: 'Your community. Your style. Free.',
  /** Shown in settings as "ONYX 0.1". */
  version: '0.1',
  shop: {
    name: 'OnyxServices',
    /** Website of OnyxServices, our team's other project. */
    url: 'https://www.onyxservices.xyz/',
    discount: { code: 'ONYXCHAT', percent: 10 },
  },
  /** Free upload limit shown in the UI (Discord: 10 MB without subscription). */
  uploadLimitMb: 50,
  messageLimit: 4000,
} as const;
