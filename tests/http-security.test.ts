import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHandler } from '../server-handler.js';

test('public pages, app, errors and health consistently disallow hostile framing', async () => {
  assert.match(await readFile('public/.htaccess','utf8'),/<IfModule mod_headers\.c>[\s\S]*Header always set Strict-Transport-Security "max-age=31536000"/);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'onyx-http-security-'));
  try {
    await writeFile(path.join(directory, 'index.html'), '<html>Public</html>');
    const handler = await createHandler({ directory, config: { url: 'https://your-project.supabase.co', key: 'sb_publishable_synthetic' } });
    for (const url of ['/', '/app/', '/_onyx/health', '/missing.css', '/%E0%A4%A']) {
      const headers: Record<string, string> = {};
      const res = { setHeader: (k: string, v: string) => { headers[k] = v; }, writeHead: (_status: number, values = {}) => { Object.assign(headers, values); return res; }, end: () => {} };
      await handler({ url, method: 'GET' }, res);
      assert.equal(headers['X-Frame-Options'], 'DENY', url);
      assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/, url);
      assert.match(headers['Content-Security-Policy'], /base-uri 'self'/, url);
      assert.match(headers['Content-Security-Policy'], /object-src 'none'/, url);
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
    }
  } finally {
    assert.ok(path.basename(directory).startsWith('onyx-http-security-'));
    await rm(directory, { recursive: true, force: true });
  }
});
