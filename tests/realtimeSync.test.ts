import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeltaPump, type SyncRequest, type SyncReply } from '../src/backend/deltaPump.ts';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn: () => boolean) { const end = Date.now() + 3000; while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await sleep(5); } }
const scope = (id: string, server = 'server') => ({ id, dm: false, server });
const reply = (s: SyncRequest, cursor = '1', more = false): SyncReply => ({ id: s.id, dm: s.dm, allowed: true, cursor, more });
test('coalesces bursts and caps each network batch at twenty scopes', async () => {
 const calls: SyncRequest[][] = [], applied: string[] = [];
 const pump = new DeltaPump({ delay: 0, fetch: async batch => { calls.push(batch); return batch.map(s => reply(s)); }, apply: async rows => { applied.push(...rows.map(r => r.id)); } });
 try { pump.update(Array.from({ length: 53 }, (_, i) => scope(String(i)))); for (let i = 0; i < 1000; i++) pump.wake(); await until(() => applied.length === 53); assert.equal(calls.length, 3); assert.ok(calls.every(c => c.length <= 20)); } finally { pump.close(); }
});
test('an invalidation during an in-flight request causes another catch-up', async () => {
 let release: (() => void) | undefined, count = 0, applied = 0;
 const pump = new DeltaPump({ delay: 0, fetch: async batch => { count++; if (count === 1) await new Promise<void>(r => release = r); return batch.map(s => reply(s, String(count))); }, apply: async () => { applied++; } });
 try { pump.update([scope('a')]); await until(() => !!release); pump.wake(); release!(); await until(() => applied === 2); assert.equal(count, 2); } finally { pump.close(); }
});
test('drains all backlog pages without another Broadcast', async () => {
 const cursors: (string | null)[] = []; let last = '';
 const pump = new DeltaPump({ delay: 0, fetch: async batch => batch.map(s => { cursors.push(s.cursor); const n = Number(s.cursor ?? 0) + 200; return reply(s, String(n), n < 600); }), apply: async rows => { last = rows[0].cursor!; } });
 try { pump.update([scope('a')]); await until(() => last === '600'); assert.deepEqual(cursors, [null, '200', '400']); } finally { pump.close(); }
});
test('only the affected server or inbox becomes dirty', async () => {
 const calls: string[][] = [];
 const pump = new DeltaPump({ delay: 0, fetch: async batch => { calls.push(batch.map(s => s.id)); return batch.map(s => reply(s)); }, apply: async () => {} });
 try { pump.update([scope('a', 'one'), scope('b', 'two'), { id: 'dm', dm: true }]); await until(() => calls.length === 1); await sleep(10); pump.wake('two'); await until(() => calls.length === 2); pump.wake('inbox'); await until(() => calls.length === 3); assert.deepEqual(calls.slice(1), [['b'], ['dm']]); } finally { pump.close(); }
});
test('logout aborts the request and never applies its late result', async () => {
 let release: (() => void) | undefined, applied = 0, signal: AbortSignal | undefined;
 const pump = new DeltaPump({ delay: 0, fetch: async (batch, s) => { signal = s; await new Promise<void>(r => release = r); return batch.map(v => reply(v)); }, apply: async () => { applied++; } });
 pump.update([scope('a')]); await until(() => !!release); pump.close(); release!(); await sleep(20); assert.equal(signal?.aborted, true); assert.equal(applied, 0);
});
test('a failed request retries without advancing its cursor', async () => {
 const cursors: (string | null)[] = []; let applied = 0;
 const pump = new DeltaPump({ delay: 0, fetch: async batch => { cursors.push(batch[0].cursor); if (cursors.length === 1) throw Error('Network down'); return batch.map(s => reply(s)); }, apply: async () => { applied++; } });
 try { pump.update([scope('a')]); await until(() => applied === 1); assert.deepEqual(cursors, [null, null]); } finally { pump.close(); }
});
test('a partial response retries the entire batch rather than dropping a chat', async () => {
 let count = 0, applied = 0;
 const pump = new DeltaPump({ delay: 0, fetch: async batch => { count++; return (count === 1 ? batch.slice(0, 1) : batch).map(s => reply(s)); }, apply: async rows => { applied += rows.length; } });
 try { pump.update([scope('a'), scope('b')]); await until(() => applied === 2); assert.equal(count, 2); } finally { pump.close(); }
});
test('waits for optimistic writes before fetching and applying', async () => {
 let release: (() => void) | undefined, calls = 0, applied = 0;
 const gate = new Promise<void>(r => release = r);
 const pump = new DeltaPump({ delay: 0, idle: () => gate, fetch: async batch => { calls++; return batch.map(s => reply(s)); }, apply: async () => { applied++; } });
 try { pump.update([scope('a')]); await sleep(20); assert.equal(calls, 0); release!(); await until(() => applied === 1); } finally { pump.close(); }
});
test('removed and re-added scopes cannot reuse an in-flight snapshot', async () => {
 let release: (() => void) | undefined, calls = 0; const applied: string[] = [];
 const pump = new DeltaPump({ delay: 0, fetch: async batch => { calls++; if (calls === 1) await new Promise<void>(r => release = r); return batch.map(s => reply(s, String(calls))); }, apply: async rows => { applied.push(rows[0].cursor!); } });
 try { pump.update([scope('a')]); await until(() => !!release); pump.update([]); pump.update([scope('a')]); release!(); await until(() => applied.length > 0); assert.deepEqual(applied, ['2']); } finally { pump.close(); }
});
test('revision strings retain bigint precision', async () => {
 const cursors: (string | null)[] = []; let applied = 0;
 const pump = new DeltaPump({ delay: 0, fetch: async batch => { cursors.push(batch[0].cursor); return batch.map(s => reply(s, '9007199254740993')); }, apply: async () => { applied++; } });
 try { pump.update([scope('a')]); await until(() => applied === 1); pump.wake(); await until(() => applied === 2); assert.equal(cursors[1], '9007199254740993'); } finally { pump.close(); }
});
