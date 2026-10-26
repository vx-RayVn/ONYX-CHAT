/**
 * ONYX domain types.
 *
 * These mirror the shape the data will have once it comes from a backend
 * (e.g. Supabase tables): every entity has a stable id, foreign keys are ids,
 * timestamps are epoch milliseconds. UI-only state lives in the store, not here.
 */

export type ID = string;

export type { NotifyLevel, NotifyPref } from './lib/notifyRules';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type AvatarArtStyle = 'pixel' | 'orb' | 'facet' | 'wave' | 'aurora' | 'rings' | 'motif';

export type AvatarMotif = 'crystal' | 'moon' | 'blossom' | 'pixel-heart' | 'plasma' | 'void' | 'flame' | 'pumpkin' | 'snowflake' | 'sun-wave';

/** Focal point (0–100 %) and zoom for uploaded images. */
export interface ImageCrop {
  x: number;
  y: number;
  zoom: number;
}

export type AvatarSource =
  | { kind: 'image'; src: string; poster?: string; animated?: boolean; crop?: ImageCrop }
  | { kind: 'art'; style: AvatarArtStyle; hue: number; hue2?: number; seed: number; animated?: boolean; motif?: AvatarMotif };

export type BannerSource = { kind: 'image'; src: string; poster?: string; animated?: boolean; crop?: ImageCrop } | { kind: 'preset'; id: string };

export type NameFontId = 'default' | 'heavy' | 'grotesk' | 'elegant' | 'playful' | 'tech' | 'pixel' | 'ornate' | 'gothic' | 'script' | 'arcade' | 'mono';
export type NameEffectId = 'solid' | 'gradient' | 'outline' | 'metallic' | 'neon' | 'prism' | 'shimmer' | 'pop';

export interface NameStyle {
  font: NameFontId;
  effect: NameEffectId;
  /** 1–3 colours. Empty = inherit (role colour / default text colour). */
  colors: string[];
  /** Slanted variant of the chosen font. */
  italic?: boolean;
  /** Shows the display name in capitals (the stored name is unchanged). */
  uppercase?: boolean;
}

export interface BorderLine {
  avatar: boolean;
  card: boolean;
  color: string;
  color2: string;
  speed: 'slow' | 'normal' | 'fast';
  /** Only light up on hover / focus (like the ONYX glow card). */
  hoverOnly?: boolean;
}

export type BadgeId =
  | 'founder'
  | 'team'
  | 'verified'
  | 'founding-member'
  | 'first-100'
  | 'first-1000'
  | 'first-10000'
  | 'closed-beta'
  | 'halloween-2026'
  | 'winter-2026'
  | 'summer-2027'
  | 'bug-hunter'
  | 'community-builder'
  | 'supporter'
  | 'creator'
  | 'onyx-og'
  | 'regular';

export interface Activity {
  type: 'playing' | 'listening' | 'streaming' | 'watching';
  name: string;
  details?: string;
  state?: string;
  since?: number;
  source?: 'steam' | 'desktop';
  gameKey?: string;
  artworkHash?: string;
  timing?: 'started' | 'observed';
  expiresAt?: number;
}

export interface CustomStatus {
  emoji?: string;
  text: string;
}

export interface User {
  id: ID;
  /** Native anonymous identity, until verified permanent registration is complete. */
  guest?: boolean;
  username: string;
  displayName: string;
  avatar?: AvatarSource;
  /** Fallback colour for initials avatars. */
  avatarColor: string;
  banner?: BannerSource;
  bio?: string;
  pronouns?: string;
  status: PresenceStatus;
  /** Persisted preference, distinct from browser/desktop connectivity. */
  accountStatus?: PresenceStatus;
  customStatus?: CustomStatus;
  activity?: Activity;
  /** Badges shown on the profile, in display order. */
  badges: BadgeId[];
  /** Two- or three-stop profile theme gradient (free personalisation). */
  profileColors?: string[];
  /** Cosmetic ids from the catalogue (src/data/cosmetics.ts). */
  avatarDecoration?: string;
  profileFrame?: string;
  profileEffect?: string;
  nameStyle?: NameStyle;
  borderLine?: BorderLine;
  /** Permanent registration number ("Member #000247"). */
  memberNumber?: number;
  /** ISO 3166-1 alpha-2 code of the registration country. */
  country?: string;
  /** Server-confirmed Plus entitlement; subscriptions expire at plusUntil. */
  plusSince?: number;
  plusUntil?: number;
  /** Voluntary entry on the public supporter wall (only for Plus supporters). */
  supporterWall?: boolean;
  bot?: boolean;
  createdAt: number;
}

export type ChannelType = 'text' | 'voice' | 'announcement';

export interface Channel {
  id: ID;
  serverId: ID;
  categoryId: ID | null;
  name: string;
  type: ChannelType;
  topic?: string;
  position: number;
  slowmode?: number;
  ageRestricted?: boolean;
  userLimit?: number;
  /**
   * Channel-specific permission overwrites. They only store what differs from
   * the category: per permission, a channel entry wins over the category entry.
   */
  overwrites?: PermissionOverwrite[];
}

export interface Category {
  id: ID;
  name: string;
  position: number;
  /** Overwrites inherited by every channel in the category. */
  overwrites?: PermissionOverwrite[];
}

/** Explicit allow / deny for one role or member in a channel or category. */
export interface PermissionOverwrite {
  type: 'role' | 'member';
  /** Role id or user id. */
  id: ID;
  allow: Permission[];
  deny: Permission[];
}

export type Permission =
  | 'administrator'
  | 'viewChannel'
  | 'manageServer'
  | 'manageChannels'
  | 'manageRoles'
  | 'manageBadges'
  | 'kickMembers'
  | 'banMembers'
  | 'createInvites'
  | 'sendMessages'
  | 'readHistory'
  | 'attachFiles'
  | 'sendVoiceMessages'
  | 'addReactions'
  | 'mentionEveryone'
  | 'manageMessages'
  | 'connect'
  | 'speak'
  | 'video'
  | 'screenShare'
  | 'muteMembers'
  | 'deafenMembers'
  | 'moveMembers';

export interface Role {
  id: ID;
  name: string;
  color: string | null;
  hoist: boolean;
  position: number;
  permissions: Permission[];
  /** The implicit @everyone role cannot be deleted or renamed. */
  isDefault?: boolean;
}

export interface Member {
  userId: ID;
  roleIds: ID[];
  nickname?: string;
  joinedAt: number;
  /** Server badges awarded to this member (ids from Server.badges). */
  badgeIds?: ID[];
}

/**
 * A badge created by a server (name + image). Only shown in the context of
 * that server and always together with the server's name and icon, so it can
 * never be mistaken for an official ONYX badge.
 */
export interface ServerBadge {
  id: ID;
  name: string;
  image: string;
  description?: string;
  createdAt: number;
}

export interface Invite {
  code: string;
  channelId: ID;
  inviterId: ID;
  uses: number;
  maxUses: number | null;
  expiresAt: number | null;
  createdAt: number;
}

export interface CustomEmoji {
  id: ID;
  name: string;
  src: string;
  animated?: boolean;
}

export interface Server {
  id: ID;
  name: string;
  icon?: string;
  iconColor: string;
  banner?: BannerSource;
  description?: string;
  ownerId: ID;
  categories: Category[];
  roles: Role[];
  members: Record<ID, Member>;
  invites: Invite[];
  emojis: CustomEmoji[];
  badges?: ServerBadge[];
  /** Banned people (cloud: only loaded with "Ban members"). */
  bans?: ServerBan[];
  verified?: boolean;
  isOfficial?: boolean;
  systemChannelId?: ID;
  createdAt: number;
}

export interface ServerBan {
  userId: ID;
  reason?: string;
  bannedBy?: ID;
  createdAt: number;
}

export interface Attachment {
  id: ID;
  name: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  url?: string;
  width?: number;
  height?: number;
  /** MIME type (audio: used to check playback support). */
  mime?: string;
  /** Audio length in seconds. */
  duration?: number;
  /** Audio: 0–1 loudness samples for the waveform. */
  waveform?: number[];
  /** Recorded in ONYX (voice message) instead of uploaded as a file. */
  voice?: boolean;
  /** Audio data lives in the browser's IndexedDB under this key. */
  localKey?: string;
  /** Cloud mode: the file in Supabase Storage (bucket "attachments"). */
  path?: string;
  /** True when the binary was not stored locally (demo limitation). */
  unavailable?: boolean;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  color?: string;
  provider?: string;
  author?: string;
  title?: string;
  url?: string;
  description?: string;
  fields?: EmbedField[];
  thumbnail?: string;
  image?: string;
  footer?: string;
  /** Optional call-to-action rendered as a button. */
  action?: { label: string; url?: string };
}

export interface Reaction {
  emoji: string;
  userIds: ID[];
}

export type MessageType = 'default' | 'join' | 'pin' | 'call';

export interface Message {
  bot?: {id:string;name:string;avatar:string|null};
  id: ID;
  channelId: ID;
  authorId: ID;
  type: MessageType;
  content: string;
  createdAt: number;
  editedAt?: number;
  replyToId?: ID;
  /** Whether the reply pinged the original author. */
  replyMention?: boolean;
  reactions: Reaction[];
  attachments: Attachment[];
  embeds: Embed[];
  pinned?: boolean;
}

export interface DMChannel {
  id: ID;
  type: 'dm' | 'group';
  participantIds: ID[];
  name?: string;
  icon?: string;
  ownerId?: ID;
  lastActivityAt: number;
  hidden?: boolean;
}

export type RelationshipType = 'friend' | 'incoming' | 'outgoing' | 'blocked';

export interface Relationship {
  userId: ID;
  type: RelationshipType;
  since: number;
}

export interface VoiceParticipant {
  userId: ID;
  muted?: boolean;
  deafened?: boolean;
  /** Muted or deafened by a moderator (shown in red with a shield). */
  serverMuted?: boolean;
  serverDeafened?: boolean;
  video?: boolean;
  streaming?: boolean;
  joinedAt: number;
}

/* ------------------------------------------------------------------ */
/* Rewards                                                              */
/* ------------------------------------------------------------------ */

export type Reward = { kind: 'badge'; id: BadgeId };

export interface RedeemedCode {
  code: string;
  at: number;
  rewards: Reward[];
}

/* ------------------------------------------------------------------ */
/* Local preferences                                                    */
/* ------------------------------------------------------------------ */

export type Theme = 'graphite' | 'onyx' | 'emerald-night' | 'midnight' | 'amethyst' | 'deep-ocean' | 'aurora' | 'crimson' | 'sunset' | 'winter-night' | 'haunted' | 'daylight';
export type Density = 'cozy' | 'compact';
export type MotionPref = 'system' | 'reduced' | 'full';
export type AnimatePref = 'always' | 'hover';

export interface Settings {
  language: import('./i18n').Lang;
  theme: Theme;
  showCountry: boolean;
  density: Density;
  fontScale: number;
  groupSpacing: number;
  motion: MotionPref;
  animateMedia: AnimatePref;
  use24h: boolean;
  showRoleColors: boolean;
  highContrast: boolean;
  underlineLinks: boolean;
  showUnreadBadges: boolean;
  showLinkPreviews: boolean;
  showActivity: boolean;
  allowServerDMs: boolean;
  friendRequestsFrom: 'everyone' | 'friends-of-friends' | 'server-members';
  messageFilter: 'all' | 'non-friends' | 'off';
  desktopNotifications: boolean;
  /** Message text in popups (off: only who wrote where). */
  notifyPreview: boolean;
  notifySounds: boolean;
  /** 0–100 */
  notifyVolume: number;
  /** Mention count in the tab title and as badge on the tab icon. */
  notifyTabBadge: boolean;
  sendWithEnter: boolean;
  inputDevice: string;
  outputDevice: string;
  /** Camera (deviceId, 'default' = the browser's choice). */
  videoDevice: string;
  /** Microphone gain in % (100 = unchanged, up to 200). Replaces the old preview slider "inputVolume". */
  micGain: number;
  /** Volume of everyone in voice and calls in % (up to 200 where the browser allows it). */
  outputVolume: number;
  noiseSuppression: boolean;
  /** Optional LiveKit Cloud Krisp model; browser suppression remains the fallback. */
  enhancedNoiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  /** 'voice': the microphone is open while unmuted; 'ptt': only while the push-to-talk key is held. */
  inputMode: 'voice' | 'ptt';
  /** KeyboardEvent.code of the push-to-talk key ('' = not set yet). */
  pttKey: string;
  /** How long the microphone stays open after releasing the key (ms). */
  pttDelay: number;
  /** Sounds for joining, leaving, muting and deafening in voice. */
  voiceSounds: boolean;
  /** Show your own camera mirrored (others always see it the right way round). */
  mirrorCamera: boolean;
}
