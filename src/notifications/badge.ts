/**
 * Unread count in the tab: "(3) ONYX" as title and a red badge on the tab icon
 * (a small dot when there is something unread but no mention).
 */
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/store';
import { unreadTotals } from '../store/selectors';
import { BRAND, BRAND_IMAGES } from '../config/brand';

let base: Promise<HTMLImageElement | null> | null = null;
let originals: Map<HTMLLinkElement, string> | null = null;
let drawn = '';

function baseIcon() {
  base ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = BRAND_IMAGES.favicon;
  });
  return base;
}

function iconLinks() {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
  originals ??= new Map(links.map((l) => [l, l.href]));
  return links;
}

async function drawFavicon(count: number, dot: boolean) {
  const key = count ? `n${count}` : dot ? 'dot' : '';
  if (key === drawn) return;
  drawn = key;
  const links = iconLinks();
  if (!key) {
    links.forEach((l) => (l.href = originals?.get(l) ?? l.href));
    return;
  }
  const img = await baseIcon();
  if (drawn !== key) return;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return;
  if (img) g.drawImage(img, 0, 0, size, size);
  const css = getComputedStyle(document.documentElement);
  const red = css.getPropertyValue('--danger').trim() || '#ef4b5f';
  const ring = '#07090b';
  if (count) {
    const label = count > 9 ? '9+' : String(count);
    const r = 19;
    const cx = size - r;
    const cy = size - r;
    g.fillStyle = ring;
    g.beginPath();
    g.arc(cx, cy, r + 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = red;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `800 ${label.length > 1 ? 21 : 26}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, cx, cy + 1.5);
  } else {
    const r = 10;
    g.fillStyle = ring;
    g.beginPath();
    g.arc(size - r - 2, size - r - 2, r + 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(size - r - 2, size - r - 2, r, 0, Math.PI * 2);
    g.fill();
  }
  const url = canvas.toDataURL('image/png');
  links.forEach((l) => (l.href = url));
}

/** Keeps the tab title and icon in sync with the unread state (used by the app shell). */
export function useTabBadge() {
  const enabled = useStore((s) => s.settings.notifyTabBadge);
  const { mentions, unread } = useStore(useShallow((s) => (enabled ? unreadTotals(s) : { mentions: 0, unread: false })));
  useEffect(() => {
    document.title = mentions > 0 ? `(${mentions > 99 ? '99+' : mentions}) ${BRAND.name}` : BRAND.name;
    void drawFavicon(mentions, unread);
  }, [mentions, unread]);
  useEffect(
    () => () => {
      document.title = BRAND.name;
      void drawFavicon(0, false);
    },
    [],
  );
}
