/** Coalesced, bounded catch-up. A Broadcast only marks scopes dirty. */
export interface SyncScope { id: string; dm: boolean; server?: string }
export interface SyncRequest { id: string; dm: boolean; cursor: string | null }
export interface SyncReply { id: string; dm: boolean; allowed: boolean; cursor?: string; more?: boolean; reset?: boolean }
interface PumpOptions<T> {
  fetch: (batch: SyncRequest[], signal: AbortSignal) => Promise<T[]>;
  apply: (rows: T[]) => Promise<void>;
  idle?: () => Promise<void>;
  error?: (error: unknown) => void;
  delay?: number;
}
export class DeltaPump<T extends SyncReply> {
  private scopes = new Map<string, SyncScope>();
  private cursors = new Map<string, string>();
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller = new AbortController();
  private running = false;
  private closed = false;
  private revision = 0;
  private retry = 250;
  private options: PumpOptions<T>;
  constructor(options: PumpOptions<T>) { this.options = options; }
  update(scopes: SyncScope[]) {
    if (this.closed) return;
    const next = new Map(scopes.map(s => [s.id, s]));
    this.revision++;
    for (const id of this.scopes.keys()) if (!next.has(id)) { this.cursors.delete(id); this.dirty.delete(id); }
    for (const id of next.keys()) if (!this.scopes.has(id)) this.dirty.add(id);
    this.scopes = next;
    this.schedule();
  }
  wake(server?: string) {
    if (this.closed) return;
    for (const s of this.scopes.values()) if (server === undefined || (server === 'inbox' ? s.dm : s.server === server)) this.dirty.add(s.id);
    this.schedule();
  }
  private schedule(delay = this.options.delay ?? 80) {
    if (this.closed || this.running || this.timer || !this.dirty.size) return;
    this.timer = setTimeout(() => { this.timer = null; void this.drain(); }, delay);
  }
  private async drain() {
    if (this.closed || this.running) return;
    this.running = true;
    const ids = [...this.dirty].slice(0, 20);
    const revision = this.revision;
    ids.forEach(id => this.dirty.delete(id));
    try {
      await this.options.idle?.();
      if (this.closed) return;
      const request = ids.flatMap(id => { const s = this.scopes.get(id); return s ? [{ id, dm: s.dm, cursor: this.cursors.get(id) ?? null }] : []; });
      const rows = await this.options.fetch(request, this.controller.signal);
      if (this.closed) return;
      if (revision !== this.revision) throw new Error('Message scopes changed during sync');
      // A partial/malformed response must never silently advance or lose a scope.
      const got = new Map(rows.map(r => [r.id, r]));
      if (request.some(s => { const r = got.get(s.id); return !r || r.dm !== s.dm || (r.allowed && !/^[0-9]+$/.test(r.cursor ?? '')); })) throw new Error('Incomplete message sync');
      await this.options.idle?.();
      if (this.closed) return;
      const active = rows.filter(r => this.scopes.get(r.id)?.dm === r.dm);
      await this.options.apply(active);
      if (this.closed) return;
      if (revision !== this.revision) throw new Error('Message scopes changed during apply');
      for (const r of active) {
        if (r.allowed && r.cursor) this.cursors.set(r.id, r.cursor);
        if (r.more) this.dirty.add(r.id);
      }
      this.retry = 250;
    } catch (error) {
      if (!this.closed) {
        ids.forEach(id => { if (this.scopes.has(id)) this.dirty.add(id); });
        this.options.error?.(error);
        this.retry = Math.min(this.retry * 2, 30_000);
      }
    } finally {
      this.running = false;
      this.schedule(this.retry === 250 ? (this.options.delay ?? 80) : this.retry);
    }
  }
  close() {
    this.closed = true; this.controller.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.dirty.clear(); this.cursors.clear(); this.scopes.clear();
  }
}
