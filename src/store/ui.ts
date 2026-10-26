/**
 * Transient UI state (never persisted): open dialogs, settings overlay,
 * reply/edit targets, toasts and mobile navigation.
 */
import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { Attachment, ChannelType, ID } from '../types';
import { uid } from '../lib/utils';
import type { ScreenCaptureIssue } from '../voice/screenCapture';
import {store as appStore} from '../backend/bridge';
import { FEATURES } from '../config/features';

export type UserSettingsSection =
  'bugs' | 'bug-inbox' | 'badge-admin' | 'developer' | 'account' | 'profile' | 'badges' | 'redeem' | 'privacy' | 'connections' | 'plus' | 'appearance' | 'language' | 'accessibility' | 'voice' | 'notifications' | 'keybinds' | 'whatsnew' | 'demo' | 'admin';

export type ServerSettingsSection = 'overview' | 'discover' | 'promote' | 'roles' | 'emojis' | 'badges' | 'channels' | 'members' | 'bans' | 'invites' | 'danger';
export type ChannelSettingsSection = 'overview' | 'permissions' | 'danger';
export type CategorySettingsSection = 'overview' | 'permissions';

export type SettingsState =
  | { kind: 'user'; section: UserSettingsSection; tab?: string }
  | { kind: 'server'; serverId: ID; section: ServerSettingsSection; roleId?: ID }
  | { kind: 'channel'; channelId: ID; section: ChannelSettingsSection }
  | { kind: 'category'; serverId: ID; categoryId: ID; section: CategorySettingsSection };

export type ModalState =
  | {type:'accountSwitcher'}
  | {type:'guestUpgrade';reason?:'profile'|'general';mode?:'register'|'signin'}
  | { type: 'createServer'; step?: 'start' | 'join' }
  | { type: 'createChannel'; serverId: ID; categoryId: ID | null; channelType?: ChannelType }
  | { type: 'createCategory'; serverId: ID }
  | { type: 'invite'; serverId: ID; channelId?: ID }
  | { type: 'confirm'; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void }
  | { type: 'prompt'; title: string; label: string; initial: string; confirmLabel?: string; placeholder?: string; maxLength?: number; onSubmit: (value: string) => void }
  | { type: 'newDM'; addTo?: ID }
  | { type: 'profile'; userId: ID; serverId?: ID }
  | { type: 'quickSwitcher' }
  | { type: 'lightbox'; src: string; name: string }
  | { type: 'customStatus' }
  | { type: 'preview'; title: string; body: string; icon?: 'voice' | 'link' | 'shop' | 'auth' | 'upload' }
  | { type: 'crop'; kind: 'avatar' | 'banner'; src: string; poster?: string; animated?: boolean }
  | { type: 'plusCheckout' }
  | { type: 'ban'; serverId: ID; userId: ID }
  | { type: 'report'; target: { kind: 'message'; channelId: ID; messageId: ID } | { kind: 'user'; userId: ID } }
  | { type: 'suspend'; userId: ID; onDone?: () => void }
  | { type: 'deleteAccount' }
  | { type: 'invitePreview'; code: string }
  | { type: 'screenShareHelp'; issue: ScreenCaptureIssue };

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone?: 'default' | 'success' | 'danger' | 'info';
}

interface UIState {
  modal: ModalState | null;
  settings: SettingsState | null;
  replyTo: { channelId: ID; messageId: ID; mention: boolean } | null;
  editing: { channelId: ID; messageId: ID } | null;
  highlight: ID | null;
  toasts: Toast[];
  mobilePanel: 'nav' | 'main';
  mobileMembers: boolean;
  search: { scope: ID; query: string } | null;
  pending: Record<ID, Attachment[]>;
  addPending: (channelId: ID, atts: Attachment[]) => void;
  removePending: (channelId: ID, id: ID) => void;
  clearPending: (channelId: ID) => void;
  insertRequest: { channelId: ID; text: string; nonce: number } | null;
  requestInsert: (channelId: ID, text: string) => void;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  openSettings: (s: SettingsState) => void;
  closeSettings: () => void;
  setReplyTo: (r: UIState['replyTo']) => void;
  setEditing: (e: UIState['editing']) => void;
  flash: (messageId: ID) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setMobilePanel: (p: 'nav' | 'main') => void;
  setMobileMembers: (open: boolean) => void;
  setSearch: (s: UIState['search']) => void;
}

export const useUI = create<UIState>()((set) => ({
  modal: null,
  settings: null,
  replyTo: null,
  editing: null,
  highlight: null,
  toasts: [],
  mobilePanel: 'main',
  mobileMembers: false,
  search: null,
  pending: {},
  addPending: (channelId, atts) => set((s) => ({ pending: { ...s.pending, [channelId]: [...(s.pending[channelId] ?? []), ...atts].slice(0, 10) } })),
  removePending: (channelId, id) => set((s) => ({ pending: { ...s.pending, [channelId]: (s.pending[channelId] ?? []).filter((a) => a.id !== id) } })),
  clearPending: (channelId) => set((s) => ({ pending: { ...s.pending, [channelId]: [] } })),
  insertRequest: null,
  requestInsert: (channelId, text) => set({ insertRequest: { channelId, text, nonce: Date.now() } }),
  openModal: (modal) => {if(!FEATURES.onyxPlus&&modal.type==='plusCheckout')return;set({ modal:guestActor()&&['accountSwitcher','createChannel','createCategory','invite','newDM','prompt','customStatus','crop','plusCheckout','ban','suspend','deleteAccount'].includes(modal.type)?{type:'guestUpgrade',reason:modal.type==='customStatus'||modal.type==='crop'?'profile':'general'}:modal });},
  closeModal: () => set({ modal: null }),
  openSettings: (settings) => guestActor()&&(settings.kind!=='user'||!['voice','language','accessibility'].includes(settings.section))?set({modal:{type:'guestUpgrade',reason:settings.kind==='user'&&['profile','account','badges'].includes(settings.section)?'profile':'general'}}):set({ settings, modal: null }),
  closeSettings: () => set({ settings: null }),
  setReplyTo: (replyTo) => set({ replyTo, editing: null }),
  setEditing: (editing) => set({ editing }),
  flash: (highlight) => {
    set({ highlight });
    window.setTimeout(() => set((s) => (s.highlight === highlight ? { highlight: null } : s)), 1800);
  },
  pushToast: (t) => {
    const id = uid('t');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  setMobileMembers: (mobileMembers) => set({ mobileMembers }),
  setSearch: (search) => set({ search }),
}));

export const toast = (t: Omit<Toast, 'id'>) => useUI.getState().pushToast(t);
export function guestActor(){try{const s=appStore().getState();return !!s.users[s.meId]?.guest;}catch{return false;}}
export function requireAccount(reason:'profile'|'general'='general'){if(!guestActor())return false;useUI.getState().openModal({type:'guestUpgrade',reason});return true;}

/** Explain a feature that exists only as a preview in this phase. */
export const previewNotice = (title: string, body: string, icon?: Extract<ModalState, { type: 'preview' }>['icon']) => useUI.getState().openModal({ type: 'preview', title, body, icon });

/** On phones only one pane is visible; sidebar items call this to reveal the content. */
export const showMainPane = () => useUI.getState().setMobilePanel('main');
export const showNavPane = () => useUI.getState().setMobilePanel('nav');
