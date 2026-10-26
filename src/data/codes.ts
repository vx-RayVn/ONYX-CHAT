/**
 * Promo codes for this local preview. There is exactly one: ONYX-ORIGIN
 * awards the "ONYX OG" badge to people who found ONYX through the early
 * videos. Personalisation never needs a code. The backend will validate codes
 * authoritatively later – nothing here is a secret.
 */
import { tk } from '../i18n';
import type { Reward } from '../types';

export interface PromoCode {
  code: string;
  title: string;
  description: string;
  rewards: Reward[];
}

export const PROMO_CODES: PromoCode[] = [
  {
    code: 'ONYX-ORIGIN',
    title: tk('ONYX OG'),
    description: tk('A free thank-you for everyone who found ONYX through our first videos and the launch phase.'),
    rewards: [{ kind: 'badge', id: 'onyx-og' }],
  },
];

export function normalizeCode(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
