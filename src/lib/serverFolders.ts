export interface ServerFolder { id: string; name: string; color: string; serverIds: string[] }
export const FOLDER_COLORS = ['#10b981', '#6478ec', '#a855d9', '#e5a342', '#e66d87', '#84949c'];

/** Untrusted persisted preferences never add membership or duplicate/hide a server. */
export function normalizeFolders(value: unknown, ids: readonly string[]): ServerFolder[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(ids), used = new Set<string>(), folderIds = new Set<string>();
  return value.slice(0, 100).flatMap((f): ServerFolder[] => {
    if (!f || typeof f.id !== 'string' || !f.id || f.id.length > 100 || folderIds.has(f.id) || !Array.isArray(f.serverIds)) return [];
    folderIds.add(f.id);
    const serverIds = f.serverIds.filter((id: unknown): id is string => typeof id === 'string' && known.has(id) && !used.has(id) && !!used.add(id));
    if (!serverIds.length) return [];
    return [{ id: f.id, name: typeof f.name === 'string' ? f.name.trim().slice(0, 40) : '', color: FOLDER_COLORS.includes(f.color) ? f.color : FOLDER_COLORS[0], serverIds }];
  });
}

export function moveToFolder(folders: ServerFolder[], serverId: string, folderId: string | null): ServerFolder[] {
  if (folderId && !folders.some(f => f.id === folderId)) return folders;
  return folders.map(f => ({ ...f, serverIds: [...f.serverIds.filter(id => id !== serverId), ...(f.id === folderId ? [serverId] : [])] })).filter(f => f.serverIds.length);
}
