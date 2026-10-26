/**
 * Lets the backend modules reach the app store without importing it (the store
 * imports them, so a direct import would be circular). store.ts registers
 * itself here when it is created.
 */
import type { Store } from '../store/store';

interface StoreHandle {
  getState: () => Store;
  subscribe: (listener: (state: Store, previous: Store) => void) => () => void;
  /** With the immer middleware the updater may mutate the draft. */
  setState: (updater: (s: Store) => void) => void;
}

let handle: StoreHandle | null = null;

export function registerStore(h: StoreHandle) {
  handle = h;
}

export function store(): StoreHandle {
  if (!handle) throw new Error('store not registered');
  return handle;
}

/** Reload hooks, filled in by sync.ts (keeps the store free of a circular import). */
export const cloudHooks = {
  requestResync: () => {},
  reloadNow: async () => {},
  /** A new message from someone else arrived via Realtime (filled in by the notifier). */
  incomingMessage: (_scopeId: string, _messageId: string) => {},
};
