/**
 * The ONYX service worker (public/sw.js): shows popups, handles clicks on
 * them and receives Web Push. Registered only once notifications are used.
 */

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

export const serviceWorkerSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && window.isSecureContext;

/** Registers public/sw.js once. Without service workers (or on http) popups fall back to `new Notification`. */
export function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkerSupported()) return Promise.resolve(null);
  registration ??= navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((reg) => Promise.race([navigator.serviceWorker.ready, new Promise<ServiceWorkerRegistration>((resolve) => setTimeout(() => resolve(reg), 4000))]))
    .catch((e) => {
      console.warn('[onyx] service worker unavailable', e);
      return null;
    });
  return registration;
}

/** The registration if it was already started in this tab (never registers on its own). */
export function registeredWorker(): Promise<ServiceWorkerRegistration | null> {
  return registration ?? Promise.resolve(null);
}
