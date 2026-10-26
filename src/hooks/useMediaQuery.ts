import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const MOBILE_QUERY = '(max-width: 767px), (max-width: 1100px) and (pointer: coarse)';
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
