import {normalizeFolders, type ServerFolder} from '../lib/serverFolders';
import {channelOrder} from '../lib/channelOrder';
import { BADGE_BY_ID } from '../data/badges';
import { FEATURES, isPlusPage } from '../config/features';
import { parseInvite } from '../lib/invites';
import {guestPermissions} from '../lib/guest';
/**
 * Central app store.
 *
 * All mutations go through the actions below. That keeps a single seam for the
 * later backend: each action can first apply its optimistic local change (as it
 * does now) and then call the API / Supabase. Everything except transient UI
 * state is persisted to localStorage so demo changes survive a reload.
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  Attachment,
  BadgeId,
  RedeemedCode,
  Reward,
  Category,
  Channel,
  ChannelType,
  CustomEmoji,
  CustomStatus,
  ID,
  Invite,
  Message,
  NotifyLevel,
  NotifyPref,
  Permission,
  PermissionOverwrite,
  PresenceStatus,
  Role,
  Server,
  ServerBadge,
  Settings,
  User,
} from '../types';
import { buildSeed, type SeedData } from '../data/seed';
import { PROMO_CODES, normalizeCode } from '../data/codes';
import { EVENTS, eventStatus } from '../data/cosmetics';
import { t, tk } from '../i18n';
import { DAY, uid } from '../lib/utils';
import { SERVER_COLORS, SERVER_ICONS } from '../data/art';
import { BRAND_IMAGES } from '../config/brand';
import { categoryOf, channelPermissions, everyoneRole, memberBelow, roleBelow, serverPermissions, subjectFor, type ViewAs } from '../lib/permissions';
import { toast, useUI, requireAccount } from './ui';
import { clearAudio, deleteAudio } from '../lib/audio';
import { CLOUD } from '../backend/config';
import { cloudHooks, registerStore } from '../backend/bridge';
import { describeError } from '../backend/queue';
import * as remote from '../backend/remote';
import { isEmptyPref, isMuted } from '../lib/notifyRules';
import * as voice from '../voice/engine';
import type { ShareOptions } from '../voice/engine';
import { useVoice } from '../voice/state';

export type HomePage = 'friends' | 'plus' | 'supporters' | 'shop' | 'discover';

export type View = { kind: 'server'; serverId: ID; channelId: ID | null } | { kind: 'home'; page: HomePage } | { kind: 'dm'; dmId: ID };

export interface CallState {
  dmId: ID;
  /** Id of the call (and of its system message); null until the server answered. */
  callId: ID | null;
  /** connecting → ringing (nobody else there yet) → connected */
  state: 'connecting' | 'ringing' | 'connected';
  /** Start of the timer: when the first other person was there. */
  startedAt: number;
  video: boolean;
}

export interface VoiceSelf {
  channelId: ID | null;
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  screen: boolean;
  joinedAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  showCountry: true,
  theme: 'graphite',
  density: 'cozy',
  fontScale: 1,
  groupSpacing: 16,
  motion: 'system',
  animateMedia: 'always',
  use24h: true,
  showRoleColors: true,
  highContrast: false,
  underlineLinks: false,
  showUnreadBadges: true,
  showLinkPreviews: true,
  showActivity: true,
  allowServerDMs: true,
  friendRequestsFrom: 'everyone',
  messageFilter: 'non-friends',
  desktopNotifications: false,
  notifyPreview: true,
  notifySounds: true,
  notifyVolume: 60,
  notifyTabBadge: true,
  sendWithEnter: true,
  inputDevice: 'default',
  outputDevice: 'default',
  videoDevice: 'default',
  micGain: 100,
  outputVolume: 100,
  noiseSuppression: true,
  enhancedNoiseSuppression: false,
  echoCancellation: true,
  autoGainControl: true,
  inputMode: 'voice',
  pttKey: '',
  pttDelay: 200,
  voiceSounds: true,
  mirrorCamera: true,
};

interface State extends SeedData {
  serverFolders: ServerFolder[];
  serverFolderPrefs: Record<string,ServerFolder[]>;
  settings: Settings;
  view: View;
  lastChannelByServer: Record<ID, ID>;
  collapsedCategories: Record<ID, boolean>;
  /** Notification settings per server, channel and DM (cloud: the same on every device). */
  notifyPrefs: Record<ID, NotifyPref>;
  /** Level for server channels without an own setting. */
  notifyDefault: NotifyLevel;
  /** Before version 6: local mutes. Cloud mode uploads them once, after that this stays empty. */
  mutedChannels: Record<ID, boolean>;
  memberListOpen: boolean;
  dmProfileOpen: boolean;
  drafts: Record<ID, string>;
  frequentEmojis: Record<string, number>;
  /** Favourite personalisation items, as "type:id". */
  favorites: string[];
  redeemed: RedeemedCode[];
  earnedBadges: Partial<Record<BadgeId, number>>;
  /** Demo metric for the Community Builder badge. */
  acceptedInvites: number;
  /** Not persisted */
  voiceSelf: VoiceSelf;
  call: CallState | null;
  /** "View server as role" preview (not persisted). */
  viewAs: ViewAs;
}

/** Where permission overwrites are edited. */
export type PermissionScope = { kind: 'channel'; channelId: ID } | { kind: 'category'; serverId: ID; categoryId: ID };
export type OverwriteTarget = Pick<PermissionOverwrite, 'type' | 'id'>;

interface Actions {
  // navigation
  selectServer: (serverId: ID) => void;
  selectChannel: (serverId: ID, channelId: ID) => void;
  goHome: (page?: HomePage) => void;
  openDM: (dmId: ID) => void;
  openDMWithUser: (userId: ID) => ID;
  ensureDM: (userId: ID) => ID;
  setMemberListOpen: (open: boolean) => void;
  toggleMemberList: () => void;
  setDMProfileOpen: (open: boolean) => void;
  toggleCategory: (categoryId: ID) => void;
  // notifications
  setNotifyLevel: (scopeId: ID, level: NotifyLevel | undefined) => void;
  /** Mutes a server, channel or DM for `durationMs` (null = until turned off). */
  muteScope: (scopeId: ID, durationMs: number | null) => void;
  unmuteScope: (scopeId: ID) => void;
  setSuppress: (serverId: ID, key: 'suppressEveryone' | 'suppressRoles', value: boolean) => void;
  resetNotifyPref: (scopeId: ID) => void;
  setNotifyDefault: (level: NotifyLevel) => void;
  /** Drops mutes that have run out (local only – every device checks the time itself). */
  expireMutes: () => void;
  setDraft: (channelId: ID, text: string) => void;

  // read state
  markRead: (channelId: ID) => void;
  markServerRead: (serverId: ID) => void;
  markUnreadFrom: (channelId: ID, messageId: ID) => void;

  // messages
  sendMessage: (
    channelId: ID,
    content: string,
    opts?: {
      attachments?: Attachment[];
      replyToId?: ID;
      replyMention?: boolean;
    },
  ) => void;
  editMessage: (channelId: ID, messageId: ID, content: string) => void;
  deleteMessage: (channelId: ID, messageId: ID) => void;
  toggleReaction: (channelId: ID, messageId: ID, emoji: string) => void;
  togglePin: (channelId: ID, messageId: ID) => void;
  bumpEmoji: (emoji: string) => void;

  // servers
  createServer: (input: { name: string; icon?: string; template: 'gaming' | 'friends' | 'creator' | 'blank' }) => ID;
  updateServer: (serverId: ID, patch: Partial<Pick<Server, 'name' | 'icon' | 'iconColor' | 'banner' | 'description' | 'systemChannelId'>>) => void;
  deleteServer: (serverId: ID) => void;
  leaveServer: (serverId: ID) => void;
  /** Owner only: hands the server to another member (the old owner stays a member). */
  transferServer: (serverId: ID, userId: ID) => void;

  joinByInvite: (code: string) => Promise<ID | null>;
  setServerFolders: (folders: ServerFolder[]) => void;
  reorderServer: (serverId: ID, toIndex: number) => void;

  // channels & categories
  createChannel: (
    serverId: ID,
    input: {
      name: string;
      type: ChannelType;
      categoryId: ID | null;
      private?: boolean;
      topic?: string;
    },
  ) => ID;
  updateChannel: (channelId: ID, patch: Partial<Omit<Channel, 'id' | 'serverId'>>) => void;
  deleteChannel: (channelId: ID) => void;
  moveChannel: (channelId: ID, direction: -1 | 1) => void;
  reorderChannel: (channelId: ID, categoryId: ID|null, beforeId: ID|null) => void;
  createCategory: (serverId: ID, name: string) => ID;
  renameCategory: (serverId: ID, categoryId: ID, name: string) => void;
  deleteCategory: (serverId: ID, categoryId: ID) => void;
  moveCategory: (serverId: ID, categoryId: ID, direction: -1 | 1) => void;

  // roles, members, invites, emojis
  createRole: (serverId: ID) => ID;
  updateRole: (serverId: ID, roleId: ID, patch: Partial<Omit<Role, 'id'>>) => void;
  deleteRole: (serverId: ID, roleId: ID) => void;
  moveRole: (serverId: ID, roleId: ID, direction: -1 | 1) => void;
  toggleMemberRole: (serverId: ID, userId: ID, roleId: ID) => void;
  setNickname: (serverId: ID, userId: ID, nickname: string) => void;
  kickMember: (serverId: ID, userId: ID) => void;
  /** Removes the member; they can't rejoin until unbanned. */
  banMember: (serverId: ID, userId: ID, reason?: string) => void;
  unbanMember: (serverId: ID, userId: ID) => void;
  createInvite: (serverId: ID, channelId: ID, opts: { maxUses: number | null; expiresInMs: number | null }) => Promise<Invite | null>;
  revokeInvite: (serverId: ID, code: string) => void;
  setViewAs: (viewAs: ViewAs) => void;
  addOverwriteTarget: (scope: PermissionScope, target: OverwriteTarget) => void;
  removeOverwriteTarget: (scope: PermissionScope, target: OverwriteTarget) => void;
  setOverwrite: (scope: PermissionScope, target: OverwriteTarget, perm: Permission, rule: 'allow' | 'deny' | null) => void;
  resetChannelOverwrites: (channelId: ID) => void;
  setChannelPrivate: (channelId: ID, isPrivate: boolean) => void;
  createServerBadge: (serverId: ID, input: Pick<ServerBadge, 'name' | 'image' | 'description'>) => ID | null;
  updateServerBadge: (serverId: ID, badgeId: ID, patch: Partial<Pick<ServerBadge, 'name' | 'image' | 'description'>>) => void;
  deleteServerBadge: (serverId: ID, badgeId: ID) => void;
  toggleMemberBadge: (serverId: ID, userId: ID, badgeId: ID) => void;
  addEmoji: (serverId: ID, emoji: Omit<CustomEmoji, 'id'>) => void;
  removeEmoji: (serverId: ID, emojiId: ID) => void;
  renameEmoji: (serverId: ID, emojiId: ID, name: string) => void;

  // profile & presence
  updateMe: (patch: Partial<Omit<User, 'id' | 'badges' | 'createdAt' | 'bot' | 'guest'>>) => void;
  setStatus: (status: PresenceStatus) => void;
  setCustomStatus: (status: CustomStatus | undefined) => void;
  setNote: (userId: ID, note: string) => void;

  // relationships
  sendFriendRequest: (username: string) => Promise<{ ok: boolean; message: string }>;
  acceptFriend: (userId: ID) => void;
  removeRelationship: (userId: ID) => void;
  blockUser: (userId: ID) => void;
  createGroupDM: (userIds: ID[]) => ID;
  closeDM: (dmId: ID) => void;
  renameGroupDM: (dmId: ID, name: string) => void;

  // voice / calls
  joinVoice: (channelId: ID) => void;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => void;
  toggleScreen: (opts?: ShareOptions) => void;
  /** Starts a call in a DM / group or joins the running one (cloud only). */
  startCall: (dmId: ID, opts?: { video?: boolean }) => void;
  endCall: () => void;

  // settings
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetDemo: () => void;

  // rewards & personalisation
  redeemCode: (input: string) => Promise<RedeemResult>;
  toggleFavorite: (key: string) => void;
  setShownBadges: (badges: BadgeId[]) => void;

  // ONYX Plus (demo purchase – the backend grants this for real later)
  purchasePlus: () => void;
  resetPlusDemo: () => void;
  /** Undo the demo purchase locally only (the server call failed). */
  resetPlusDemoLocal: () => void;
  setSupporterWall: (visible: boolean) => void;
}

export type Store = State & Actions;

const initialVoiceSelf: VoiceSelf = {
  channelId: null,
  muted: false,
  deafened: false,
  camera: false,
  screen: false,
  joinedAt: 0,
};

/** Cloud mode starts empty; the data arrives from Supabase after sign-in. */
function emptyData(): SeedData {
  return { meId: '', users: {}, servers: {}, serverOrder: [], channels: {}, dms: {}, messages: {}, relationships: {}, voice: {}, readState: {}, notes: {} };
}

function initialState(): State {
  if (CLOUD) {
    return {
      ...emptyData(),
      serverFolders: [],
      serverFolderPrefs: {},
      settings: { ...DEFAULT_SETTINGS },
      view: { kind: 'home', page: 'friends' },
      lastChannelByServer: {},
      collapsedCategories: {},
      notifyPrefs: {},
      notifyDefault: 'all',
      mutedChannels: {},
      memberListOpen: true,
      dmProfileOpen: true,
      drafts: {},
      frequentEmojis: {},
      favorites: [],
      redeemed: [],
      earnedBadges: {},
      acceptedInvites: 0,
      voiceSelf: initialVoiceSelf,
      call: null,
      viewAs: null,
    };
  }
  return {
    ...buildSeed(),
    serverFolders: [],
    serverFolderPrefs: {},
    settings: { ...DEFAULT_SETTINGS },
    view: { kind: 'server', serverId: 's_onyx', channelId: 'c_onyx_general' },
    lastChannelByServer: {},
    collapsedCategories: {},
    notifyPrefs: {},
    notifyDefault: 'all',
    mutedChannels: {},
    memberListOpen: true,
    dmProfileOpen: true,
    drafts: {},
    frequentEmojis: {},
    favorites: [],
    redeemed: [],
    earnedBadges: {
      founder: Date.now() - 290 * DAY,
      team: Date.now() - 290 * DAY,
      'founding-member': Date.now() - 290 * DAY,
      'first-100': Date.now() - 290 * DAY,
      'closed-beta': Date.now() - 200 * DAY,
    },
    acceptedInvites: 12,
    voiceSelf: initialVoiceSelf,
    call: null,
    viewAs: null,
  };
}

/* ---------------------------------------------------------------- */
/* Helpers                                                            */
/* ---------------------------------------------------------------- */

export const SERVER_BADGE_LIMIT = 24;

export function sortedChannels(channels: Record<ID, Channel>, serverId: ID) {
  return Object.values(channels)
    .filter((c) => c.serverId === serverId)
    .sort((a, b) => a.position - b.position);
}

export function firstTextChannel(channels: Record<ID, Channel>, server: Server, visible: (c: Channel) => boolean = () => true): ID | null {
  const all = sortedChannels(channels, server.id).filter((c) => c.type !== 'voice' && visible(c));
  const cats = [...server.categories].sort((a, b) => a.position - b.position);
  const uncategorized = all.filter((c) => !c.categoryId);
  if (uncategorized[0]) return uncategorized[0].id;
  for (const cat of cats) {
    const first = all.find((c) => c.categoryId === cat.id);
    if (first) return first.id;
  }
  return null;
}

function normalizePositions(channels: Record<ID, Channel>, serverId: ID, categoryId: ID | null) {
  sortedChannels(channels, serverId)
    .filter((c) => c.categoryId === categoryId)
    .forEach((c, i) => (channels[c.id].position = i));
}

/** The local user's permissions in a server channel (null = not a server channel). */
function myPerms(s: State, channelId: ID) {
  const channel = s.channels[channelId];
  const server = channel ? s.servers[channel.serverId] : undefined;
  if (!channel || !server) return null;
  return guestPermissions(channelPermissions(subjectFor(server, s.meId, s.viewAs, s.meId), channel, categoryOf(server, channel)),s.users[s.meId]?.guest);
}

function canIn(s: State, channelId: ID, perm: Permission) {
  const perms = myPerms(s, channelId);
  return perms ? perms.has(perm) : true;
}

function canOnServer(s: State, serverId: ID, perm: Permission) {
  const server = s.servers[serverId];
  return !!server && guestPermissions(serverPermissions(subjectFor(server, s.meId, s.viewAs, s.meId)),s.users[s.meId]?.guest).has(perm);
}

/** Overwrite list of a scope (created on demand). */
function overwritesOf(s: State, scope: PermissionScope, create: boolean): PermissionOverwrite[] | undefined {
  if (scope.kind === 'channel') {
    const c = s.channels[scope.channelId];
    if (!c) return undefined;
    if (!c.overwrites && create) c.overwrites = [];
    return c.overwrites;
  }
  const cat = s.servers[scope.serverId]?.categories.find((k) => k.id === scope.categoryId);
  if (!cat) return undefined;
  if (!cat.overwrites && create) cat.overwrites = [];
  return cat.overwrites;
}

/** Editing overwrites needs "Manage permissions" (manageRoles) in that place. */
function canEditOverwrites(s: State, scope: PermissionScope) {
  if (scope.kind === 'channel') return canIn(s, scope.channelId, 'manageRoles');
  const server = s.servers[scope.serverId];
  const cat = server?.categories.find((k) => k.id === scope.categoryId);
  if (!server || !cat) return false;
  return channelPermissions(subjectFor(server, s.meId, s.viewAs, s.meId), undefined, cat).has('manageRoles');
}

/** Cloud mode: pushes the overwrite list of a channel or category to Supabase. */
function pushOverwrites(s: State, scope: PermissionScope) {
  if (!CLOUD) return;
  if (scope.kind === 'channel') {
    const c = s.channels[scope.channelId];
    if (c) remote.replaceOverwrites(c.serverId, { channelId: c.id }, c.overwrites);
  } else {
    const cat = s.servers[scope.serverId]?.categories.find((k) => k.id === scope.categoryId);
    if (cat) remote.replaceOverwrites(scope.serverId, { categoryId: cat.id }, cat.overwrites);
  }
}

/** Cloud mode: the server enforces the role hierarchy; say so instead of changing something it will refuse. */
function hierarchyRefused(kind: 'role' | 'member') {
  toast({
    tone: 'danger',
    title: kind === 'role' ? t('This role is above your highest role') : t('This member is above you'),
    body: kind === 'role' ? t('You can only manage roles below your own highest role.') : t('You can only manage members whose highest role is below yours.'),
  });
}

/** Removes a server and everything in it from the local state. */
function dropServerLocally(s: State, serverId: ID) {
  Object.values(s.channels)
    .filter((c) => c.serverId === serverId)
    .forEach((c) => {
      dropAudio(s.messages[c.id]);
      delete s.channels[c.id];
      delete s.messages[c.id];
      delete s.voice[c.id];
      if (s.voiceSelf.channelId === c.id) s.voiceSelf = { ...initialVoiceSelf };
    });
  delete s.servers[serverId];
  s.serverOrder = s.serverOrder.filter((id) => id !== serverId);
  if (s.view.kind === 'server' && s.view.serverId === serverId) s.view = { kind: 'home', page: 'friends' };
}

/** Changes the notification settings of one server, channel or DM (cloud: saved for every device). */
function updatePref(scopeId: ID, fn: (p: NotifyPref) => void) {
  useStore.setState((s) => {
    const p = (s.notifyPrefs[scopeId] ??= {});
    fn(p);
    for (const k of Object.keys(p) as (keyof NotifyPref)[]) if (p[k] === undefined || p[k] === false) delete p[k];
    if (isEmptyPref(p)) delete s.notifyPrefs[scopeId];
  });
  if (CLOUD) remote.saveNotifyPref(scopeId, useStore.getState().notifyPrefs[scopeId]);
}

/** Random invite code (cloud: 10 characters from the crypto RNG, harder to guess). */
function inviteCode() {
  if (!CLOUD) return Math.random().toString(36).slice(2, 10);
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => alphabet[b % alphabet.length]).join('');
}

/** Removes the locally stored audio of messages that are deleted. */
function dropAudio(messages: Message[] | undefined) {
  const keys = (messages ?? []).flatMap((m) => m.attachments.map((a) => a.localKey).filter((k): k is string => !!k));
  if (keys.length) void deleteAudio(keys);
}

function newMessage(channelId: ID, authorId: ID, content: string, extra: Partial<Message> = {}): Message {
  return {
    id: uid('m_'),
    channelId,
    authorId,
    type: 'default',
    content,
    createdAt: Date.now(),
    reactions: [],
    attachments: [],
    embeds: [],
    ...extra,
  };
}

/**
 * Key of the persisted demo state. In development, "?sandbox" in the URL uses a
 * separate copy so test tabs never overwrite the data of another open tab.
 */
export const STORE_KEY = CLOUD ? 'onyx-cloud' : import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('sandbox') ? 'onyx-demo-sandbox' : 'onyx-demo';

/** Storage wrapper: never let a full quota crash the app. */
let quotaWarned = false;

const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      if (!quotaWarned) {
        quotaWarned = true;
        toast({
          tone: 'danger',
          title: t('Local storage is full'),
          body: t('Large images will not be stored permanently. Remove uploads or reset the demo in the settings.'),
        });
      }
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

type TemplateDef = {
  categories: {
    name: string;
    channels: { name: string; type: ChannelType; topic?: string }[];
  }[];
};

/** Template names are translated when the server is created. */
const TEMPLATE_CHANNELS: Record<string, TemplateDef> = {
  gaming: {
    categories: [
      {
        name: tk('Info'),
        channels: [
          {
            name: tk('welcome'),
            type: 'text',
            topic: tk('Great to have you here!'),
          },
          { name: tk('announcements'), type: 'announcement' },
        ],
      },
      {
        name: tk('Text Channels'),
        channels: [
          { name: tk('general'), type: 'text' },
          { name: tk('clips'), type: 'text' },
          { name: tk('looking-for-group'), type: 'text' },
        ],
      },
      {
        name: tk('Voice Channels'),
        channels: [
          { name: tk('Lobby'), type: 'voice' },
          { name: tk('Squad'), type: 'voice' },
        ],
      },
    ],
  },
  friends: {
    categories: [
      {
        name: tk('Text Channels'),
        channels: [
          { name: tk('general'), type: 'text' },
          { name: tk('plans'), type: 'text' },
          { name: tk('memes'), type: 'text' },
        ],
      },
      {
        name: tk('Voice Channels'),
        channels: [
          { name: tk('Couch'), type: 'voice' },
          { name: tk('Gaming'), type: 'voice' },
        ],
      },
    ],
  },
  creator: {
    categories: [
      {
        name: tk('Start'),
        channels: [
          { name: tk('rules'), type: 'text' },
          { name: tk('announcements'), type: 'announcement' },
          { name: tk('stream-schedule'), type: 'announcement' },
        ],
      },
      {
        name: tk('Community'),
        channels: [
          { name: tk('general'), type: 'text' },
          { name: tk('clips'), type: 'text' },
          { name: tk('fan-art'), type: 'text' },
        ],
      },
      {
        name: tk('Live'),
        channels: [
          { name: tk('Stream Lounge'), type: 'voice' },
          { name: tk('Viewer Hangout'), type: 'voice' },
        ],
      },
    ],
  },
  blank: {
    categories: [
      {
        name: tk('Text Channels'),
        channels: [{ name: tk('general'), type: 'text' }],
      },
      {
        name: tk('Voice Channels'),
        channels: [{ name: tk('General'), type: 'voice' }],
      },
    ],
  },
};

export type RedeemResult =
  | {
      status: 'success';
      code: string;
      title: string;
      description: string;
      rewards: Reward[];
    }
  | { status: 'invalid' }
  | { status: 'redeemed'; code: string; at: number; rewards: Reward[] };

function applyRewards(s: State, rewards: Reward[]) {
  rewards.forEach((r) => {
    if (r.kind === 'badge') grantBadge(s, r.id);
  });
}

/** Awards a badge to the local user and shows it on the profile (max. 10 shown). */
function grantBadge(s: State, id: BadgeId) {
  if (!BADGE_BY_ID[id] || s.earnedBadges[id]) return;
  s.earnedBadges[id] = Date.now();
  const me = s.users[s.meId];
  if (!me.badges.includes(id) && me.badges.length < 10) me.badges.push(id);
}

/** Event badges: being active (sending a message) while an event runs. */
const EVENT_BADGES: [BadgeId, (typeof EVENTS)[keyof typeof EVENTS]][] = [
  ['halloween-2026', EVENTS.halloween2026],
  ['winter-2026', EVENTS.winter2026],
  ['summer-2027', EVENTS.summer2027],
];

/* ---------------------------------------------------------------- */
/* Store                                                              */
/* ---------------------------------------------------------------- */

export const useStore = create<Store>()(
  persist(
    immer((set, get) => ({
      ...initialState(),

      /* -------------------------- navigation -------------------------- */
      selectServer: (serverId) =>
        set((s) => {
          const server = s.servers[serverId];
          if (!server) return;
          let channelId: ID | null = s.lastChannelByServer[serverId] ?? null;
          const last = channelId ? s.channels[channelId] : undefined;
          if (!last || last.type === 'voice' || !canIn(s, last.id, 'viewChannel')) channelId = firstTextChannel(s.channels, server, (c) => canIn(s, c.id, 'viewChannel'));
          s.view = { kind: 'server', serverId, channelId };
        }),

      selectChannel: (serverId, channelId) => {
        useUI.getState().setMobilePanel('main');
        set((s) => {
          s.view = { kind: 'server', serverId, channelId };
          if (s.channels[channelId]?.type !== 'voice') s.lastChannelByServer[serverId] = channelId;
        });
      },

      goHome: (page = 'friends') => {if(!FEATURES.onyxPlus&&isPlusPage(page))page='friends';if(page!=='friends'&&page!=='shop'&&requireAccount())return;set((s) => void (s.view = { kind: 'home', page }));},

      openDM: (dmId) => {
        useUI.getState().setMobilePanel('main');
        const wasHidden = !!get().dms[dmId]?.hidden;
        set((s) => {
          if (!s.dms[dmId]) return;
          s.dms[dmId].hidden = false;
          s.view = { kind: 'dm', dmId };
        });
        if (CLOUD && wasHidden) remote.hideDM(dmId, false);
      },

      openDMWithUser: (userId) => {
        if(requireAccount())return '';
        if(get().users[userId]?.guest){toast({tone:'info',title:t('Guest account'),body:t('Guests use server chats. Private messages become available after registration.')});return '';}
        useUI.getState().setMobilePanel('main');
        const existing = Object.values(get().dms).find((d) => d.type === 'dm' && d.participantIds.includes(userId));
        if (existing) {
          get().openDM(existing.id);
          return existing.id;
        }
        const id = uid('dm_');
        set((s) => {
          s.dms[id] = {
            id,
            type: 'dm',
            participantIds: [s.meId, userId],
            lastActivityAt: Date.now(),
          };
          s.readState[id] = Date.now();
          s.view = { kind: 'dm', dmId: id };
        });
        if (CLOUD) remote.openDM(id, userId);
        return id;
      },

      ensureDM: (userId) => {
        const existing = Object.values(get().dms).find((d) => d.type === 'dm' && d.participantIds.includes(userId));
        if (existing) return existing.id;
        const id = uid('dm_');
        set((s) => {
          s.dms[id] = {
            id,
            type: 'dm',
            participantIds: [s.meId, userId],
            lastActivityAt: Date.now(),
          };
          s.readState[id] = Date.now();
        });
        if (CLOUD) remote.openDM(id, userId);
        return id;
      },

      setMemberListOpen: (open) => set((s) => void (s.memberListOpen = open)),
      toggleMemberList: () => set((s) => void (s.memberListOpen = !s.memberListOpen)),
      setDMProfileOpen: (open) => set((s) => void (s.dmProfileOpen = open)),
      toggleCategory: (id) => set((s) => void (s.collapsedCategories[id] = !s.collapsedCategories[id])),
      setDraft: (channelId, text) =>
        set((s) => {
          if (text) s.drafts[channelId] = text;
          else delete s.drafts[channelId];
        }),

      /* ------------------------- notifications ------------------------ */
      setNotifyLevel: (scopeId, level) => updatePref(scopeId, (p) => (p.level = level)),
      muteScope: (scopeId, durationMs) =>
        updatePref(scopeId, (p) => {
          p.muted = true;
          p.muteUntil = durationMs === null ? undefined : Date.now() + durationMs;
        }),
      unmuteScope: (scopeId) =>
        updatePref(scopeId, (p) => {
          p.muted = false;
          p.muteUntil = undefined;
        }),
      setSuppress: (serverId, key, value) => updatePref(serverId, (p) => (p[key] = value)),
      resetNotifyPref: (scopeId) => updatePref(scopeId, (p) => Object.keys(p).forEach((k) => delete p[k as keyof NotifyPref])),
      setNotifyDefault: (level) => {
        set((s) => void (s.notifyDefault = level));
        if (CLOUD) remote.saveNotifyDefault(level);
      },
      expireMutes: () =>
        set((s) => {
          const now = Date.now();
          for (const [id, p] of Object.entries(s.notifyPrefs)) {
            if (!p.muted || isMuted(p, now)) continue;
            p.muted = false;
            p.muteUntil = undefined;
            if (isEmptyPref(p)) delete s.notifyPrefs[id];
          }
        }),

      /* -------------------------- read state -------------------------- */
      markRead: (channelId) => {
        let changed = false as boolean;
        set((s) => {
          const list = s.messages[channelId];
          const last = list?.[list.length - 1]?.createdAt ?? 0;
          if ((s.readState[channelId] ?? 0) < last) {
            s.readState[channelId] = Date.now();
            changed = true;
          }
        });
        if (CLOUD && changed) remote.pushReadState(channelId, get().readState[channelId]);
      },

      markServerRead: (serverId) => {
        const ids = Object.values(get().channels)
          .filter((c) => c.serverId === serverId)
          .map((c) => c.id);
        set((s) => ids.forEach((id) => (s.readState[id] = Date.now())));
        if (CLOUD) ids.forEach((id) => remote.pushReadState(id, get().readState[id]));
      },

      markUnreadFrom: (channelId, messageId) => {
        set((s) => {
          const m = s.messages[channelId]?.find((x) => x.id === messageId);
          if (m) s.readState[channelId] = m.createdAt - 1;
        });
        if (CLOUD && get().readState[channelId] !== undefined) remote.pushReadState(channelId, get().readState[channelId]);
      },

      /* --------------------------- messages --------------------------- */
      sendMessage: (channelId, content, opts = {}) => {
        let sent = null as Message | null;
        set((s) => {
          const perms = myPerms(s, channelId);
          if (perms) {
            const atts = opts.attachments ?? [];
            if (!perms.has('sendMessages')) return;
            if (atts.some((a) => a.voice) && !perms.has('sendVoiceMessages')) return;
            if (atts.some((a) => !a.voice) && !perms.has('attachFiles')) return;
          }
          const msg = newMessage(channelId, s.meId, content, {
            attachments: opts.attachments ?? [],
            replyToId: opts.replyToId,
            replyMention: opts.replyMention,
          });
          sent = msg;
          (s.messages[channelId] ??= []).push(msg);
          s.readState[channelId] = msg.createdAt + 1;
          delete s.drafts[channelId];
          // Event badges are awarded by the server in a later phase; in cloud mode nothing is granted locally.
          for (const [badge, window] of CLOUD ? [] : EVENT_BADGES) {
            if (eventStatus(window, msg.createdAt) === 'live' && !s.earnedBadges[badge]) {
              grantBadge(s, badge);
              toast({
                tone: 'success',
                title: t('Badge earned: {name}', { name: t(window.name) }),
                body: t('Thanks for being here during the event. You can find it under Settings → Badges.'),
              });
            }
          }
          if (s.dms[channelId]) {
            s.dms[channelId].lastActivityAt = msg.createdAt;
            s.dms[channelId].hidden = false;
          }
        });
        if (CLOUD && sent) remote.sendMessage(sent, !!get().dms[channelId]);
      },

      editMessage: (channelId, messageId, content) => {
        let changed = false as boolean;
        set((s) => {
          const m = s.messages[channelId]?.find((x) => x.id === messageId);
          if (m && m.content !== content && (!CLOUD || m.authorId === s.meId)) {
            m.content = content;
            m.editedAt = Date.now();
            changed = true;
          }
        });
        if (CLOUD && changed) remote.editMessage(messageId, content);
      },

      deleteMessage: (channelId, messageId) => {
        let deleted = false as boolean;
        const attachments = get().messages[channelId]?.find((m) => m.id === messageId)?.attachments ?? [];
        set((s) => {
          const list = s.messages[channelId];
          if (!list) return;
          const target = list.find((m) => m.id === messageId);
          if (target && target.authorId !== s.meId && !canIn(s, channelId, 'manageMessages')) return;
          if (target) dropAudio([target]);
          s.messages[channelId] = list.filter((m) => m.id !== messageId);
          deleted = !!target;
        });
        if (CLOUD && deleted) remote.deleteMessage(messageId, attachments);
      },

      toggleReaction: (channelId, messageId, emoji) => {
        let change = null as boolean | null;
        set((s) => {
          const m = s.messages[channelId]?.find((x) => x.id === messageId);
          if (!m) return;
          const me = s.meId;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          if (!existing) {
            if (!canIn(s, channelId, 'addReactions')) return;
            m.reactions.push({ emoji, userIds: [me] });
            s.frequentEmojis[emoji] = (s.frequentEmojis[emoji] ?? 0) + 1;
            change = true;
          } else if (existing.userIds.includes(me)) {
            existing.userIds = existing.userIds.filter((id) => id !== me);
            if (existing.userIds.length === 0) m.reactions = m.reactions.filter((r) => r !== existing);
            change = false;
          } else {
            existing.userIds.push(me);
            s.frequentEmojis[emoji] = (s.frequentEmojis[emoji] ?? 0) + 1;
            change = true;
          }
        });
        if (CLOUD && change !== null) remote.setReaction(messageId, emoji, change);
      },

      togglePin: (channelId, messageId) => {
        let pinned = null as boolean | null;
        let notice = null as Message | null;
        set((s) => {
          const m = s.messages[channelId]?.find((x) => x.id === messageId);
          if (!m) return;
          m.pinned = !m.pinned;
          pinned = m.pinned;
          if (m.pinned) {
            notice = newMessage(channelId, s.meId, '', {
              type: 'pin',
              replyToId: messageId,
            });
            s.messages[channelId].push(notice);
          }
        });
        if (CLOUD && pinned !== null) remote.setPinned(messageId, pinned, notice, !!get().dms[channelId]);
      },

      bumpEmoji: (emoji) => set((s) => void (s.frequentEmojis[emoji] = (s.frequentEmojis[emoji] ?? 0) + 1)),

      /* ---------------------------- servers --------------------------- */
      createServer: ({ name, icon, template }) => {
        const id = uid('s_');
        let joinMessageId = null as ID | null;
        set((s) => {
          const me = s.meId;
          const tpl = TEMPLATE_CHANNELS[template] ?? TEMPLATE_CHANNELS.blank;
          const everyoneId = uid('r_');
          const ownerRoleId = uid('r_');
          const categories: Category[] = [];
          let firstText: ID | null = null;
          tpl.categories.forEach((cat, ci) => {
            const catId = uid('k_');
            categories.push({ id: catId, name: t(cat.name), position: ci });
            cat.channels.forEach((c, i) => {
              const cid = uid('c_');
              s.channels[cid] = {
                id: cid,
                serverId: id,
                categoryId: catId,
                name: t(c.name),
                type: c.type,
                topic: c.topic ? t(c.topic) : undefined,
                position: i,
              };
              s.readState[cid] = Date.now();
              if (!firstText && c.type !== 'voice') firstText = cid;
            });
          });
          s.servers[id] = {
            id,
            name: name.trim(),
            icon,
            iconColor: SERVER_COLORS[Math.floor(Math.random() * SERVER_COLORS.length)],
            ownerId: me,
            categories,
            roles: [
              {
                id: ownerRoleId,
                name: 'Admin',
                color: '#10b981',
                hoist: true,
                position: 1,
                permissions: ['administrator'],
              },
              {
                id: everyoneId,
                name: '@everyone',
                color: null,
                hoist: false,
                position: 0,
                permissions: ['viewChannel', 'readHistory', 'sendMessages', 'sendVoiceMessages', 'addReactions', 'attachFiles', 'connect', 'speak', 'video', 'screenShare', 'createInvites'],
                isDefault: true,
              },
            ],
            members: {
              [me]: {
                userId: me,
                roleIds: [ownerRoleId],
                joinedAt: Date.now(),
              },
            },
            invites: [],
            emojis: [],
            systemChannelId: firstText ?? undefined,
            createdAt: Date.now(),
          };
          s.serverOrder.push(id);
          if (firstText) {
            const join = newMessage(firstText, s.meId, '', { type: 'join' });
            joinMessageId = join.id;
            s.messages[firstText] = [join];
            s.readState[firstText] = Date.now() + 1;
          }
          s.view = { kind: 'server', serverId: id, channelId: firstText };
        });
        if (CLOUD) remote.createServer(get(), id, joinMessageId);
        return id;
      },

      updateServer: (serverId, patch) => {
        set((s) => {
          const server = s.servers[serverId];
          if (server) Object.assign(server, patch);
        });
        if (CLOUD) remote.updateServer(serverId, patch);
      },

      deleteServer: (serverId) => {
        if(get().servers[serverId]?.isOfficial)return;
        if (CLOUD && get().servers[serverId]?.ownerId !== get().meId) return;
        set((s) => dropServerLocally(s, serverId));
        if (CLOUD) remote.deleteServer(serverId);
      },

      leaveServer: (serverId) => {
        if(get().servers[serverId]?.isOfficial)return;
        if (!CLOUD) return get().deleteServer(serverId);
        const s = get();
        if (s.servers[serverId]?.ownerId === s.meId) {
          toast({ tone: 'danger', title: t('You own this server'), body: t('Owners can’t leave their server. Transfer it to another member or delete it (Server settings › Delete server).') });
          return;
        }
        set((st) => dropServerLocally(st, serverId));
        remote.leaveServer(serverId);
      },

      transferServer: (serverId, userId) => {
        const s = get();
        const server = s.servers[serverId];
        if (!server || server.ownerId !== s.meId || userId === s.meId || !server.members[userId]) return;
        const before = server.ownerId;
        set((st) => {
          st.servers[serverId].ownerId = userId;
        });
        if (CLOUD)
          remote.transferServer(serverId, userId, () =>
            set((st) => {
              if (st.servers[serverId]) st.servers[serverId].ownerId = before;
            }),
          );
      },

      joinByInvite: async (code) => {
        const clean = parseInvite(code);
        if (!clean) return null;
        if (CLOUD) {
          const id = await remote.joinByInvite(clean);
          if (!id) return null;
          if (!get().servers[id]) {
            await cloudHooks.reloadNow();
          }
          if (get().servers[id]) get().selectServer(id);
          return id;
        }
        const s = get();
        for (const server of Object.values(s.servers)) {
          if (server.invites.some((i) => i.code.toLowerCase() === clean)) {
            s.selectServer(server.id);
            return server.id;
          }
        }
        return null;
      },

      setServerFolders: folders => set(s => {s.serverFolders = normalizeFolders(folders, s.serverOrder); if(s.meId){s.serverFolderPrefs={...Object.fromEntries(Object.entries(s.serverFolderPrefs).slice(-19)),[s.meId]:s.serverFolders};}}),
      reorderServer: (serverId, toIndex) =>
        set((s) => {
          const from = s.serverOrder.indexOf(serverId);
          if (from < 0) return;
          s.serverOrder.splice(from, 1);
          s.serverOrder.splice(Math.max(0, Math.min(toIndex, s.serverOrder.length)), 0, serverId);
        }),

      /* ---------------------- channels & categories ------------------- */
      createChannel: (serverId, input) => {
        const id = uid('c_');
        set((s) => {
          const siblings = Object.values(s.channels).filter((c) => c.serverId === serverId && c.categoryId === input.categoryId);
          s.channels[id] = {
            id,
            serverId,
            categoryId: input.categoryId,
            name: input.name,
            type: input.type,
            topic: input.topic,
            position: siblings.length,
          };
          const everyone = everyoneRole(s.servers[serverId]);
          if (input.private && everyone) s.channels[id].overwrites = [{ type: 'role', id: everyone.id, allow: [], deny: ['viewChannel'] }];
          s.readState[id] = Date.now();
          if (input.type !== 'voice') {
            s.view = { kind: 'server', serverId, channelId: id };
            s.lastChannelByServer[serverId] = id;
          }
          if (input.categoryId) s.collapsedCategories[input.categoryId] = false;
        });
        if (CLOUD && get().channels[id]) remote.createChannel(get().channels[id]);
        return id;
      },

      updateChannel: (channelId, patch) => {
        const before = get();
        set((s) => {
          const c = s.channels[channelId];
          if (c) Object.assign(c, patch);
          // Moving to another category: keep positions there consecutive.
          if (c && 'categoryId' in patch) normalizePositions(s.channels, c.serverId, c.categoryId);
        });
        const c = get().channels[channelId];
        if (!CLOUD || !c) return;
        const { position: _p, categoryId: _k, overwrites, ...rest } = patch;
        remote.updateChannel(channelId, rest);
        if ('position' in patch || 'categoryId' in patch) remote.syncPositions(before, get(), c.serverId);
        if (overwrites !== undefined || 'overwrites' in patch) pushOverwrites(get(), { kind: 'channel', channelId });
      },

      deleteChannel: (channelId) => {
        const before = get();
        set((s) => {
          const c = s.channels[channelId];
          if (!c) return;
          dropAudio(s.messages[channelId]);
          delete s.channels[channelId];
          delete s.messages[channelId];
          delete s.voice[channelId];
          if (s.voiceSelf.channelId === channelId) s.voiceSelf = { ...initialVoiceSelf };
          normalizePositions(s.channels, c.serverId, c.categoryId);
          if (s.lastChannelByServer[c.serverId] === channelId) delete s.lastChannelByServer[c.serverId];
          if (s.view.kind === 'server' && s.view.channelId === channelId) {
            s.view = {
              kind: 'server',
              serverId: c.serverId,
              channelId: firstTextChannel(s.channels, s.servers[c.serverId]),
            };
          }
        });
        const c = before.channels[channelId];
        if (CLOUD && c) {
          remote.deleteChannel(channelId);
          remote.syncPositions(before, get(), c.serverId);
        }
      },

      reorderChannel: (channelId, categoryId, beforeId) => {
        const before=get(),c=before.channels[channelId];
        if(!c||!canOnServer(before,c.serverId,'manageChannels')||categoryId&&!before.servers[c.serverId]?.categories.some(k=>k.id===categoryId))return;
        const patches=channelOrder(before.channels,channelId,categoryId,beforeId);if(!patches.length)return;
        set(s=>{for(const p of patches)Object.assign(s.channels[p.id],p);});
        if(CLOUD)remote.reorderChannel(channelId,categoryId,beforeId);
      },

      moveChannel: (channelId, direction) => {
        const before = get();
        set((s) => {
          const c = s.channels[channelId];
          if (!c) return;
          const siblings = sortedChannels(s.channels, c.serverId).filter((x) => x.categoryId === c.categoryId);
          const idx = siblings.findIndex((x) => x.id === channelId);
          const target = siblings[idx + direction];
          if (!target) return;
          const p = c.position;
          s.channels[channelId].position = target.position;
          s.channels[target.id].position = p;
        });
        const c = get().channels[channelId];
        if (CLOUD && c) remote.syncPositions(before, get(), c.serverId);
      },

      createCategory: (serverId, name) => {
        const id = uid('k_');
        set((s) => {
          const server = s.servers[serverId];
          server.categories.push({
            id,
            name,
            position: server.categories.length,
          });
        });
        const cat = get().servers[serverId]?.categories.find((k) => k.id === id);
        if (CLOUD && cat) remote.createCategory(serverId, cat);
        return id;
      },

      renameCategory: (serverId, categoryId, name) => {
        set((s) => {
          const cat = s.servers[serverId]?.categories.find((c) => c.id === categoryId);
          if (cat) cat.name = name;
        });
        if (CLOUD) remote.renameCategory(categoryId, name);
      },

      deleteCategory: (serverId, categoryId) => {
        const before = get();
        set((s) => {
          const server = s.servers[serverId];
          server.categories = server.categories.filter((c) => c.id !== categoryId).map((c, i) => ({ ...c, position: i }));
          const orphans = sortedChannels(s.channels, serverId).filter((c) => c.categoryId === categoryId);
          const existing = sortedChannels(s.channels, serverId).filter((c) => c.categoryId === null).length;
          orphans.forEach((c, i) => {
            s.channels[c.id].categoryId = null;
            s.channels[c.id].position = existing + i;
          });
        });
        if (CLOUD) {
          remote.deleteCategory(categoryId);
          remote.syncPositions(before, get(), serverId);
        }
      },

      moveCategory: (serverId, categoryId, direction) => {
        const before = get();
        set((s) => {
          const cats = [...s.servers[serverId].categories].sort((a, b) => a.position - b.position);
          const idx = cats.findIndex((c) => c.id === categoryId);
          const target = cats[idx + direction];
          if (!target) return;
          const list = s.servers[serverId].categories;
          const a = list.find((c) => c.id === categoryId)!;
          const b = list.find((c) => c.id === target.id)!;
          const p = a.position;
          a.position = b.position;
          b.position = p;
        });
        if (CLOUD) remote.syncPositions(before, get(), serverId);
      },

      /* ------------------- roles, members, invites -------------------- */
      createRole: (serverId) => {
        const id = uid('r_');
        const before = get();
        set((s) => {
          const server = s.servers[serverId];
          server.roles.forEach((r) => {
            if (!r.isDefault) r.position += 1;
          });
          server.roles.push({
            id,
            name: t('New role'),
            color: '#94a3b8',
            hoist: false,
            position: 1,
            permissions: ['viewChannel', 'readHistory', 'sendMessages', 'sendVoiceMessages', 'addReactions', 'connect', 'speak'],
          });
        });
        const role = get().servers[serverId]?.roles.find((r) => r.id === id);
        if (CLOUD && role) {
          remote.createRole(serverId, role);
          remote.syncPositions(before, get(), serverId);
        }
        return id;
      },

      updateRole: (serverId, roleId, patch) => {
        const server = get().servers[serverId];
        if (CLOUD && server && !roleBelow(server, get().meId, roleId)) return hierarchyRefused('role');
        set((s) => {
          const role = s.servers[serverId]?.roles.find((r) => r.id === roleId);
          if (role) Object.assign(role, patch);
        });
        if (CLOUD) remote.updateRole(roleId, patch);
      },

      deleteRole: (serverId, roleId) => {
        if (CLOUD && get().servers[serverId]?.roles.find((r) => r.id === roleId)?.isDefault) return;
        if (CLOUD && get().servers[serverId] && !roleBelow(get().servers[serverId], get().meId, roleId)) return hierarchyRefused('role');
        set((s) => {
          const server = s.servers[serverId];
          server.roles = server.roles.filter((r) => r.id !== roleId);
          Object.values(server.members).forEach((m) => (m.roleIds = m.roleIds.filter((id) => id !== roleId)));
          const drop = (list?: PermissionOverwrite[]) => list?.filter((o) => !(o.type === 'role' && o.id === roleId));
          server.categories.forEach((c) => (c.overwrites = drop(c.overwrites)));
          Object.values(s.channels)
            .filter((c) => c.serverId === serverId)
            .forEach((c) => (c.overwrites = drop(c.overwrites)));
          if (s.viewAs?.serverId === serverId) s.viewAs.roleIds = s.viewAs.roleIds.filter((id) => id !== roleId);
        });
        if (CLOUD) remote.deleteRole(roleId);
      },

      moveRole: (serverId, roleId, direction) => {
        const before = get();
        if (CLOUD) {
          const server = before.servers[serverId];
          const sorted = server ? [...server.roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position) : [];
          const target = sorted[sorted.findIndex((r) => r.id === roleId) - direction];
          if (server && (!roleBelow(server, before.meId, roleId) || (target && !roleBelow(server, before.meId, target.id)))) return hierarchyRefused('role');
        }
        set((s) => {
          const roles = s.servers[serverId].roles;
          const sorted = [...roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
          const idx = sorted.findIndex((r) => r.id === roleId);
          const target = sorted[idx - direction];
          if (!target) return;
          const a = roles.find((r) => r.id === roleId)!;
          const b = roles.find((r) => r.id === target.id)!;
          const p = a.position;
          a.position = b.position;
          b.position = p;
        });
        if (CLOUD) remote.syncPositions(before, get(), serverId);
      },

      toggleMemberRole: (serverId, userId, roleId) => {
        const server = get().servers[serverId];
        if (CLOUD && server && !roleBelow(server, get().meId, roleId)) return hierarchyRefused('role');
        let on = null as boolean | null;
        set((s) => {
          const m = s.servers[serverId]?.members[userId];
          if (!m) return;
          on = !m.roleIds.includes(roleId);
          m.roleIds = on ? [...m.roleIds, roleId] : m.roleIds.filter((id) => id !== roleId);
        });
        if (CLOUD && on !== null) remote.setMemberRole(serverId, userId, roleId, on);
      },

      setNickname: (serverId, userId, nickname) => {
        if(requireAccount('profile'))return;
        const server = get().servers[serverId];
        if (CLOUD && server && userId !== get().meId && !memberBelow(server, get().meId, userId)) return hierarchyRefused('member');
        set((s) => {
          const m = s.servers[serverId]?.members[userId];
          if (m) m.nickname = nickname.trim() || undefined;
        });
        if (CLOUD) remote.setNickname(serverId, userId, nickname.trim() || undefined);
      },

      kickMember: (serverId, userId) => {
        if (CLOUD && get().servers[serverId]?.ownerId === userId) return;
        if (CLOUD && get().servers[serverId] && !memberBelow(get().servers[serverId], get().meId, userId)) return hierarchyRefused('member');
        set((s) => {
          delete s.servers[serverId]?.members[userId];
        });
        if (CLOUD) remote.kickMember(serverId, userId);
      },

      banMember: (serverId, userId, reason) => {
        const server = get().servers[serverId];
        if (!server || server.ownerId === userId || userId === get().meId) return;
        if (CLOUD && !memberBelow(server, get().meId, userId)) return hierarchyRefused('member');
        const clean = reason?.trim() || undefined;
        set((s) => {
          const sv = s.servers[serverId];
          if (!sv) return;
          delete sv.members[userId];
          sv.bans = [{ userId, reason: clean, bannedBy: s.meId, createdAt: Date.now() }, ...(sv.bans ?? []).filter((b) => b.userId !== userId)];
        });
        if (CLOUD) remote.banMember(serverId, userId, clean);
      },

      unbanMember: (serverId, userId) => {
        set((s) => {
          const sv = s.servers[serverId];
          if (sv?.bans) sv.bans = sv.bans.filter((b) => b.userId !== userId);
        });
        if (CLOUD) remote.unbanMember(serverId, userId);
      },

      createInvite: async (serverId, channelId, { maxUses, expiresInMs }) => {
        const code = inviteCode();
        const invite: Invite = {
          code,
          channelId,
          inviterId: get().meId,
          uses: 0,
          maxUses,
          expiresAt: expiresInMs ? Date.now() + expiresInMs : null,
          createdAt: Date.now(),
        };
        set((s) => void s.servers[serverId].invites.unshift(invite));
        if (CLOUD && !(await remote.createInvite(serverId, invite))) return null;
        return invite;
      },

      revokeInvite: (serverId, code) => {
        set((s) => {
          const server = s.servers[serverId];
          server.invites = server.invites.filter((i) => i.code !== code);
        });
        if (CLOUD) remote.revokeInvite(code);
      },

      /* ------------------- permissions & preview ---------------------- */
      setViewAs: (viewAs) =>
        set((s) => {
          s.viewAs = viewAs;
          if (!viewAs) return;
          // Leave a channel the previewed roles cannot see.
          const v = s.view;
          if (v.kind === 'server' && v.serverId === viewAs.serverId && v.channelId && !canIn(s, v.channelId, 'viewChannel')) {
            s.view = { kind: 'server', serverId: v.serverId, channelId: firstTextChannel(s.channels, s.servers[v.serverId], (c) => canIn(s, c.id, 'viewChannel')) };
          }
        }),

      addOverwriteTarget: (scope, target) => {
        set((s) => {
          if (!canEditOverwrites(s, scope)) return;
          const list = overwritesOf(s, scope, true);
          if (list && !list.some((o) => o.type === target.type && o.id === target.id)) list.push({ ...target, allow: [], deny: [] });
        });
        pushOverwrites(get(), scope);
      },

      removeOverwriteTarget: (scope, target) => {
        set((s) => {
          if (!canEditOverwrites(s, scope)) return;
          const list = overwritesOf(s, scope, false);
          if (!list) return;
          const next = list.filter((o) => !(o.type === target.type && o.id === target.id));
          if (scope.kind === 'channel') s.channels[scope.channelId].overwrites = next.length ? next : undefined;
          else {
            const cat = s.servers[scope.serverId].categories.find((k) => k.id === scope.categoryId)!;
            cat.overwrites = next.length ? next : undefined;
          }
        });
        pushOverwrites(get(), scope);
      },

      setOverwrite: (scope, target, perm, rule) => {
        if (CLOUD) {
          const s = get();
          const serverId = scope.kind === 'channel' ? s.channels[scope.channelId]?.serverId : scope.serverId;
          const server = serverId ? s.servers[serverId] : undefined;
          if (server) {
            if (target.type === 'role' ? !roleBelow(server, s.meId, target.id) : target.id !== s.meId && !memberBelow(server, s.meId, target.id)) return hierarchyRefused(target.type);
            const sub = subjectFor(server, s.meId, s.viewAs, s.meId);
            const mine =
              scope.kind === 'channel'
                ? channelPermissions(sub, s.channels[scope.channelId], categoryOf(server, s.channels[scope.channelId]))
                : channelPermissions(
                    sub,
                    undefined,
                    server.categories.find((k) => k.id === scope.categoryId),
                  );
            if (rule === 'allow' && !mine.has(perm)) {
              toast({ tone: 'danger', title: t('Not allowed'), body: t('You can’t allow a permission you don’t have yourself.') });
              return;
            }
          }
        }
        set((s) => {
          if (!canEditOverwrites(s, scope)) return;
          const list = overwritesOf(s, scope, true)!;
          let o = list.find((x) => x.type === target.type && x.id === target.id);
          if (!o) {
            o = { ...target, allow: [], deny: [] };
            list.push(o);
          }
          o.allow = o.allow.filter((p) => p !== perm);
          o.deny = o.deny.filter((p) => p !== perm);
          if (rule === 'allow') o.allow.push(perm);
          if (rule === 'deny') o.deny.push(perm);
        });
        pushOverwrites(get(), scope);
      },

      resetChannelOverwrites: (channelId) => {
        set((s) => {
          if (!canEditOverwrites(s, { kind: 'channel', channelId })) return;
          if (s.channels[channelId]) s.channels[channelId].overwrites = undefined;
        });
        pushOverwrites(get(), { kind: 'channel', channelId });
      },

      setChannelPrivate: (channelId, isPrivate) => {
        const s = get();
        const c = s.channels[channelId];
        const everyone = c && everyoneRole(s.servers[c.serverId]);
        if (!everyone) return;
        s.setOverwrite({ kind: 'channel', channelId }, { type: 'role', id: everyone.id }, 'viewChannel', isPrivate ? 'deny' : null);
      },

      /* ------------------------- server badges ------------------------ */
      createServerBadge: (serverId, input) => {
        const s = get();
        if (!canOnServer(s, serverId, 'manageBadges')) return null;
        if ((s.servers[serverId].badges?.length ?? 0) >= SERVER_BADGE_LIMIT) return null;
        const id = uid('sb_');
        set((st) => {
          (st.servers[serverId].badges ??= []).push({
            id,
            name: input.name.trim().slice(0, 32),
            image: input.image,
            description: input.description?.trim().slice(0, 120) || undefined,
            createdAt: Date.now(),
          });
        });
        const badge = get().servers[serverId]?.badges?.find((b) => b.id === id);
        if (CLOUD && badge) remote.createServerBadge(serverId, badge);
        return id;
      },

      updateServerBadge: (serverId, badgeId, patch) => {
        let changed = false as boolean;
        set((s) => {
          if (!canOnServer(s, serverId, 'manageBadges')) return;
          const b = s.servers[serverId]?.badges?.find((x) => x.id === badgeId);
          if (!b) return;
          if (patch.name !== undefined) b.name = patch.name.slice(0, 32);
          if (patch.image) b.image = patch.image;
          if (patch.description !== undefined) b.description = patch.description.slice(0, 120) || undefined;
          changed = true;
        });
        const b = get().servers[serverId]?.badges?.find((x) => x.id === badgeId);
        if (CLOUD && changed && b)
          remote.updateServerBadge(serverId, badgeId, {
            ...(patch.name !== undefined && { name: b.name }),
            ...(patch.image && { image: b.image }),
            ...(patch.description !== undefined && { description: b.description }),
          });
      },

      deleteServerBadge: (serverId, badgeId) => {
        let deleted = false as boolean;
        set((s) => {
          const server = s.servers[serverId];
          if (!server || !canOnServer(s, serverId, 'manageBadges')) return;
          server.badges = (server.badges ?? []).filter((b) => b.id !== badgeId);
          Object.values(server.members).forEach((m) => {
            if (m.badgeIds) m.badgeIds = m.badgeIds.filter((id) => id !== badgeId);
          });
          deleted = true;
        });
        if (CLOUD && deleted) remote.deleteServerBadge(badgeId);
      },

      toggleMemberBadge: (serverId, userId, badgeId) => {
        let on = null as boolean | null;
        set((s) => {
          const server = s.servers[serverId];
          const m = server?.members[userId];
          if (!m || !canOnServer(s, serverId, 'manageBadges') || !server.badges?.some((b) => b.id === badgeId)) return;
          const has = m.badgeIds?.includes(badgeId);
          m.badgeIds = has ? m.badgeIds!.filter((id) => id !== badgeId) : [...(m.badgeIds ?? []), badgeId];
          on = !has;
        });
        if (CLOUD && on !== null) remote.setMemberBadge(serverId, userId, badgeId, on);
      },

      addEmoji: (serverId, emoji) => {
        const id = uid('e_');
        // The database allows 2–32 characters (a–z, 0–9, _).
        const name = CLOUD ? emoji.name.padEnd(2, '_').slice(0, 32) : emoji.name;
        set((s) => void s.servers[serverId].emojis.push({ ...emoji, name, id }));
        const created = get().servers[serverId]?.emojis.find((e) => e.id === id);
        if (CLOUD && created) remote.createEmoji(serverId, created);
      },
      removeEmoji: (serverId, emojiId) => {
        set((s) => {
          const server = s.servers[serverId];
          server.emojis = server.emojis.filter((e) => e.id !== emojiId);
        });
        if (CLOUD) remote.deleteEmoji(emojiId);
      },
      renameEmoji: (serverId, emojiId, name) => {
        set((s) => {
          const e = s.servers[serverId].emojis.find((x) => x.id === emojiId);
          if (e) e.name = name;
        });
        if (CLOUD && name.length >= 2) remote.renameEmoji(emojiId, name);
      },

      /* ---------------------- profile & presence ---------------------- */
      updateMe: (patch) => {
        if(requireAccount('profile'))return;
        set((s) => void Object.assign(s.users[s.meId], patch));
        if (CLOUD) remote.updateProfile(patch);
      },
      setStatus: (status) => {
        if(requireAccount('profile'))return;
        set((s) => void (s.users[s.meId].status = status));
        if (CLOUD) remote.updateProfile({ status });
      },
      setCustomStatus: (status) => {
        if(requireAccount('profile'))return;
        set((s) => void (s.users[s.meId].customStatus = status));
        if (CLOUD) remote.updateProfile({ customStatus: status });
      },
      setNote: (userId, note) => {
        if(requireAccount('profile'))return;
        set((s) => {
          if (note.trim()) s.notes[userId] = note;
          else delete s.notes[userId];
        });
        if (CLOUD) remote.saveNote(userId, note.slice(0, 256));
      },

      /* ------------------------- relationships ------------------------ */
      sendFriendRequest: async (username) => {
        if(requireAccount())return {ok:false,message:t('Create a free account to add friends.')};
        const s = get();
        const q = username.trim().replace(/^@/, '').toLowerCase();
        if (!q) return { ok: false, message: t('Enter a username.') };
        if (CLOUD) {
          try {
            const r = await remote.friendRequest(q);
            const name = r.display_name ?? q;
            if (r.status === 'sent' || r.status === 'accepted') {
              cloudHooks.requestResync();
            }
            switch (r.status) {
              case 'sent':
                return { ok: true, message: t('Friend request sent to {name}.', { name }) };
              case 'accepted':
                return { ok: true, message: t('{name} had already sent you a request – you’re now friends.', { name }) };
              case 'self':
                return { ok: false, message: t('That’s you 🙂') };
              case 'already_friends':
                return { ok: false, message: t('You’re already friends with {name}.', { name }) };
              case 'already_sent':
                return { ok: false, message: t('You already sent {name} a request.', { name }) };
              case 'unavailable':
                return { ok: false, message: t('You can’t send {name} a friend request.', { name }) };
              default:
                return { ok: false, message: t('No user with that name. Check the spelling – usernames are lowercase.') };
            }
          } catch (e) {
            return { ok: false, message: describeError(e) };
          }
        }
        const user = Object.values(s.users).find((u) => u.username.toLowerCase() === q);
        if (!user)
          return {
            ok: false,
            message: t('No user with that name. The demo only contains the sample users, e.g. “frostbyte” or “samokafor”.'),
          };
        if (user.id === s.meId) return { ok: false, message: t('That’s you 🙂') };
        if (user.bot)
          return {
            ok: false,
            message: t('Bots can’t accept friend requests.'),
          };
        const existing = s.relationships[user.id];
        if (existing?.type === 'friend')
          return {
            ok: false,
            message: t('You’re already friends with {name}.', {
              name: user.displayName,
            }),
          };
        if (existing?.type === 'outgoing')
          return {
            ok: false,
            message: t('You already sent {name} a request.', {
              name: user.displayName,
            }),
          };
        if (existing?.type === 'incoming') {
          s.acceptFriend(user.id);
          return {
            ok: true,
            message: t('{name} had already sent you a request – you’re now friends.', { name: user.displayName }),
          };
        }
        set(
          (st) =>
            void (st.relationships[user.id] = {
              userId: user.id,
              type: 'outgoing',
              since: Date.now(),
            }),
        );
        return {
          ok: true,
          message: t('Friend request sent to {name}.', {
            name: user.displayName,
          }),
        };
      },

      acceptFriend: (userId) => {
        set(
          (s) =>
            void (s.relationships[userId] = {
              userId,
              type: 'friend',
              since: Date.now(),
            }),
        );
        if (CLOUD) remote.acceptFriend(userId);
      },
      removeRelationship: (userId) => {
        set((s) => void delete s.relationships[userId]);
        if (CLOUD) remote.removeRelationship(userId);
      },
      blockUser: (userId) => {
        set(
          (s) =>
            void (s.relationships[userId] = {
              userId,
              type: 'blocked',
              since: Date.now(),
            }),
        );
        if (CLOUD) remote.blockUser(userId);
      },

      createGroupDM: (userIds) => {
        if (userIds.length === 1) return get().openDMWithUser(userIds[0]);
        const id = uid('dm_');
        set((s) => {
          s.dms[id] = {
            id,
            type: 'group',
            participantIds: [s.meId, ...userIds],
            ownerId: s.meId,
            lastActivityAt: Date.now(),
          };
          s.readState[id] = Date.now();
          s.view = { kind: 'dm', dmId: id };
        });
        if (CLOUD) remote.createGroupDM(id, userIds);
        return id;
      },

      closeDM: (dmId) => {
        set((s) => {
          if (s.dms[dmId]) s.dms[dmId].hidden = true;
          if (s.view.kind === 'dm' && s.view.dmId === dmId) s.view = { kind: 'home', page: 'friends' };
        });
        if (CLOUD && get().dms[dmId]) remote.hideDM(dmId, true);
      },

      renameGroupDM: (dmId, name) => {
        set((s) => {
          if (s.dms[dmId]) s.dms[dmId].name = name.trim() || undefined;
        });
        if (CLOUD) remote.renameGroupDM(dmId, name.trim() || undefined);
      },

      /* ----------------------- voice / calls -------------------------- */
      // The connection itself is src/voice/engine.ts (cloud: LiveKit, demo: local preview).
      joinVoice: (channelId) => {
        if (!canIn(get(), channelId, 'connect')) return;
        void voice.joinChannel(channelId);
      },

      leaveVoice: () => void voice.leave(),

      toggleMute: () => {
        const s = get();
        const ch = s.voiceSelf.channelId;
        const live = useVoice.getState();
        if (s.voiceSelf.muted && live.status !== 'idle' && (!live.grants.speak || (ch && !canIn(s, ch, 'speak')))) {
          const serverMuted = !!(ch && s.voice[ch]?.find((p) => p.userId === s.meId)?.serverMuted);
          toast(
            serverMuted
              ? { title: t('A moderator muted you'), body: t('You can speak again once a moderator lifts the server mute.') }
              : { title: t('You can’t speak in this channel'), body: t('The “Speak” permission is missing here – you stay muted.') },
          );
          return;
        }
        set((st) => {
          st.voiceSelf.muted = !st.voiceSelf.muted;
          if (!st.voiceSelf.muted && st.voiceSelf.deafened) st.voiceSelf.deafened = false;
          syncSelf(st);
        });
        voice.selfFlagsChanged('mute');
      },

      toggleDeafen: () => {
        set((s) => {
          s.voiceSelf.deafened = !s.voiceSelf.deafened;
          s.voiceSelf.muted = s.voiceSelf.deafened ? true : s.voiceSelf.muted;
          syncSelf(s);
        });
        voice.selfFlagsChanged('deafen');
      },

      toggleCamera: () => {
        const s = get();
        const ch = s.voiceSelf.channelId;
        if (ch && !s.voiceSelf.camera && !canIn(s, ch, 'video')) {
          toast({ title: t('Video isn’t allowed here'), body: t('The “Video” permission is missing in this channel.') });
          return;
        }
        void voice.setCamera(!s.voiceSelf.camera).then(() => set((st) => syncSelf(st)));
      },

      toggleScreen: (opts) => {
        const s = get();
        const ch = s.voiceSelf.channelId;
        if (ch && !s.voiceSelf.screen && !canIn(s, ch, 'screenShare')) {
          toast({ title: t('Screen sharing isn’t allowed here'), body: t('The “Share screen” permission is missing in this channel.') });
          return;
        }
        void voice.setScreenShare(!s.voiceSelf.screen, opts).then(() => set((st) => syncSelf(st)));
      },

      startCall: (dmId, opts) => {
        if (!CLOUD) return;
        void voice.joinCall(dmId, opts);
      },

      endCall: () => void voice.leave(),

      /* ---------------------------- settings -------------------------- */
      setSetting: (key, value) => set((s) => void (s.settings[key] = value)),

      resetDemo: () => {
        if (CLOUD) return;
        void clearAudio();
        set(() => ({ ...initialState() }));
      },

      /* ----------------------- rewards ---------------------------- */
      redeemCode: async (input) => {
        if (CLOUD) {
          // The server checks the code; badges arrive with it (and live via Realtime).
          const r = await remote.redeemCode(input);
          if (r.status === 'invalid') return r;
          if (r.status === 'redeemed') return { status: 'redeemed', code: r.code, at: new Date(r.at).getTime(), rewards: r.rewards };
          set((s) => {
            applyRewards(s, r.rewards);
            s.redeemed.unshift({ code: r.code, at: Date.now(), rewards: r.rewards });
          });
          return r;
        }
        const code = normalizeCode(input);
        const promo = PROMO_CODES.find((p) => p.code === code);
        if (!promo) return { status: 'invalid' };
        const prev = get().redeemed.find((r) => r.code === code);
        if (prev)
          return {
            status: 'redeemed',
            code,
            at: prev.at,
            rewards: prev.rewards,
          };
        set((s) => {
          applyRewards(s, promo.rewards);
          s.redeemed.unshift({ code, at: Date.now(), rewards: promo.rewards });
        });
        return {
          status: 'success',
          code,
          title: promo.title,
          description: promo.description,
          rewards: promo.rewards,
        };
      },

      toggleFavorite: (key) =>
        set((s) => {
          s.favorites = s.favorites.includes(key) ? s.favorites.filter((k) => k !== key) : [...s.favorites, key];
        }),

      setShownBadges: (badges) => {
        // In cloud mode only earned badges can be shown (the database checks this too).
        const list = (CLOUD ? badges.filter((b) => get().earnedBadges[b]) : badges).slice(0, 10);
        set((s) => void (s.users[s.meId].badges = list));
        if (CLOUD) remote.updateProfile({ badges: list });
      },

      purchasePlus: () => {
        if (!FEATURES.onyxPlus || CLOUD) return;
        if (get().users[get().meId]?.plusSince) return;
        set((s) => {
          const me = s.users[s.meId];
          me.plusSince = Date.now();
          me.supporterWall = true;
          grantBadge(s, 'supporter');
        });
        // Demo without payment – in cloud mode the server sets the Plus status.
        if (CLOUD) remote.plusDemoPurchase(() => get().resetPlusDemoLocal());
      },

      resetPlusDemo: () => {
        get().resetPlusDemoLocal();
        if (CLOUD) remote.plusDemoReset();
      },

      resetPlusDemoLocal: () =>
        set((s) => {
          const me = s.users[s.meId];
          delete me.plusSince;
          delete me.supporterWall;
          me.badges = me.badges.filter((b) => b !== 'supporter');
          delete s.earnedBadges.supporter;
        }),

      setSupporterWall: (visible) => {
        set((s) => {
          const me = s.users[s.meId];
          if (me.plusSince) me.supporterWall = visible;
        });
        if (CLOUD && get().users[get().meId]?.plusSince) remote.updateProfile({ supporterWall: visible });
      },
    })),
    {
      name: STORE_KEY,
      version: 8,
      migrate: (persisted, version) => {
        if (version < 3) return {} as Store;
        let state = persisted as Record<string, unknown>;
        if (version < 4) state = migrateV3(state) as unknown as Record<string, unknown>;
        if (version < 5) state = migrateV4(state) as unknown as Record<string, unknown>;
        if (version < 6) state = migrateV5(state) as unknown as Record<string, unknown>;
        state=migrateV6(state) as unknown as Record<string,unknown>;
        // Replace only the old built-in demo identity, preserving any edited user name.
        if(!CLOUD){
          const users=state.users as Record<string,User>|undefined;
          if(users)for(const user of Object.values(users)){
            if(user.avatar?.kind!=='image')continue;
            const match=user.avatar.src.match(/\/brand\/([^/]+)-avatar-(160|512)\.webp$/);
            if(!match||match[1]==='founder')continue;
            if(user.id==='u_me'&&user.username===match[1]&&user.displayName.toLowerCase()===match[1]){user.username='rayvn';user.displayName='rayvn';}
            user.avatar={...user.avatar,src:BRAND_IMAGES.founderAvatar[match[2]==='160'?'sm':'lg']};
          }
        }
        return state as unknown as Store;
      },
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => {
        if (CLOUD) {
          // Account data comes from Supabase after sign-in; only preferences of this device are kept.
          const { voiceSelf, call, voice, viewAs, users, servers, channels, dms, messages, relationships, earnedBadges, notifyPrefs, ...prefs } = s;
          return prefs as unknown as Store;
        }
        const { voiceSelf, call, voice, viewAs, ...rest } = s;
        return {
          ...rest,
          // Voice rooms are simulated; strip the local user so a reload never pretends to be connected.
          voice: Object.fromEntries(Object.entries(voice).map(([k, v]) => [k, v.filter((p) => p.userId !== s.meId)])),
        } as unknown as Store;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        // Drop settings that no longer exist (e.g. the removed app backgrounds).
        const settings = Object.fromEntries(Object.entries({ ...DEFAULT_SETTINGS, ...(p.settings ?? {}) }).filter(([k]) => k in DEFAULT_SETTINGS)) as unknown as Settings;
        return {
          ...current,
          ...p,
          settings,
          serverFolders: normalizeFolders(p.serverFolders, p.serverOrder ?? []),
          serverFolderPrefs: p.serverFolderPrefs && typeof p.serverFolderPrefs === 'object' && !Array.isArray(p.serverFolderPrefs) ? Object.fromEntries(Object.entries(p.serverFolderPrefs).slice(-20)) : {},
          voiceSelf: initialVoiceSelf,
          call: null,
          viewAs: null,
        };
      },
    },
  ),
);

registerStore(useStore as unknown as Parameters<typeof registerStore>[0]);

/**
 * 0.1 → 0.1 overhaul: codes, unlocks and app backgrounds were removed. Keeps
 * the user's profile, messages and servers and cleans everything obsolete.
 */
function migrateV3(p: Record<string, unknown>): Store {
  const state = { ...p } as Record<string, unknown> & Partial<State>;
  delete state.unlockedCollections;
  delete state.unlockedItems;
  delete state.unlockedNameStyles;
  state.redeemed = [];
  const removed = ['video-drop-1', 'collector'];
  if (state.settings) {
    const {
      background: _bg,
      plusInterest: _pi,
      ...rest
    } = state.settings as Settings & {
      background?: unknown;
      plusInterest?: unknown;
    };
    state.settings = rest as Settings;
  }
  if (state.users) {
    state.users = Object.fromEntries(Object.entries(state.users).map(([id, u]) => [id, { ...u, badges: u.badges.filter((b) => !removed.includes(b)) }]));
  }
  if (state.earnedBadges) {
    state.earnedBadges = Object.fromEntries(Object.entries(state.earnedBadges).filter(([b]) => !removed.includes(b)));
  }
  return state as unknown as Store;
}

/**
 * Version 5: brand images, channel permission overwrites (replacing the old
 * "who can post" and "private" switches), new permissions and server badges.
 */
function migrateV4(p: Record<string, unknown>): Store {
  const state = { ...p } as Record<string, unknown> & Partial<State>;
  type LegacyChannel = Channel & { writeRoleIds?: ID[]; private?: boolean };
  if (state.servers) {
    state.servers = Object.fromEntries(
      Object.entries(state.servers).map(([id, server]) => {
        const roles = server.roles.map((r) => {
          const perms = new Set(r.permissions);
          if (r.isDefault) ['viewChannel', 'readHistory'].forEach((x) => perms.add(x as Permission));
          if (perms.has('sendMessages')) perms.add('sendVoiceMessages');
          if (perms.has('manageServer')) perms.add('manageBadges');
          return { ...r, permissions: [...perms] };
        });
        const icon = id === 's_onyx' && server.icon === SERVER_ICONS.onyx ? BRAND_IMAGES.onyxLogo.lg : server.icon;
        return [id, { ...server, icon, roles }];
      }),
    );
  }
  if (state.channels && state.servers) {
    const servers = state.servers;
    state.channels = Object.fromEntries(
      Object.entries(state.channels as Record<ID, LegacyChannel>).map(([id, c]) => {
        const { writeRoleIds, private: isPrivate, ...rest } = c;
        const everyone = servers[c.serverId] && everyoneRole(servers[c.serverId]);
        const overwrites: PermissionOverwrite[] = [...(rest.overwrites ?? [])];
        if (everyone && (isPrivate || writeRoleIds?.length)) {
          overwrites.push({ type: 'role', id: everyone.id, allow: [], deny: [...(isPrivate ? ['viewChannel' as const] : []), ...(writeRoleIds?.length ? ['sendMessages' as const] : [])] });
          writeRoleIds?.forEach((roleId) => overwrites.push({ type: 'role', id: roleId, allow: ['sendMessages'], deny: [] }));
        }
        return [id, { ...rest, overwrites: overwrites.length ? overwrites : undefined }];
      }),
    );
  }
  // New demo content (server badges, the private #team-room) – only where nothing exists yet.
  const seed = buildSeed();
  if (state.servers) {
    for (const sid of ['s_onyx', 's_scrims']) {
      const server: Server | undefined = state.servers[sid];
      const seeded = seed.servers[sid];
      if (!server || server.badges || !seeded?.badges) continue;
      const members: Server['members'] = { ...server.members };
      for (const [userId, m] of Object.entries(seeded.members)) if (m.badgeIds && members[userId]) members[userId] = { ...members[userId], badgeIds: m.badgeIds };
      state.servers = { ...state.servers, [sid]: { ...server, badges: seeded.badges, members } };
    }
  }
  if (state.servers?.s_onyx && state.channels && !state.channels.c_onyx_team && seed.channels.c_onyx_team) {
    state.channels = { ...state.channels, c_onyx_team: seed.channels.c_onyx_team };
    state.messages = { ...(state.messages ?? {}), c_onyx_team: seed.messages.c_onyx_team ?? [] };
    state.readState = { ...(state.readState ?? {}), c_onyx_team: Date.now() };
  }
  if (state.users) {
    const users = { ...state.users };
    for (const id of ['u_team', 'u_bot']) if (users[id]) users[id] = { ...users[id], avatar: { kind: 'image', src: BRAND_IMAGES.onyxLogo.lg } };
    const me = state.meId ? users[state.meId] : undefined;
    if (me?.avatar?.kind === 'art' && me.avatar.style === 'aurora' && me.avatar.seed === 7) users[me.id] = { ...me, avatar: { kind: 'image', src: BRAND_IMAGES.founderAvatar.lg } };
    state.users = users;
  }
  return state as unknown as Store;
}

/**
 * Version 6: notification settings per server, channel and DM replace the
 * local channel mutes; "Mentions only" becomes the default level for servers.
 */
function migrateV5(p: Record<string, unknown>): Store {
  const state = { ...p } as Record<string, unknown> & Partial<State>;
  const settings = state.settings as (Settings & { notifyMentionsOnly?: boolean }) | undefined;
  if (settings?.notifyMentionsOnly) state.notifyDefault = 'mentions';
  // Cloud mode uploads the old mutes once after sign-in (sync.ts); the demo converts them right away.
  if (!CLOUD && state.mutedChannels) {
    state.notifyPrefs = Object.fromEntries(
      Object.entries(state.mutedChannels)
        .filter(([, muted]) => muted)
        .map(([id]) => [id, { muted: true }]),
    );
    state.mutedChannels = {};
  }
  return state as unknown as Store;
}

/**
 * Version 7: new voice permissions. "Share screen" was part of "Video",
 * "Deafen / Move members" part of "Mute members" – they are added wherever
 * the old permission was (as the server migration onyx_voice does).
 */
function migrateV6(p: Record<string, unknown>): Store {
  const state = { ...p } as Record<string, unknown> & Partial<State>;
  const add = (list: Permission[], when: Permission, extra: Permission[]) => (list.includes(when) ? [...new Set([...list, ...extra])] : list);
  const widen = (list: Permission[]) => add(add(list, 'video', ['screenShare']), 'muteMembers', ['deafenMembers', 'moveMembers']);
  const widenOverwrites = (list: PermissionOverwrite[] | undefined) => list?.map((o) => ({ ...o, allow: widen(o.allow), deny: add(o.deny, 'video', ['screenShare']) }));
  if (state.servers) {
    state.servers = Object.fromEntries(
      Object.entries(state.servers).map(([id, server]) => [
        id,
        {
          ...server,
          roles: server.roles.map((r) => ({ ...r, permissions: widen(r.permissions) })),
          categories: server.categories.map((c) => ({ ...c, overwrites: widenOverwrites(c.overwrites) })),
        },
      ]),
    );
  }
  if (state.channels) state.channels = Object.fromEntries(Object.entries(state.channels).map(([id, c]) => [id, { ...c, overwrites: widenOverwrites(c.overwrites) }]));
  // The sample people in the demo's voice channels never stream or show a camera (there is nothing to watch).
  if (state.voice) state.voice = Object.fromEntries(Object.entries(state.voice).map(([id, list]) => [id, list.map(({ video: _v, streaming: _s, ...p }) => p)]));
  return state as unknown as Store;
}

function syncSelf(s: State) {
  const id = s.voiceSelf.channelId;
  if (!id) return;
  const p = s.voice[id]?.find((x) => x.userId === s.meId);
  if (p) {
    p.muted = s.voiceSelf.muted;
    p.deafened = s.voiceSelf.deafened;
    p.video = s.voiceSelf.camera;
    p.streaming = s.voiceSelf.screen;
  }
}

/** Sends a friend request and reports the result as a toast (profile cards, menus). */
export function addFriend(username: string) {
  void useStore
    .getState()
    .sendFriendRequest(username)
    .then((r) => toast({ tone: r.ok ? 'success' : 'danger', title: r.message }));
}
