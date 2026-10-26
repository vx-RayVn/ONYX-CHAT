/**
 * Supabase Storage.
 *
 * media (public): avatars, banners, server icons, emojis, server badges. The
 *   database stores "storage:media/<path>"; the app works with the public URL.
 * attachments (private): files and voice messages, shown through short-lived
 *   signed URLs.
 */
import { useEffect, useState } from 'react';
import type { Attachment, AvatarSource, BannerSource } from '../types';
import { CLOUD, SUPABASE_URL } from './config';
import { supabase } from './client';

const STORAGE_PREFIX = 'storage:media/';
const publicPrefix = () => `${SUPABASE_URL}/storage/v1/object/public/media/`;

const isData = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:');

/** Database value → URL the browser can load. */
export function mediaUrl(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  return v.startsWith(STORAGE_PREFIX) ? publicPrefix() + v.slice(STORAGE_PREFIX.length) : v;
}

/** URL in the app → database value (our own public URLs become storage paths). */
export function mediaValue(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.startsWith(publicPrefix()) ? STORAGE_PREFIX + v.slice(publicPrefix().length) : v;
}

type ImageSource = AvatarSource | BannerSource;

export function sourceFromDb<T extends ImageSource | null | undefined>(src: T): T {
  if (!src || src.kind !== 'image') return src;
  return { ...src, src: mediaUrl(src.src) ?? src.src, poster: mediaUrl(src.poster) } as T;
}

export function sourceToDb<T extends ImageSource | null | undefined>(src: T): T {
  if (!src || src.kind !== 'image') return src;
  return { ...src, src: mediaValue(src.src) ?? src.src, poster: mediaValue(src.poster) ?? undefined } as T;
}

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/avif': 'avif' };

/** Uploads a data URL to media/<folder>/… and returns its public URL; other values stay as they are. */
export async function uploadMedia(value: string | undefined, folder: string): Promise<string | undefined> {
  if (!isData(value)) return value;
  const blob = await (await fetch(value)).blob();
  const path = `${folder}/${crypto.randomUUID()}.${EXT[blob.type] ?? 'img'}`;
  const { error } = await supabase().storage.from('media').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return publicPrefix() + path;
}

/**
 * Uploads every data URL in a database row (avatar, banner, icon, image) and
 * converts the values to storage paths. `onUploaded` receives the row with
 * public URLs, so the app can drop the large data URLs from memory.
 */
export async function uploadRowImages(row: Record<string, unknown>, folder: string, onUploaded?: (withUrls: Record<string, unknown>) => void) {
  const out = { ...row };
  let uploaded = false;
  for (const key of ['avatar', 'banner']) {
    const v = out[key] as ImageSource | null | undefined;
    if (v && v.kind === 'image' && (isData(v.src) || isData(v.poster))) {
      out[key] = { ...v, src: await uploadMedia(v.src, folder), poster: await uploadMedia(v.poster, folder) };
      uploaded = true;
    }
  }
  for (const key of ['icon', 'image']) {
    if (isData(out[key])) {
      out[key] = await uploadMedia(out[key] as string, folder);
      uploaded = true;
    }
  }
  if (uploaded) onUploaded?.({ ...out });
  for (const key of ['avatar', 'banner']) if (key in out) out[key] = sourceToDb(out[key] as ImageSource | null);
  for (const key of ['icon', 'image']) if (key in out) out[key] = mediaValue(out[key] as string | null);
  return out;
}

/* ---------------------------------------------------------------- */
/* Attachments                                                        */
/* ---------------------------------------------------------------- */

/** Original files of pending attachments (videos, documents) until they are uploaded. */
const pendingBlobs = new Map<string, Blob>();

export function rememberBlob(attachmentId: string, blob: Blob) {
  pendingBlobs.set(attachmentId, blob);
}

export function takeBlob(attachmentId: string) {
  const blob = pendingBlobs.get(attachmentId);
  pendingBlobs.delete(attachmentId);
  return blob;
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';

export function attachmentPath(scope: 'channels' | 'dms', scopeId: string, messageId: string, a: Attachment) {
  return `${scope}/${scopeId}/${messageId}/${a.id}-${safeName(a.name)}`;
}

export async function uploadAttachment(path: string, blob: Blob, mime?: string) {
  const { error } = await supabase()
    .storage.from('attachments')
    .upload(path, blob, { contentType: mime || blob.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
}

export async function removeAttachments(paths: string[]) {
  if (paths.length) await supabase().storage.from('attachments').remove(paths);
}

const signed = new Map<string, { url: string; expires: number }>();
const SIGNED_SECONDS = 6 * 60 * 60;

/** Signed URL for a private attachment (cached until shortly before it expires). */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = signed.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase().storage.from('attachments').createSignedUrl(path, SIGNED_SECONDS);
  if (error || !data) return null;
  signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_SECONDS * 1000 });
  return data.signedUrl;
}

/** A download link that saves the file under its original name. */
export async function downloadUrl(path: string, name: string): Promise<string | null> {
  const { data, error } = await supabase().storage.from('attachments').createSignedUrl(path, 300, { download: name });
  return error || !data ? null : data.signedUrl;
}

/**
 * URL to show an attachment: the local preview while it exists, otherwise a
 * signed URL from Storage. undefined while loading, null when unavailable.
 */
export function useAttachmentUrl(a: Pick<Attachment, 'url' | 'path'>): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(a.url ?? (CLOUD && a.path ? signed.get(a.path)?.url : undefined));
  useEffect(() => {
    if (a.url) return setUrl(a.url);
    if (!CLOUD || !a.path) return setUrl(null);
    let alive = true;
    void signedUrl(a.path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [a.url, a.path]);
  return url;
}
