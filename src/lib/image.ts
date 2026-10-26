import { t } from '../i18n';
/**
 * Local file handling for the demo. Images are downscaled and stored as data
 * URLs so they survive a reload; other files keep only their metadata until a
 * storage backend exists.
 */
import type { Attachment } from '../types';
import { BRAND } from '../config/brand';
import { uid } from './utils';
import { audioFileToAttachment } from './audio';
import { CLOUD } from '../backend/config';
import { rememberBlob } from '../backend/media';

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawScaled(src: string, maxDim: number, type = 'image/webp', quality = 0.86, square = false) {
  const img = await loadImage(src);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = w;
  let sh = h;
  if (square) {
    const side = Math.min(w, h);
    sx = (w - side) / 2;
    sy = (h - side) / 2;
    sw = sh = side;
    w = h = side;
  }
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  return { url: canvas.toDataURL(type, quality), width: cw, height: ch };
}

export class UploadError extends Error {}

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.size > BRAND.uploadLimitMb * 1024 * 1024) throw new UploadError(t('“{name}” is larger than {size} MB.', { name: file.name, size: BRAND.uploadLimitMb }));
  const base = { id: uid('a_'), name: file.name, size: file.size };
  if (file.type.startsWith('image/')) {
    const raw = await readAsDataURL(file);
    if (file.type === 'image/gif' && file.size <= 2.5 * 1024 * 1024) {
      const img = await loadImage(raw);
      return { ...base, kind: 'image', url: raw, width: img.naturalWidth, height: img.naturalHeight };
    }
    const scaled = await drawScaled(raw, 1600, 'image/webp', 0.85);
    return { ...base, kind: 'image', ...scaled };
  }
  // Audio files are stored for real (IndexedDB) and get a player.
  if (file.type.startsWith('audio/') || /.(mp3|m4a|aac|wav|ogg|oga|opus|weba|flac)$/i.test(file.name)) {
    try {
      return await audioFileToAttachment(file);
    } catch {
      if (CLOUD) {
        rememberBlob(base.id, file);
        return { ...base, kind: 'file', mime: file.type || undefined };
      }
      return { ...base, kind: 'audio', unavailable: true };
    }
  }
  const kind = file.type.startsWith('video/') ? 'video' : 'file';
  // Cloud mode uploads the original file when the message is sent.
  if (CLOUD) {
    rememberBlob(base.id, file);
    return { ...base, kind, mime: file.type || undefined };
  }
  return { ...base, kind, unavailable: true };
}

/**
 * Prepares an avatar or banner. Animated GIFs stay animated (that's the point:
 * free animated profiles) and get a static poster for "animate on hover".
 */
/** Cloud mode: images go to Supabase Storage (bucket "media", 10 MB per file). */
const CLOUD_IMAGE_LIMIT_KB = { avatar: 9500, banner: 9500, emoji: 2000, icon: 9500 } as const;

export async function prepareProfileImage(file: File, kind: 'avatar' | 'banner' | 'emoji' | 'icon') {
  const result = await prepareProfileImageRaw(file, kind);
  const size = Math.round((result.src.length + (result.poster?.length ?? 0)) / 1024);
  if (CLOUD && size > CLOUD_IMAGE_LIMIT_KB[kind]) {
    throw new UploadError(t('“{name}” is larger than {size} MB.', { name: file.name, size: Math.round(CLOUD_IMAGE_LIMIT_KB[kind] / 1000) }));
  }
  return result;
}

async function prepareProfileImageRaw(file: File, kind: 'avatar' | 'banner' | 'emoji' | 'icon') {
  if (!file.type.startsWith('image/')) throw new UploadError(t('Please choose an image file (PNG, JPG, WebP or GIF).'));
  const maxDim = kind === 'banner' ? 1200 : kind === 'emoji' ? 128 : 512;
  const raw = await readAsDataURL(file);
  if (file.type === 'image/gif') {
    if (file.size > 4 * 1024 * 1024) throw new UploadError(t('Animated GIFs can be at most 4 MB in the local demo.'));
    const poster = await drawScaled(raw, maxDim, 'image/webp', 0.85, kind !== 'banner');
    return { src: raw, poster: poster.url, animated: true };
  }
  const scaled = await drawScaled(raw, maxDim, 'image/webp', 0.88, kind === 'avatar' || kind === 'icon' || kind === 'emoji');
  return { src: scaled.url, animated: false as const, poster: undefined };
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}
