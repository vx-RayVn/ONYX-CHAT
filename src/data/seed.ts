/**
 * Demo seed data: a lively community so layout, density and edge cases
 * (long names, missing avatars, long messages, empty channels) can be judged.
 * `buildSeed()` is called on first launch and when the demo is reset.
 */
import type { Channel, CustomEmoji, DMChannel, ID, Message, Permission, PermissionOverwrite, Reaction, Relationship, Server, User, VoiceParticipant } from '../types';
import { DAY, MINUTE } from '../lib/utils';
import { EMOJI_ART, SAMPLE_IMAGES, SERVER_BADGE_ART, SERVER_ICONS } from './art';
import { ANIMATED_EMOJI_SETS } from './emojiPacks';
import { BRAND_IMAGES } from '../config/brand';

export interface SeedData {
  meId: ID;
  users: Record<ID, User>;
  servers: Record<ID, Server>;
  serverOrder: ID[];
  channels: Record<ID, Channel>;
  dms: Record<ID, DMChannel>;
  messages: Record<ID, Message[]>;
  relationships: Record<ID, Relationship>;
  voice: Record<ID, VoiceParticipant[]>;
  readState: Record<ID, number>;
  notes: Record<ID, string>;
}

export const ME = 'u_me';

export function buildSeed(): SeedData {
  const now = Date.now();
  const ago = (min: number) => now - min * MINUTE;

  /* ---------------------------------------------------------------- */
  /* Users                                                             */
  /* ---------------------------------------------------------------- */
  const U = (u: Partial<User> & Pick<User, 'id' | 'username' | 'displayName'>): User => ({
    avatarColor: '#64748b',
    status: 'offline',
    badges: [],
    createdAt: now - 200 * DAY,
    ...u,
  });

  const userList: User[] = [
    U({
      id: ME,
      username: 'rayvn',
      displayName: 'rayvn',
      avatar: { kind: 'image', src: BRAND_IMAGES.founderAvatar.lg },
      avatarColor: '#10b981',
      banner: { kind: 'preset', id: 'emerald-aurora' },
      avatarDecoration: 'aurora',
      profileFrame: 'emerald-edge',
      borderLine: { avatar: false, card: true, color: '#10b981', color2: '#6ee7b7', speed: 'normal' },
      nameStyle: { font: 'default', effect: 'gradient', colors: ['#a7f3d0', '#34d399', '#10b981'] },
      bio: 'Founder of ONYX & OnyxServices.\nBuilding the platform I always wanted for myself. 💚',
      status: 'online',
      customStatus: { emoji: '🛠️', text: 'Building ONYX' },
      activity: { type: 'playing', name: 'Visual Studio Code', details: 'Working on ONYX', state: 'MessageList.tsx', since: ago(126) },
      badges: ['founder', 'team', 'founding-member', 'first-100', 'closed-beta'],
      profileColors: ['#0f2a22', '#0b1512'],
      memberNumber: 1,
      country: 'DE',
      createdAt: now - 290 * DAY,
    }),
    U({
      id: 'u_team',
      username: 'onyxteam',
      displayName: 'Onyx Team',
      avatar: { kind: 'image', src: BRAND_IMAGES.onyxLogo.lg },
      avatarColor: '#10b981',
      banner: { kind: 'preset', id: 'onyx-fracture-banner' },
      profileFrame: 'emerald-edge',
      bio: 'Official account of the ONYX team. We will never message you about passwords or payment details.',
      status: 'online',
      badges: ['team', 'verified'],
      memberNumber: 2,
      country: 'DE',
      createdAt: now - 290 * DAY,
    }),
    U({
      id: 'u_bot',
      username: 'onyx',
      displayName: 'ONYX',
      avatar: { kind: 'image', src: BRAND_IMAGES.onyxLogo.lg },
      avatarColor: '#10b981',
      bot: true,
      status: 'online',
      badges: ['verified'],
      bio: 'System assistant for welcomes and notices.',
      createdAt: now - 290 * DAY,
    }),
    U({
      id: 'u_nova',
      username: 'nova.fn',
      displayName: 'nova',
      avatar: { kind: 'art', style: 'aurora', hue: 278, hue2: 320, seed: 11, animated: true },
      avatarColor: '#8b5cf6',
      banner: { kind: 'preset', id: 'synthwave' },
      avatarDecoration: 'celestial-orbit',
      profileFrame: 'celestial-frame',
      profileEffect: 'shooting-stars',
      nameStyle: { font: 'tech', effect: 'gradient', colors: ['#f472b6', '#a78bfa', '#38bdf8'] },
      pronouns: 'she/her',
      bio: 'Fortnite creator · Streams Mon/Wed/Fri from 8 pm\nOrganiser at Fortnite Scrims DE 🏆',
      status: 'online',
      activity: { type: 'streaming', name: 'Fortnite', details: 'Zero Build duos with kai', since: ago(48) },
      badges: ['creator', 'supporter', 'onyx-og', 'founding-member', 'first-100'],
      plusSince: now - 120 * DAY,
      supporterWall: true,
      profileColors: ['#3b1a72', '#140a24'],
      memberNumber: 14,
      country: 'AT',
      createdAt: now - 250 * DAY,
    }),
    U({
      id: 'u_kai',
      username: 'kai',
      displayName: 'kai',
      avatar: { kind: 'art', style: 'pixel', hue: 168, seed: 42 },
      avatarColor: '#14b8a6',
      banner: { kind: 'preset', id: 'pixel-city' },
      avatarDecoration: 'pixel-hearts',
      profileFrame: 'pixel-frame',
      nameStyle: { font: 'pixel', effect: 'solid', colors: ['#5eead4'] },
      bio: 'active at night 🌙 · duos > solos',
      status: 'online',
      activity: { type: 'playing', name: 'Fortnite', details: 'Zero Build · Duos', since: ago(31) },
      badges: ['founding-member', 'supporter', 'first-100'],
      plusSince: now - 96 * DAY,
      supporterWall: false,
      memberNumber: 27,
      country: 'DE',
      createdAt: now - 240 * DAY,
    }),
    U({
      id: 'u_lumi',
      username: 'lumi.art',
      displayName: 'lumi',
      avatar: { kind: 'art', style: 'motif', motif: 'blossom', hue: 330, seed: 3 },
      avatarColor: '#f59e0b',
      banner: { kind: 'preset', id: 'sakura-banner' },
      avatarDecoration: 'sakura',
      profileFrame: 'sakura-frame',
      profileEffect: 'sakura-petals',
      nameStyle: { font: 'script', effect: 'gradient', colors: ['#fbcfe8', '#f472b6'] },
      profileColors: ['#831843', '#2a0a1c'],
      bio: 'Pixel art & lo-fi. I make emojis for servers – just ask 🎨',
      status: 'idle',
      customStatus: { emoji: '🎨', text: 'drawing right now' },
      badges: ['creator', 'first-100'],
      memberNumber: 58,
      country: 'NL',
      createdAt: now - 180 * DAY,
    }),
    U({
      id: 'u_rio',
      username: 'rio',
      displayName: 'rio',
      avatarColor: '#f43f5e',
      status: 'dnd',
      customStatus: { emoji: '🎯', text: 'Ranked – please don’t disturb' },
      activity: { type: 'playing', name: 'Valorant', details: 'Competitive · Ascent', since: ago(74) },
      badges: ['first-1000'],
      memberNumber: 133,
      country: 'ES',
      createdAt: now - 160 * DAY,
    }),
    U({
      id: 'u_zed',
      username: 'zed',
      displayName: 'zed',
      avatarColor: '#64748b',
      status: 'offline',
      badges: ['bug-hunter', 'onyx-og', 'founding-member', 'first-100'],
      memberNumber: 9,
      country: 'CH',
      createdAt: now - 270 * DAY,
    }),
    U({
      id: 'u_mira',
      username: 'mira.k',
      displayName: 'Mira',
      avatar: { kind: 'art', style: 'motif', motif: 'pumpkin', hue: 28, seed: 8, animated: true },
      avatarColor: '#ec4899',
      banner: { kind: 'preset', id: 'haunted-banner' },
      avatarDecoration: 'haunted-harvest',
      profileFrame: 'haunted-frame',
      profileEffect: 'haunted-night',
      profileColors: ['#7c2d12', '#2e1065'],
      pronouns: 'she/her',
      bio: 'Valorant & Overwatch · support main 💜',
      status: 'online',
      activity: { type: 'listening', name: 'Music', details: 'Midnight City', state: 'M83', since: ago(6) },
      badges: ['halloween-2026', 'first-1000'],
      memberNumber: 312,
      country: 'PL',
      createdAt: now - 120 * DAY,
    }),
    U({
      id: 'u_theo',
      username: 'theo.builds',
      displayName: 'Theo',
      avatar: { kind: 'art', style: 'rings', hue: 140, seed: 9 },
      avatarColor: '#22c55e',
      avatarDecoration: 'laurel',
      nameStyle: { font: 'pixel', effect: 'pop', colors: ['#a3e635', '#14532d'] },
      status: 'online',
      activity: { type: 'playing', name: 'Minecraft', details: 'Nebelreich SMP', since: ago(95) },
      bio: 'Builds cities that are never finished. Moderator in the ONYX Community.',
      badges: ['community-builder', 'supporter', 'onyx-og', 'founding-member', 'first-100'],
      plusSince: now - 140 * DAY,
      supporterWall: true,
      memberNumber: 71,
      country: 'DE',
      createdAt: now - 210 * DAY,
    }),
    U({
      id: 'u_ayla',
      username: 'ayla',
      displayName: 'Ayla',
      avatar: { kind: 'art', style: 'motif', motif: 'crystal', hue: 160, seed: 1, animated: true },
      avatarColor: '#0ea5e9',
      banner: { kind: 'preset', id: 'onyx-fracture-banner' },
      avatarDecoration: 'onyx-fracture',
      profileFrame: 'gilded',
      profileEffect: 'crystal-shatter',
      borderLine: { avatar: true, card: true, color: '#a78bfa', color2: '#f0abfc', speed: 'slow' },
      nameStyle: { font: 'elegant', effect: 'metallic', colors: ['#e9d5ff'] },
      bio: 'Profile frame collector ✨',
      status: 'idle',
      badges: ['supporter', 'onyx-og', 'first-1000'],
      plusSince: now - 61 * DAY,
      supporterWall: true,
      memberNumber: 506,
      country: 'TR',
      createdAt: now - 90 * DAY,
    }),
    U({
      id: 'u_frost',
      username: 'frostbyte',
      displayName: 'frostbyte',
      avatar: { kind: 'art', style: 'pixel', hue: 200, seed: 77 },
      avatarColor: '#38bdf8',
      avatarDecoration: 'neon-halo',
      status: 'online',
      bio: 'Scrim organiser & tournament caster.',
      badges: ['first-10000'],
      memberNumber: 1377,
      country: 'UA',
      createdAt: now - 70 * DAY,
    }),
    U({
      id: 'u_pixel',
      username: 'professorpixelausdemnorden',
      displayName: 'ProfessorPixelAusDemNorden',
      avatarColor: '#6366f1',
      status: 'online',
      bio: 'Hey! I collect retro consoles, build speedrun routes for old platformers and occasionally stream long nights full of pixels, chiptunes and bad puns. If you know a hidden level, message me.',
      badges: ['first-10000'],
      memberNumber: 3150,
      country: 'DE',
      createdAt: now - 40 * DAY,
    }),
    U({
      id: 'u_max',
      username: 'maxvsh',
      displayName: 'Maximilian von Schattenwald-Hohenberg',
      avatar: { kind: 'art', style: 'facet', hue: 212, seed: 21 },
      avatarColor: '#3b82f6',
      avatarDecoration: 'facet',
      status: 'online',
      badges: ['supporter', 'founding-member', 'first-1000'],
      plusSince: now - 88 * DAY,
      supporterWall: true,
      memberNumber: 247,
      country: 'DE',
      createdAt: now - 130 * DAY,
    }),
    U({
      id: 'u_jay',
      username: 'jayjay',
      displayName: 'JayJay',
      avatar: { kind: 'art', style: 'wave', hue: 46, hue2: 20, seed: 8 },
      avatarColor: '#eab308',
      status: 'offline',
      badges: ['first-1000'],
      memberNumber: 802,
      country: 'US',
      createdAt: now - 60 * DAY,
    }),
    U({
      id: 'u_sam',
      username: 'samokafor',
      displayName: 'Sam Okafor',
      avatarColor: '#0ea5e9',
      status: 'online',
      badges: ['first-10000'],
      memberNumber: 2208,
      country: 'GB',
      createdAt: now - 33 * DAY,
    }),
    U({
      id: 'u_lena',
      username: 'lena.gg',
      displayName: 'Lena',
      avatar: { kind: 'art', style: 'orb', hue: 12, hue2: 340, seed: 2 },
      avatarColor: '#f97316',
      status: 'idle',
      bio: 'Moderator · Happy to help with questions about ONYX.',
      badges: ['supporter', 'first-100'],
      plusSince: now - 150 * DAY,
      supporterWall: true,
      memberNumber: 96,
      country: 'DE',
      createdAt: now - 150 * DAY,
    }),
    U({
      id: 'u_emre',
      username: 'emre07',
      displayName: 'Emre',
      avatar: { kind: 'art', style: 'pixel', hue: 24, seed: 31 },
      avatarColor: '#f97316',
      status: 'online',
      activity: { type: 'playing', name: 'Valorant', since: ago(22) },
      badges: ['first-1000'],
      memberNumber: 689,
      country: 'TR',
      createdAt: now - 80 * DAY,
    }),
    U({
      id: 'u_noah',
      username: 'noah',
      displayName: 'Noah',
      avatar: { kind: 'art', style: 'rings', hue: 258, seed: 4 },
      avatarColor: '#8b5cf6',
      status: 'offline',
      badges: ['first-10000'],
      memberNumber: 1040,
      country: 'SE',
      createdAt: now - 50 * DAY,
    }),
    U({
      id: 'u_yuki',
      username: 'yuki.setup',
      displayName: 'Yuki',
      avatar: { kind: 'art', style: 'facet', hue: 186, seed: 63 },
      avatarColor: '#06b6d4',
      avatarDecoration: 'neon-halo',
      nameStyle: { font: 'mono', effect: 'neon', colors: ['#22d3ee'] },
      status: 'online',
      bio: 'Keyboard enthusiast ⌨️ · 65% for life',
      banner: { kind: 'preset', id: 'carbon' },
      badges: ['supporter', 'first-1000'],
      plusSince: now - 70 * DAY,
      supporterWall: true,
      memberNumber: 418,
      country: 'JP',
      createdAt: now - 100 * DAY,
    }),
    U({
      id: 'u_vex',
      username: 'vex',
      displayName: 'vex',
      avatar: { kind: 'art', style: 'motif', motif: 'flame', hue: 24, seed: 7, animated: true },
      avatarColor: '#f43f5e',
      banner: { kind: 'preset', id: 'dragon-ember-banner' },
      avatarDecoration: 'dragon-ember',
      profileFrame: 'dragon-frame',
      profileEffect: 'ember-rise',
      nameStyle: { font: 'ornate', effect: 'metallic', colors: ['#fbbf24'] },
      status: 'online',
      badges: ['first-10000'],
      memberNumber: 1655,
      country: 'BR',
      createdAt: now - 45 * DAY,
    }),
    U({
      id: 'u_ella',
      username: 'ella',
      displayName: 'Ella',
      avatarColor: '#ec4899',
      status: 'online',
      badges: ['supporter', 'first-10000'],
      plusSince: now - 9 * DAY,
      supporterWall: true,
      memberNumber: 4721,
      country: 'IT',
      createdAt: now - 20 * DAY,
    }),
    U({
      id: 'u_ben',
      username: 'benbuilds',
      displayName: 'Ben',
      avatar: { kind: 'art', style: 'pixel', hue: 96, seed: 19 },
      avatarColor: '#84cc16',
      status: 'idle',
      badges: ['first-1000'],
      memberNumber: 913,
      country: 'GB',
      createdAt: now - 66 * DAY,
    }),
    U({
      id: 'u_kira',
      username: 'kira',
      displayName: 'Kira',
      avatar: { kind: 'art', style: 'motif', motif: 'void', hue: 280, seed: 6, animated: true },
      avatarColor: '#a855f7',
      banner: { kind: 'preset', id: 'void-rift-banner' },
      avatarDecoration: 'void-rift',
      profileFrame: 'void-frame',
      profileEffect: 'void-open',
      status: 'offline',
      badges: ['first-10000'],
      memberNumber: 6083,
      country: 'KR',
      createdAt: now - 12 * DAY,
    }),
    U({ id: 'u_tim', username: 'toxic_tim', displayName: 'toxic_tim', avatarColor: '#475569', status: 'offline', memberNumber: 8890, country: 'US', createdAt: now - 8 * DAY }),
    U({
      id: 'u_scrimbot',
      username: 'scrimbot',
      displayName: 'ScrimBot',
      avatar: { kind: 'art', style: 'rings', hue: 268, seed: 99 },
      avatarColor: '#7c3aed',
      bot: true,
      status: 'online',
      createdAt: now - 70 * DAY,
    }),
  ];
  const users = Object.fromEntries(userList.map((u) => [u.id, u]));

  /* ---------------------------------------------------------------- */
  /* Custom emojis                                                     */
  /* ---------------------------------------------------------------- */
  const onyxEmojis: CustomEmoji[] = [
    { id: 'e_onyx', name: 'onyx', src: EMOJI_ART.onyx },
    { id: 'e_gg', name: 'gg', src: EMOJI_ART.gg },
    { id: 'e_w', name: 'w', src: EMOJI_ART.w },
    { id: 'e_hype', name: 'hype', src: EMOJI_ART.hype },
    { id: 'e_heart', name: 'onyx_heart', src: EMOJI_ART.heart },
    { id: 'e_crown', name: 'crown1', src: EMOJI_ART.crown },
    { id: 'e_salute', name: 'salute', src: EMOJI_ART.salute },
    // Animated server emojis – usable everywhere by members of the server.
    ...ANIMATED_EMOJI_SETS.onyx,
  ];

  /* ---------------------------------------------------------------- */
  /* Servers & channels                                                */
  /* ---------------------------------------------------------------- */
  const channels: Record<ID, Channel> = {};
  const ch = (c: Omit<Channel, 'position'> & { position?: number }) => {
    const position = c.position ?? Object.values(channels).filter((x) => x.serverId === c.serverId && x.categoryId === c.categoryId).length;
    channels[c.id] = { ...c, position };
  };
  const member = (userId: ID, roleIds: ID[], joinedDaysAgo: number, badgeIds?: ID[]) => ({ userId, roleIds, joinedAt: now - joinedDaysAgo * DAY, badgeIds });
  const rule = (id: ID, allow: Permission[], deny: Permission[] = []): PermissionOverwrite => ({ type: 'role', id, allow, deny });
  /** Only the given roles can post; everyone else reads. */
  const postOnly = (everyoneId: ID, roleIds: ID[]) => [rule(everyoneId, [], ['sendMessages']), ...roleIds.map((id) => rule(id, ['sendMessages']))];

  // ONYX Community ---------------------------------------------------
  const onyx: Server = {
    id: 's_onyx',
    name: 'ONYX Community',
    icon: BRAND_IMAGES.onyxLogo.lg,
    iconColor: '#10b981',
    banner: { kind: 'preset', id: 'emerald-aurora' },
    description: 'The official community of ONYX and OnyxServices. Updates, clips, finding teammates and support.',
    ownerId: ME,
    verified: true,
    systemChannelId: 'c_onyx_welcome',
    createdAt: now - 280 * DAY,
    categories: [
      { id: 'k_onyx_start', name: 'Start', position: 0, overwrites: postOnly('r_onyx_everyone', ['r_onyx_team']) },
      { id: 'k_onyx_comm', name: 'Community', position: 1 },
      { id: 'k_onyx_shop', name: 'OnyxServices', position: 2 },
      { id: 'k_onyx_voice', name: 'Voice Channels', position: 3 },
    ],
    roles: [
      { id: 'r_onyx_founder', name: 'Founder', color: '#10b981', hoist: true, position: 6, permissions: ['administrator'] },
      {
        id: 'r_onyx_team',
        name: 'Team',
        color: '#2dd4bf',
        hoist: true,
        position: 5,
        permissions: [
          'manageServer',
          'manageChannels',
          'manageRoles',
          'manageBadges',
          'kickMembers',
          'banMembers',
          'manageMessages',
          'mentionEveryone',
          'createInvites',
          'sendMessages',
          'sendVoiceMessages',
          'attachFiles',
          'addReactions',
          'connect',
          'speak',
          'video',
          'screenShare',
          'muteMembers',
          'deafenMembers',
          'moveMembers',
        ],
      },
      {
        id: 'r_onyx_mod',
        name: 'Moderator',
        color: '#60a5fa',
        hoist: true,
        position: 4,
        permissions: [
          'kickMembers',
          'manageMessages',
          'muteMembers',
          'deafenMembers',
          'moveMembers',
          'createInvites',
          'sendMessages',
          'sendVoiceMessages',
          'attachFiles',
          'addReactions',
          'connect',
          'speak',
          'video',
          'screenShare',
        ],
      },
      {
        id: 'r_onyx_creator',
        name: 'Creator',
        color: '#c084fc',
        hoist: true,
        position: 3,
        permissions: ['createInvites', 'sendMessages', 'sendVoiceMessages', 'attachFiles', 'addReactions', 'connect', 'speak', 'video', 'screenShare'],
      },
      {
        id: 'r_onyx_supporter',
        name: 'Supporter',
        color: '#fbbf24',
        hoist: false,
        position: 2,
        permissions: ['sendMessages', 'sendVoiceMessages', 'attachFiles', 'addReactions', 'connect', 'speak', 'video', 'screenShare'],
      },
      {
        id: 'r_onyx_member',
        name: 'Member',
        color: null,
        hoist: false,
        position: 1,
        permissions: ['sendMessages', 'sendVoiceMessages', 'attachFiles', 'addReactions', 'connect', 'speak', 'video', 'screenShare'],
      },
      {
        id: 'r_onyx_everyone',
        name: '@everyone',
        color: null,
        hoist: false,
        position: 0,
        permissions: ['viewChannel', 'readHistory', 'sendMessages', 'sendVoiceMessages', 'addReactions', 'connect', 'speak', 'createInvites'],
        isDefault: true,
      },
    ],
    members: Object.fromEntries(
      [
        member(ME, ['r_onyx_founder'], 280),
        member('u_team', ['r_onyx_team'], 280, ['sb_onyx_helper']),
        member('u_bot', [], 280),
        member('u_theo', ['r_onyx_mod', 'r_onyx_member'], 200, ['sb_onyx_helper', 'sb_onyx_event']),
        member('u_lena', ['r_onyx_mod', 'r_onyx_member'], 140, ['sb_onyx_helper']),
        member('u_nova', ['r_onyx_creator', 'r_onyx_supporter'], 240, ['sb_onyx_clip', 'sb_onyx_event']),
        member('u_lumi', ['r_onyx_creator'], 170),
        member('u_kai', ['r_onyx_supporter', 'r_onyx_member'], 230, ['sb_onyx_event']),
        member('u_ayla', ['r_onyx_supporter', 'r_onyx_member'], 85),
        member('u_rio', ['r_onyx_member'], 150),
        member('u_zed', ['r_onyx_member'], 260),
        member('u_mira', ['r_onyx_member'], 110),
        member('u_max', ['r_onyx_member'], 120),
        member('u_pixel', ['r_onyx_member'], 30),
        member('u_jay', ['r_onyx_member'], 55),
        member('u_sam', ['r_onyx_member'], 30),
        member('u_emre', ['r_onyx_member'], 75),
        member('u_noah', ['r_onyx_member'], 45),
        member('u_yuki', ['r_onyx_member'], 95),
        member('u_vex', ['r_onyx_member'], 40),
        member('u_ella', ['r_onyx_member'], 18),
        member('u_ben', ['r_onyx_member'], 60),
        member('u_kira', ['r_onyx_member'], 10),
      ].map((m) => [m.userId, m]),
    ),
    invites: [
      { code: 'onyx-community', channelId: 'c_onyx_welcome', inviterId: ME, uses: 1284, maxUses: null, expiresAt: null, createdAt: now - 200 * DAY },
      { code: 'stream-oct', channelId: 'c_onyx_general', inviterId: 'u_nova', uses: 86, maxUses: 100, expiresAt: now + 3 * DAY, createdAt: now - 4 * DAY },
    ],
    emojis: onyxEmojis,
    badges: [
      { id: 'sb_onyx_helper', name: 'Community Helper', image: SERVER_BADGE_ART.helper, description: 'Answers questions in #support and helps new members.', createdAt: now - 120 * DAY },
      { id: 'sb_onyx_clip', name: 'Clip of the Week', image: SERVER_BADGE_ART.clip, description: 'Won the weekly clip vote in #clips-and-highlights.', createdAt: now - 60 * DAY },
      { id: 'sb_onyx_event', name: 'Halloween Hunt 2026', image: SERVER_BADGE_ART.event, description: 'Took part in the community Halloween hunt.', createdAt: now - 6 * DAY },
    ],
  };
  ch({ id: 'c_onyx_welcome', serverId: 's_onyx', categoryId: 'k_onyx_start', name: 'welcome', type: 'announcement', topic: 'Great to have you here! Start here.' });
  ch({
    id: 'c_onyx_rules',
    serverId: 's_onyx',
    categoryId: 'k_onyx_start',
    name: 'rules',
    type: 'text',
    topic: 'Please read once – then you’re good to go.',
    overwrites: [rule('r_onyx_everyone', [], ['addReactions'])],
  });
  ch({ id: 'c_onyx_news', serverId: 's_onyx', categoryId: 'k_onyx_start', name: 'announcements', type: 'announcement', topic: 'Updates and news about ONYX.' });
  ch({ id: 'c_onyx_general', serverId: 's_onyx', categoryId: 'k_onyx_comm', name: 'general', type: 'text', topic: 'Chat, ask, say hi. Please keep it friendly 💚' });
  ch({ id: 'c_onyx_clips', serverId: 's_onyx', categoryId: 'k_onyx_comm', name: 'clips-and-highlights', type: 'text', topic: 'Your best moments. Your own clips only, please.' });
  ch({ id: 'c_onyx_lfg', serverId: 's_onyx', categoryId: 'k_onyx_comm', name: 'looking-for-group', type: 'text', topic: 'Mode, region, rank – you’ll find someone faster.', slowmode: 30 });
  ch({ id: 'c_onyx_offtopic', serverId: 's_onyx', categoryId: 'k_onyx_comm', name: 'off-topic', type: 'text', topic: 'Everything that doesn’t fit anywhere else.' });
  ch({
    id: 'c_onyx_team',
    serverId: 's_onyx',
    categoryId: 'k_onyx_comm',
    name: 'team-room',
    type: 'text',
    topic: 'Private: planning, moderation and releases. Only Team and Moderators can see this channel.',
    overwrites: [rule('r_onyx_everyone', [], ['viewChannel']), rule('r_onyx_team', ['viewChannel']), rule('r_onyx_mod', ['viewChannel'])],
  });
  ch({
    id: 'c_onyx_offers',
    serverId: 's_onyx',
    categoryId: 'k_onyx_shop',
    name: 'offers',
    type: 'announcement',
    topic: 'News from the OnyxServices shop.',
    overwrites: postOnly('r_onyx_everyone', ['r_onyx_team']),
  });
  ch({ id: 'c_onyx_support', serverId: 's_onyx', categoryId: 'k_onyx_shop', name: 'support', type: 'text', topic: 'Questions about orders? The team helps you here.' });
  ch({ id: 'c_onyx_lounge', serverId: 's_onyx', categoryId: 'k_onyx_voice', name: 'Lounge', type: 'voice' });
  ch({ id: 'c_onyx_squad1', serverId: 's_onyx', categoryId: 'k_onyx_voice', name: 'Squad 1', type: 'voice', userLimit: 4 });
  ch({ id: 'c_onyx_squad2', serverId: 's_onyx', categoryId: 'k_onyx_voice', name: 'Squad 2', type: 'voice', userLimit: 4 });
  ch({ id: 'c_onyx_afk', serverId: 's_onyx', categoryId: 'k_onyx_voice', name: 'AFK', type: 'voice' });

  // Fortnite Scrims DE --------------------------------------------------
  const scrims: Server = {
    id: 's_scrims',
    name: 'Fortnite Scrims DE',
    icon: SERVER_ICONS.scrims,
    iconColor: '#7c3aed',
    banner: { kind: 'preset', id: 'synthwave' },
    description: 'Weekly Zero Build scrims for the DACH region. Fair, organised, with live casting.',
    ownerId: 'u_nova',
    systemChannelId: 'c_scr_chat',
    createdAt: now - 160 * DAY,
    categories: [
      { id: 'k_scr_info', name: 'Info', position: 0, overwrites: postOnly('r_scr_everyone', []) },
      { id: 'k_scr_scrims', name: 'Scrims', position: 1 },
      { id: 'k_scr_voice', name: 'Voice', position: 2 },
    ],
    roles: [
      { id: 'r_scr_orga', name: 'Orga', color: '#a78bfa', hoist: true, position: 3, permissions: ['administrator'] },
      { id: 'r_scr_caster', name: 'Caster', color: '#f472b6', hoist: true, position: 2, permissions: ['sendMessages', 'sendVoiceMessages', 'connect', 'speak', 'video', 'screenShare'] },
      { id: 'r_scr_player', name: 'Player', color: '#38bdf8', hoist: true, position: 1, permissions: ['sendMessages', 'sendVoiceMessages', 'addReactions', 'connect', 'speak'] },
      {
        id: 'r_scr_everyone',
        name: '@everyone',
        color: null,
        hoist: false,
        position: 0,
        permissions: ['viewChannel', 'readHistory', 'sendMessages', 'sendVoiceMessages', 'addReactions', 'connect'],
        isDefault: true,
      },
    ],
    members: Object.fromEntries(
      [
        member('u_nova', ['r_scr_orga'], 160),
        member('u_frost', ['r_scr_orga'], 70),
        member('u_scrimbot', [], 70),
        member('u_lumi', ['r_scr_caster'], 100),
        member(ME, ['r_scr_player'], 120),
        member('u_kai', ['r_scr_player'], 150),
        member('u_rio', ['r_scr_player'], 90),
        member('u_emre', ['r_scr_player'], 60),
        member('u_vex', ['r_scr_player'], 40),
        member('u_ella', ['r_scr_player'], 15),
        member('u_ben', ['r_scr_player'], 55),
        member('u_noah', [], 30),
      ].map((m) => [m.userId, m]),
    ),
    invites: [{ code: 'scrims-de', channelId: 'c_scr_chat', inviterId: 'u_nova', uses: 412, maxUses: null, expiresAt: null, createdAt: now - 120 * DAY }],
    emojis: [{ id: 'e_lfg', name: 'lfg', src: EMOJI_ART.lfg }, ...ANIMATED_EMOJI_SETS.halloween],
    badges: [
      { id: 'sb_scr_champ', name: 'Scrim Champion', image: SERVER_BADGE_ART.champion, description: 'Won a scrim week.', createdAt: now - 40 * DAY },
      { id: 'sb_scr_caster', name: 'Caster Crew', image: SERVER_BADGE_ART.caster, createdAt: now - 90 * DAY },
    ],
  };
  ch({ id: 'c_scr_news', serverId: 's_scrims', categoryId: 'k_scr_info', name: 'announcements', type: 'announcement', topic: 'Dates, lobby info and rules for the next scrims.' });
  ch({ id: 'c_scr_rules', serverId: 's_scrims', categoryId: 'k_scr_info', name: 'rules', type: 'text' });
  ch({ id: 'c_scr_chat', serverId: 's_scrims', categoryId: 'k_scr_scrims', name: 'scrim-chat', type: 'text', topic: 'Coordination before and after the rounds.' });
  ch({ id: 'c_scr_lfg', serverId: 's_scrims', categoryId: 'k_scr_scrims', name: 'lfg-duos', type: 'text', topic: 'Find a duo partner for the next round.' });
  ch({ id: 'c_scr_results', serverId: 's_scrims', categoryId: 'k_scr_scrims', name: 'results', type: 'text', overwrites: postOnly('r_scr_everyone', []) });
  ch({ id: 'c_scr_lobby', serverId: 's_scrims', categoryId: 'k_scr_voice', name: 'Scrim Lobby', type: 'voice' });
  ch({ id: 'c_scr_duo1', serverId: 's_scrims', categoryId: 'k_scr_voice', name: 'Duo 1', type: 'voice', userLimit: 2 });
  ch({ id: 'c_scr_duo2', serverId: 's_scrims', categoryId: 'k_scr_voice', name: 'Duo 2', type: 'voice', userLimit: 2 });
  ch({ id: 'c_scr_cast', serverId: 's_scrims', categoryId: 'k_scr_voice', name: 'Caster Booth', type: 'voice', userLimit: 3 });

  // Late Night Lobby ------------------------------------------------------
  const late: Server = {
    id: 's_late',
    name: 'Late Night Lobby',
    icon: SERVER_ICONS.lateNight,
    iconColor: '#312e81',
    banner: { kind: 'preset', id: 'nebula' },
    description: 'A small crew for long nights.',
    ownerId: 'u_kai',
    systemChannelId: 'c_late_chat',
    createdAt: now - 140 * DAY,
    categories: [
      { id: 'k_late_text', name: 'Text', position: 0 },
      { id: 'k_late_voice', name: 'Voice', position: 1 },
    ],
    roles: [
      { id: 'r_late_host', name: 'Host', color: '#818cf8', hoist: true, position: 1, permissions: ['administrator'] },
      {
        id: 'r_late_everyone',
        name: '@everyone',
        color: null,
        hoist: false,
        position: 0,
        permissions: ['viewChannel', 'readHistory', 'sendMessages', 'sendVoiceMessages', 'addReactions', 'attachFiles', 'connect', 'speak', 'video', 'screenShare', 'createInvites'],
        isDefault: true,
      },
    ],
    members: Object.fromEntries(
      [member('u_kai', ['r_late_host'], 140), member(ME, [], 130), member('u_mira', [], 100), member('u_rio', [], 90), member('u_lumi', [], 80), member('u_zed', [], 70)].map((m) => [m.userId, m]),
    ),
    invites: [],
    emojis: [],
  };
  ch({ id: 'c_late_chat', serverId: 's_late', categoryId: 'k_late_text', name: 'chat', type: 'text' });
  ch({ id: 'c_late_memes', serverId: 's_late', categoryId: 'k_late_text', name: 'memes', type: 'text', topic: 'Quality over quantity. Mostly.' });
  ch({ id: 'c_late_couch', serverId: 's_late', categoryId: 'k_late_voice', name: 'Couch', type: 'voice' });
  ch({ id: 'c_late_gaming', serverId: 's_late', categoryId: 'k_late_voice', name: 'Gaming', type: 'voice' });

  // Nebelreich SMP (long name) ---------------------------------------------
  const smp: Server = {
    id: 's_smp',
    name: 'Nebelreich SMP – Survival & Creative Community',
    icon: SERVER_ICONS.smp,
    iconColor: '#15803d',
    description: 'Relaxed Minecraft survival server with city building, events and a creative world.',
    ownerId: 'u_theo',
    systemChannelId: 'c_smp_welcome',
    createdAt: now - 100 * DAY,
    categories: [
      { id: 'k_smp_info', name: 'Info', position: 0, overwrites: postOnly('r_smp_everyone', []) },
      { id: 'k_smp_world', name: 'World', position: 1 },
      { id: 'k_smp_voice', name: 'Voice', position: 2 },
    ],
    roles: [
      { id: 'r_smp_admin', name: 'Admin', color: '#22c55e', hoist: true, position: 2, permissions: ['administrator'] },
      { id: 'r_smp_builder', name: 'Builder', color: '#a3e635', hoist: true, position: 1, permissions: ['sendMessages', 'sendVoiceMessages', 'attachFiles', 'addReactions', 'connect', 'speak'] },
      {
        id: 'r_smp_everyone',
        name: '@everyone',
        color: null,
        hoist: false,
        position: 0,
        permissions: ['viewChannel', 'readHistory', 'sendMessages', 'sendVoiceMessages', 'addReactions', 'connect', 'speak'],
        isDefault: true,
      },
    ],
    members: Object.fromEntries(
      [
        member('u_theo', ['r_smp_admin'], 100),
        member('u_ben', ['r_smp_builder'], 90),
        member(ME, [], 60),
        member('u_sam', [], 30),
        member('u_kira', ['r_smp_builder'], 12),
        member('u_jay', [], 40),
      ].map((m) => [m.userId, m]),
    ),
    invites: [],
    emojis: [],
  };
  ch({ id: 'c_smp_welcome', serverId: 's_smp', categoryId: 'k_smp_info', name: 'welcome', type: 'text' });
  ch({ id: 'c_smp_status', serverId: 's_smp', categoryId: 'k_smp_info', name: 'server-status', type: 'text' });
  ch({ id: 'c_smp_builds', serverId: 's_smp', categoryId: 'k_smp_world', name: 'build-projects', type: 'text' });
  ch({ id: 'c_smp_trade', serverId: 's_smp', categoryId: 'k_smp_world', name: 'trading-and-swapping-between-players', type: 'text', topic: 'Offer/request – trade fairly.' });
  ch({ id: 'c_smp_voice', serverId: 's_smp', categoryId: 'k_smp_voice', name: 'Build HQ', type: 'voice' });

  // Pixel Art Atelier (no icon) -------------------------------------------
  const pixel: Server = {
    id: 's_pixel',
    name: 'Pixel Art Atelier',
    iconColor: '#b45309',
    description: 'Share pixel art, give feedback, learn together.',
    ownerId: 'u_lumi',
    systemChannelId: 'c_pix_gallery',
    createdAt: now - 60 * DAY,
    categories: [{ id: 'k_pix_main', name: 'Atelier', position: 0 }],
    roles: [
      { id: 'r_pix_artist', name: 'Artist', color: '#fb923c', hoist: true, position: 1, permissions: ['sendMessages', 'sendVoiceMessages', 'attachFiles', 'addReactions'] },
      {
        id: 'r_pix_everyone',
        name: '@everyone',
        color: null,
        hoist: false,
        position: 0,
        permissions: ['viewChannel', 'readHistory', 'sendMessages', 'sendVoiceMessages', 'addReactions', 'attachFiles', 'connect', 'speak'],
        isDefault: true,
      },
    ],
    members: Object.fromEntries([member('u_lumi', ['r_pix_artist'], 60), member(ME, [], 50), member('u_ayla', ['r_pix_artist'], 40), member('u_pixel', [], 20)].map((m) => [m.userId, m])),
    invites: [],
    emojis: [...ANIMATED_EMOJI_SETS.winter, ...ANIMATED_EMOJI_SETS.summer],
  };
  ch({ id: 'c_pix_gallery', serverId: 's_pixel', categoryId: 'k_pix_main', name: 'gallery', type: 'text' });
  ch({ id: 'c_pix_feedback', serverId: 's_pixel', categoryId: 'k_pix_main', name: 'feedback', type: 'text', topic: 'Constructive, friendly, specific.' });
  ch({ id: 'c_pix_voice', serverId: 's_pixel', categoryId: 'k_pix_main', name: 'Atelier', type: 'voice' });

  const servers = Object.fromEntries([onyx, scrims, late, smp, pixel].map((s) => [s.id, s]));
  const serverOrder = ['s_onyx', 's_scrims', 's_late', 's_smp', 's_pixel'];

  /* ---------------------------------------------------------------- */
  /* DMs                                                               */
  /* ---------------------------------------------------------------- */
  const dms: Record<ID, DMChannel> = {
    dm_nova: { id: 'dm_nova', type: 'dm', participantIds: [ME, 'u_nova'], lastActivityAt: ago(15) },
    dm_mira: { id: 'dm_mira', type: 'dm', participantIds: [ME, 'u_mira'], lastActivityAt: ago(24) },
    dm_kai: { id: 'dm_kai', type: 'dm', participantIds: [ME, 'u_kai'], lastActivityAt: ago(50) },
    dm_squad: { id: 'dm_squad', type: 'group', participantIds: [ME, 'u_kai', 'u_rio', 'u_lumi'], name: 'Squad 🔥', ownerId: ME, lastActivityAt: ago(380) },
    dm_max: { id: 'dm_max', type: 'dm', participantIds: [ME, 'u_max'], lastActivityAt: ago(1500) },
    dm_zed: { id: 'dm_zed', type: 'dm', participantIds: [ME, 'u_zed'], lastActivityAt: ago(10075) },
  };

  /* ---------------------------------------------------------------- */
  /* Messages                                                          */
  /* ---------------------------------------------------------------- */
  const messages: Record<ID, Message[]> = {};
  let seq = 0;
  const pool = userList.filter((u) => !u.bot).map((u) => u.id);
  const pick = (n: number, include: ID[] = []) => {
    const rest = pool.filter((id) => !include.includes(id));
    return [...include, ...rest].slice(0, n);
  };
  const r = (emoji: string, count: number, include: ID[] = []): Reaction => ({ emoji, userIds: pick(count, include) });

  const post = (channelId: ID, authorId: ID, minAgo: number, content: string, extra: Partial<Message> = {}): Message => {
    const m: Message = {
      id: `m_${(++seq).toString(36).padStart(3, '0')}`,
      channelId,
      authorId,
      type: 'default',
      content,
      createdAt: ago(minAgo),
      reactions: [],
      attachments: [],
      embeds: [],
      ...extra,
    };
    (messages[channelId] ??= []).push(m);
    return m;
  };
  const join = (channelId: ID, userId: ID, minAgo: number) => post(channelId, userId, minAgo, '', { type: 'join' });

  // #welcome
  join('c_onyx_welcome', 'u_kira', 14400);
  post('c_onyx_welcome', 'u_bot', 14399, '', {
    embeds: [
      {
        color: '#10b981',
        title: 'Welcome to the ONYX Community 👋',
        description: 'Great to have you here! Meet players, creators and the team behind ONYX and OnyxServices.',
        fields: [
          { name: '1 · Read the rules', value: 'Short and fair – in <#c_onyx_rules>.', inline: true },
          { name: '2 · Say hi', value: 'Introduce yourself in <#c_onyx_general>.', inline: true },
          { name: '3 · Customize your profile', value: 'Decorations, frames, banners and name styles are free.', inline: true },
        ],
        footer: 'ONYX · This message is shown to new members',
      },
    ],
  });
  join('c_onyx_welcome', 'u_ella', 2700);
  join('c_onyx_welcome', 'u_sam', 1900);
  join('c_onyx_welcome', 'u_pixel', 320);

  // #rules
  post('c_onyx_rules', 'u_team', 20000, '', {
    embeds: [
      {
        color: '#10b981',
        title: 'Server rules',
        description: 'So everyone feels at home here. Violations can lead to a warning or a ban.',
        fields: [
          { name: '1 · Respect', value: 'No hate, no insults, no discrimination.' },
          { name: '2 · No spam', value: 'No ads or invites without checking with the team.' },
          { name: '3 · Safety', value: 'Never share passwords, login codes or payment details – not even with the team.' },
          { name: '4 · Right channels', value: 'Clips in <#c_onyx_clips>, teammates in <#c_onyx_lfg>, shop questions in <#c_onyx_support>.' },
          { name: '5 · Every language', value: 'Everyone is welcome – write in the language you like.' },
        ],
        footer: 'Last updated by the Onyx Team',
      },
    ],
    reactions: [r('✅', 214, [ME])],
    pinned: true,
  });

  // #announcements
  post('c_onyx_news', ME, 8000, 'The community is growing faster than expected – thanks to everyone who’s been here from the start! 💚 Squads now have their own voice channels.', {
    reactions: [r('💚', 96, [ME]), r('🔥', 41)],
  });
  post(
    'c_onyx_news',
    ME,
    300,
    '## ONYX 0.1 is here 🎉\nThe first preview of the interface is online. The highlights:\n- **Personalisation is free** – decorations, profile frames, effects, name styles and the Border Line\n- **Collections & codes** – seasonal events and free codes unlock special sets\n- **12 themes, backgrounds and 15 languages**\n- **Custom emojis** work in every server\n\nVoice rooms and calls are included as a preview – the real connection follows in one of the next updates. Feedback welcome in <#c_onyx_general>!',
    {
      attachments: [{ id: 'a_patch', name: 'onyx-0.1.png', size: 482_133, kind: 'image', url: SAMPLE_IMAGES.patchNotes, width: 1200, height: 500 }],
      reactions: [r('🎉', 132, [ME]), r('<:onyx:e_onyx>', 88), r('🔥', 64)],
    },
  );

  // #general
  const g1 = post('c_onyx_general', 'u_zed', 1560, 'gm everyone ☕');
  post('c_onyx_general', 'u_lumi', 1552, 'gm! who’s in tonight?', { reactions: [r('🙋', 3)] });
  post('c_onyx_general', 'u_rio', 1549, "who's online? 👀", { replyToId: g1.id });
  post('c_onyx_general', 'u_team', 1540, 'Welcome to the hub! Have a quick look at <#c_onyx_rules> before you get started. 💚');
  const g5 = post('c_onyx_general', 'u_nova', 1300, 'who’s playing tonight?');
  post('c_onyx_general', 'u_kai', 1298, "I'm in. duos?", { replyToId: g5.id });
  post('c_onyx_general', 'u_nova', 1297, 'sure, 8 pm? I’ll stream on the side');
  post('c_onyx_general', 'u_kai', 1296, 'perfect', { reactions: [r('🤝', 2, ['u_nova'])] });
  const g9 = post(
    'c_onyx_general',
    'u_max',
    1100,
    'Quick question for <@u_me>: is it true that animated avatars and banners are really completely free here? Saw it in the video and could hardly believe it. On other platforms I pay for that every month, and honestly it’s been bugging me for a while that you need a subscription just for a bit of individuality.',
  );
  post(
    'c_onyx_general',
    ME,
    1090,
    'Yes, completely free 🙌 Animated avatars, banners, profile frames and custom emojis are part of the basics on ONYX. If you want to support the project you can voluntarily become a **Supporter** later – but none of it is behind a paywall.',
    { replyToId: g9.id, replyMention: true, reactions: [r('🔥', 12, ['u_max']), r('<:onyx_heart:e_heart>', 9), r('💯', 4)] },
  );
  post('c_onyx_general', 'u_pixel', 1085, 'now that’s a statement <:onyx:e_onyx>');
  post('c_onyx_general', 'u_ayla', 1080, 'my profile frame is already set 😌', { reactions: [r('✨', 5)] });
  post('c_onyx_general', 'u_theo', 240, 'Anyone up for some ranked? I’m Platinum 2 and want to finally hit Diamond today 💎');
  post('c_onyx_general', 'u_emre', 236, '<@u_theo> joining in 10 min, grabbing a quick bite', { editedAt: ago(235) });
  post('c_onyx_general', 'u_lena', 180, 'Quick tip for everyone: in settings under **Appearance** you can switch to *Compact* – a lot more messages fit on the screen.', {
    reactions: [r('👍', 7)],
    pinned: true,
  });
  post('c_onyx_general', 'u_sam', 175, 'oh nice, thanks! didn’t know that');
  post('c_onyx_general', 'u_nova', 120, '<@u_me> could you check <#c_onyx_support>? Someone has a question about their order');
  const g18 = post('c_onyx_general', 'u_yuki', 60, 'Here’s my new setup, finally done 🥹', {
    attachments: [{ id: 'a_setup', name: 'setup-final.png', size: 2_418_220, kind: 'image', url: SAMPLE_IMAGES.setup, width: 1200, height: 800 }],
    reactions: [r('😍', 6), r('🔥', 4), r('<:w:e_w>', 3)],
  });
  post('c_onyx_general', 'u_kai', 58, 'clean!! which keyboard is that?', { replyToId: g18.id });
  post('c_onyx_general', 'u_yuki', 57, 'Custom 65% with linear switches. I’ll DM you the link');
  post('c_onyx_general', 'u_jay', 30, 'in case someone wants to build a bot for this 👀\n```\n/lfg mode:zero-build region:EU slots:2\n```');
  post('c_onyx_general', 'u_noah', 12, 'Season finale yesterday: ||the boss had a second phase|| 😳');
  post('c_onyx_general', 'u_lumi', 5, 'heading to the Lounge, come join 🎧');
  post('c_onyx_general', 'u_rio', 2, 'on my way');

  // #clips-and-highlights
  const c1 = post('c_onyx_clips', 'u_nova', 2900, 'last round yesterday, 12 elims 😤', {
    attachments: [{ id: 'a_victory', name: 'victory-final.png', size: 1_284_009, kind: 'image', url: SAMPLE_IMAGES.victory, width: 1280, height: 720 }],
    reactions: [r('🔥', 9), r('<:crown1:e_crown>', 6), r('😮', 2)],
  });
  post('c_onyx_clips', 'u_kai', 2890, 'that endgame was unreal', { replyToId: c1.id });
  post('c_onyx_clips', 'u_rio', 1400, '1v3 clutch, sorry for the lag at the start', {
    attachments: [{ id: 'a_clip', name: 'clutch_1v3.mp4', size: 38_204_112, kind: 'video', unavailable: true }],
    reactions: [r('😳', 5), r('🔥', 3)],
  });
  post('c_onyx_clips', 'u_emre', 1390, 'how did you still build there without mats 😭');
  post('c_onyx_clips', 'u_ayla', 90, 'the timing at the end 😂 who edited this?', { reactions: [r('😂', 4)] });

  // #looking-for-group
  post('c_onyx_lfg', 'u_theo', 600, '**LF:** 2 people for Zero Build trios · EU · chill 🎮');
  post('c_onyx_lfg', 'u_vex', 590, 'I’m in, add me: **vex**');
  const l3 = post('c_onyx_lfg', 'u_ella', 200, 'Looking for a duo partner for ranked (Gold 3). Mic required 🎧');
  post('c_onyx_lfg', 'u_ben', 30, 'Gold 1 here, feel free to message me', { replyToId: l3.id });

  // #off-topic
  post('c_onyx_offtopic', 'u_zed', 3000, 'What are you listening to while gaming?');
  post('c_onyx_offtopic', 'u_lumi', 2990, 'lo-fi or synthwave, depending on the mood 🌌');
  post('c_onyx_offtopic', 'u_kira', 2980, 'Podcasts lol');
  post('c_onyx_offtopic', 'u_pixel', 2975, 'Chiptunes. Always. No exceptions. 🕹️', { reactions: [r('👾', 3)] });

  // #offers
  post('c_onyx_offers', 'u_team', 4300, '## New in the shop\nFresh offers are online. You’ll find all the details directly in the shop – we’re happy to answer questions in <#c_onyx_support>.', {
    embeds: [
      {
        color: '#10b981',
        provider: 'OnyxServices',
        title: 'OnyxServices – shop for gaming accounts & services',
        description: 'Verified offers, fast support and secure handling. For members of the ONYX Community.',
        image: SAMPLE_IMAGES.shop,
        action: { label: 'Open shop' },
      },
    ],
    reactions: [r('🔥', 23), r('👀', 11)],
  });

  // #support
  post('c_onyx_team', 'u_team', 300, 'Release check for ONYX 0.1: server badges and channel permissions are in. Please test the private channels with “View server as role”. 🧪');
  post('c_onyx_team', 'u_lena', 260, 'Tested as Member – #team-room disappears, #rules is read-only and reactions are off there. Works 👍');
  post('c_onyx_team', 'u_theo', 220, 'I’ll hand out the Halloween Hunt badge tonight.');
  const s1 = post('c_onyx_support', 'u_max', 140, 'Hi! I placed an order earlier and I’m still waiting for the confirmation. Where can I check whether everything went through?');
  post('c_onyx_support', 'u_team', 110, 'Hey Maximilian! Please DM your order number to the team – **never** your password. We’ll check right away. 🙂', { replyToId: s1.id, replyMention: true });

  // Fortnite Scrims
  post('c_scr_news', 'u_scrimbot', 95, '@everyone Scrim today at **8:00 pm** – sign up until 7:30 pm in <#c_scr_lfg>.', {
    embeds: [
      {
        color: '#a78bfa',
        author: 'ScrimBot',
        title: 'Scrim · Zero Build Duos',
        fields: [
          { name: 'Start', value: 'Today, 8:00 pm', inline: true },
          { name: 'Region', value: 'EU', inline: true },
          { name: 'Teams', value: '38 / 50', inline: true },
          { name: 'Format', value: '4 rounds · points for placement and elims' },
        ],
        image: SAMPLE_IMAGES.dropMap,
        footer: 'Drop spots are binding · lobby code 5 min before start',
      },
    ],
    reactions: [r('✅', 38)],
  });
  post(
    'c_scr_rules',
    'u_nova',
    9000,
    '**Scrim rules**\n1. No stream sniping.\n2. Drop spots from the announcement are binding.\n3. Report disconnects right away in <#c_scr_chat>.\n4. Stay fair – we all want to get better. 💜',
  );
  post('c_scr_chat', 'u_nova', 400, 'lobby code goes in here 5 minutes before, as always');
  const sc2 = post('c_scr_chat', 'u_vex', 380, 'how many teams today?');
  post('c_scr_chat', 'u_nova', 378, 'currently 38 of 50', { replyToId: sc2.id });
  post('c_scr_chat', 'u_ella', 300, 'Zero Build or with building?');
  post('c_scr_chat', 'u_nova', 298, 'Zero Build, it’s in the announcement 😉');
  post('c_scr_chat', 'u_kai', 70, 'last week was wild, round 3 decided everything', { reactions: [r('💀', 4)] });
  post('c_scr_lfg', 'u_emre', 160, 'LF duo for today, arena about 3k points <:lfg:e_lfg>');
  post('c_scr_results', 'u_scrimbot', 4400, '', {
    embeds: [
      {
        color: '#fbbf24',
        title: 'Results · Week 41',
        fields: [
          { name: '🥇 nova & kai', value: '42 points · 2 wins', inline: true },
          { name: '🥈 vex & ella', value: '37 points · 1 win', inline: true },
          { name: '🥉 Emre & Ben', value: '31 points', inline: true },
        ],
        footer: 'Next scrim: today, 8:00 pm',
      },
    ],
    reactions: [r('👑', 12), r('<:gg:e_gg>', 9)],
  });

  // Late Night Lobby
  post('c_late_chat', 'u_kai', 200, 'whoever’s still awake: couch voice is open');
  post('c_late_chat', 'u_mira', 195, 'coming in a sec');
  post('c_late_chat', 'u_kai', 190, 'bring snacks 🍿');
  post('c_late_chat', 'u_mira', 30, 'camera’s on so you can finally see my cat 🐱', { reactions: [r('😻', 3)] });
  post('c_late_memes', 'u_kai', 1200, 'every. single. night.', {
    attachments: [{ id: 'a_meme', name: 'just-one-more-round.png', size: 220_410, kind: 'image', url: SAMPLE_IMAGES.meme, width: 800, height: 800 }],
    reactions: [r('😂', 5), r('💀', 3)],
  });

  // Nebelreich SMP
  post('c_smp_welcome', 'u_theo', 6000, 'Welcome to Nebelreich! 🌫️ Server info is in <#c_smp_status>. Build big, build together.');
  post('c_smp_status', 'u_theo', 1440, '', {
    embeds: [
      {
        color: '#22c55e',
        title: 'Server online',
        fields: [
          { name: 'Version', value: '1.21', inline: true },
          { name: 'Players', value: '14 / 50', inline: true },
          { name: 'Next restart', value: 'Daily 5:00 am', inline: true },
        ],
      },
    ],
  });
  post('c_smp_builds', 'u_ben', 500, 'Our river town is growing 🏰 Bridge no. 3 is done!', { reactions: [r('🏰', 4), r('👏', 2)] });

  // Pixel Art Atelier
  post('c_pix_gallery', 'u_lumi', 2000, 'New emoji series for ONYX is done! <:gg:e_gg> <:hype:e_hype> <:w:e_w> <:onyx_heart:e_heart>', { reactions: [r('😍', 4)] });
  post('c_pix_gallery', 'u_ayla', 1990, 'these are so good 🥹');

  // DMs ----------------------------------------------------------------
  post('dm_nova', 'u_nova', 2880, 'yo, have you seen the new update?');
  post('dm_nova', ME, 2875, 'yes! the new banners turned out really nice');
  post('dm_nova', 'u_nova', 2870, 'I picked Synthwave right away 😎');
  post('dm_nova', ME, 1500, 'Do you have time for a test stream tomorrow? I’d love to show how the profiles look');
  post('dm_nova', 'u_nova', 1490, 'sure, from 6 pm works. Should I bring the scrim community?');
  post('dm_nova', ME, 1488, 'absolutely 🙌');
  post('dm_nova', 'u_nova', 90, 'btw yesterday’s clips are online, check <#c_onyx_clips>');
  const n9 = post('dm_nova', 'u_nova', 88, 'and thanks again for the feedback on the banner 💜');
  post('dm_nova', ME, 80, 'anytime! looks amazing', { replyToId: n9.id });
  post('dm_nova', 'u_nova', 15, 'Quick question: can I upload custom emojis for the scrim server without my people having to pay for them?');

  post('dm_mira', 'u_mira', 4320, 'Hey! Thanks for the invite to ONYX 💜');
  post('dm_mira', ME, 4300, 'of course! how do you like it so far?');
  post('dm_mira', 'u_mira', 4290, 'The profiles are really nice. Treated myself to a frame right away – a free treat haha');
  post('dm_mira', 'u_mira', 25, 'Hey, is there a mobile app coming?');
  post('dm_mira', 'u_mira', 24, 'Would love to use ONYX on the go 📱');

  post('dm_kai', 'u_kai', 1440, 'yo, 8 pm duos still on?');
  post('dm_kai', ME, 1435, 'on! nova is streaming on the side');
  post('dm_kai', 'u_kai', 1434, '👍');
  post('dm_kai', 'u_kai', 50, 'yuki sent me the keyboard link, I’ll be broke soon 😭');

  post('dm_squad', ME, 1600, '', { type: 'call', content: '42' });
  post('dm_squad', 'u_rio', 400, 'anyone today?');
  post('dm_squad', 'u_lumi', 395, 'me from 9 pm');
  post('dm_squad', 'u_kai', 390, 'same');
  post('dm_squad', ME, 385, 'I’m in, but only after the stream test');
  post('dm_squad', 'u_rio', 380, 'deal 🤝', { reactions: [r('🤝', 2, ['u_kai', 'u_lumi'])] });

  post('dm_max', 'u_max', 1520, 'Thanks for the quick answer in the server! Really looking forward to the next updates.');
  post('dm_max', ME, 1500, 'My pleasure – let me know if you notice anything 🙂');

  post('dm_zed', 'u_zed', 10080, 'can you send me the invite again?');
  post('dm_zed', ME, 10075, 'sure, I’ll send it via the server invite in a sec 👍');

  /* ---------------------------------------------------------------- */
  /* Read state: everything read, except a few to show unread states   */
  /* ---------------------------------------------------------------- */
  const readState: Record<ID, number> = {};
  [...Object.keys(channels), ...Object.keys(dms)].forEach((id) => (readState[id] = now));
  readState.c_onyx_general = ago(130);
  readState.c_onyx_clips = ago(100);
  readState.c_onyx_news = ago(400);
  readState.c_onyx_support = ago(150);
  readState.c_scr_news = ago(100);
  readState.c_scr_chat = ago(80);
  readState.c_late_chat = ago(40);
  readState.dm_nova = ago(20);
  readState.dm_mira = ago(30);

  /* ---------------------------------------------------------------- */
  /* Relationships                                                     */
  /* ---------------------------------------------------------------- */
  const rel = (userId: ID, type: Relationship['type'], daysAgo: number): Relationship => ({ userId, type, since: now - daysAgo * DAY });
  const relationships = Object.fromEntries(
    [
      rel('u_nova', 'friend', 240),
      rel('u_kai', 'friend', 230),
      rel('u_lumi', 'friend', 160),
      rel('u_rio', 'friend', 150),
      rel('u_zed', 'friend', 260),
      rel('u_mira', 'friend', 110),
      rel('u_theo', 'friend', 190),
      rel('u_ayla', 'friend', 80),
      rel('u_yuki', 'friend', 60),
      rel('u_max', 'friend', 20),
      rel('u_frost', 'incoming', 1),
      rel('u_pixel', 'incoming', 0.2),
      rel('u_jay', 'outgoing', 3),
      rel('u_tim', 'blocked', 6),
    ].map((x) => [x.userId, x]),
  );

  /* ---------------------------------------------------------------- */
  /* Voice: sample people in voice channels (demo – no audio, no video) */
  /* ---------------------------------------------------------------- */
  const vp = (userId: ID, minAgo: number, extra: Partial<VoiceParticipant> = {}): VoiceParticipant => ({ userId, joinedAt: ago(minAgo), ...extra });
  const voice: Record<ID, VoiceParticipant[]> = {
    c_onyx_lounge: [vp('u_lumi', 4), vp('u_nova', 52), vp('u_yuki', 20), vp('u_rio', 1, { muted: true })],
    c_onyx_squad1: [vp('u_theo', 30), vp('u_emre', 26)],
    c_onyx_afk: [vp('u_ben', 140, { muted: true, deafened: true })],
    c_scr_lobby: [vp('u_frost', 60), vp('u_vex', 45), vp('u_ella', 12)],
    c_late_couch: [vp('u_kai', 35), vp('u_mira', 28)],
  };

  return {
    meId: ME,
    users,
    servers,
    serverOrder,
    channels,
    dms,
    messages,
    relationships,
    voice,
    readState,
    notes: { u_nova: 'Test stream tomorrow from 6 pm' },
  };
}
