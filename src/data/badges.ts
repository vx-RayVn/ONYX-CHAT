/**
 * Badge catalogue. Conditions are described for users; in this demo some are
 * evaluated locally (member number, collections, messages), the rest are
 * fixed demo data. The backend will award badges authoritatively later.
 */
import { tk } from '../i18n';
import type { BadgeId } from '../types';
import { EVENTS, type EventWindow } from './cosmetics';

export type BadgeCategory = 'membership' | 'event' | 'community' | 'special' | 'staff';

export interface BadgeDef {
  id: BadgeId;
  name: string;
  /** Short explanation shown in tooltips. */
  description: string;
  /** How to earn it. */
  condition: string;
  category: BadgeCategory;
  event?: EventWindow;
  /** Upper bound of the registration number for "First N" badges. */
  memberLimit?: number;
  /** Measurable goal; current value comes from the store. */
  goal?: { metric: 'invites' | 'messages'; target: number };
  /** Cannot be earned any more once the window closed. */
  limited?: boolean;
}

const ALL_BADGES: BadgeDef[] = [
  { id: 'founder', name: tk('Founder'), description: tk('Founder of ONYX'), condition: tk('Reserved for the founder of ONYX.'), category: 'staff' },
  { id: 'team', name: tk('ONYX Team'), description: tk('Official member of the ONYX team'), condition: tk('Given to members of the ONYX team.'), category: 'staff' },
  { id: 'verified', name: tk('Verified'), description: tk('Identity confirmed by the ONYX team'), condition: tk('Identity verification by the team. Independent of ONYX Plus.'), category: 'staff' },
  {
    id: 'founding-member',
    name: tk('Founding Member'),
    description: tk('Joined during the ONYX preview'),
    condition: tk('Create an account before the public launch of ONYX.'),
    category: 'membership',
    limited: true,
  },
  { id: 'first-100', name: tk('First 100'), description: tk('One of the first 100 members'), condition: tk('Registration number 1–100.'), category: 'membership', memberLimit: 100, limited: true },
  {
    id: 'first-1000',
    name: tk('First 1,000'),
    description: tk('One of the first 1,000 members'),
    condition: tk('Registration number 101–1,000.'),
    category: 'membership',
    memberLimit: 1000,
    limited: true,
  },
  {
    id: 'first-10000',
    name: tk('First 10,000'),
    description: tk('One of the first 10,000 members'),
    condition: tk('Registration number 1,001–10,000.'),
    category: 'membership',
    memberLimit: 10000,
    limited: true,
  },
  {
    id: 'closed-beta',
    name: tk('Closed Beta'),
    description: tk('Tested ONYX in the closed beta'),
    condition: tk('Take part in the closed beta test.'),
    category: 'event',
    event: EVENTS.closedBeta,
    limited: true,
  },
  {
    id: 'halloween-2026',
    name: tk('Halloween 2026'),
    description: tk('Celebrated Halloween 2026 on ONYX'),
    condition: tk('Send a message on ONYX while the event is running.'),
    category: 'event',
    event: EVENTS.halloween2026,
    limited: true,
  },
  {
    id: 'winter-2026',
    name: tk('Winter 2026'),
    description: tk('Celebrated winter 2026 on ONYX'),
    condition: tk('Send a message on ONYX while the event is running.'),
    category: 'event',
    event: EVENTS.winter2026,
    limited: true,
  },
  {
    id: 'summer-2027',
    name: tk('Summer 2027'),
    description: tk('Celebrated summer 2027 on ONYX'),
    condition: tk('Send a message on ONYX while the event is running.'),
    category: 'event',
    event: EVENTS.summer2027,
    limited: true,
  },
  { id: 'bug-hunter', name: tk('Bug Hunter'), description: tk('Helped find and fix bugs'), condition: tk('Report a bug that the team confirms and fixes.'), category: 'community' },
  {
    id: 'community-builder',
    name: tk('Community Builder'),
    description: tk('Brought 25 people to ONYX'),
    condition: tk('Invite 25 people who create an account and join one of your servers.'),
    category: 'community',
    goal: { metric: 'invites', target: 25 },
  },
  {
    id: 'regular',
    name: tk('Regular'),
    description: tk('Sent 500 messages'),
    condition: tk('Send 500 messages in servers or direct messages.'),
    category: 'community',
    goal: { metric: 'messages', target: 500 },
  },
  {
    id: 'supporter',
    name: tk('ONYX Supporter'),
    description: tk('Supported ONYX with ONYX Plus'),
    condition: tk('Comes with the one-time ONYX Plus purchase, together with the blue Plus check. Shows support – not an identity verification.'),
    category: 'special',
  },
  { id: 'creator', name: tk('Creator'), description: tk('Content creator on ONYX'), condition: tk('Join the ONYX creator programme.'), category: 'special' },
  {
    id: 'onyx-og',
    name: tk('ONYX OG'),
    description: tk('Found ONYX through the early videos'),
    condition: tk('Redeem the code ONYX-ORIGIN from our early videos. Free, independent of ONYX Plus and of your member number.'),
    category: 'special',
  },
];

export const BADGES = ALL_BADGES.filter(b => ['founder','team','onyx-og','creator','bug-hunter','first-100','first-1000','first-10000'].includes(b.id));

export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b])) as Record<BadgeId, BadgeDef>;

export const BADGE_CATEGORIES: { id: BadgeCategory; name: string }[] = [
  { id: 'membership', name: tk('Membership') },
  { id: 'event', name: tk('Events') },
  { id: 'community', name: tk('Community') },
  { id: 'special', name: tk('Special') },
  { id: 'staff', name: tk('Staff & verification') },
];

export function formatMemberNumber(n: number) {
  return `#${String(n).padStart(6, '0')}`;
}
