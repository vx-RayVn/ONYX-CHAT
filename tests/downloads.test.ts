import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHandler } from '../server-handler.js';
import { renderPage } from '../website/render.mjs';
import { siteConfig } from '../website/config.mjs';

async function fixture(run: (base: string, bytes: Buffer) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'onyx-download-test-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('onyx-download-test-'));
  const bytes = Buffer.from('MZ synthetic installer bytes: 0123456789');
  await mkdir(path.join(directory, 'downloads'));
  await writeFile(path.join(directory, 'index.html'), '<html>Website</html>');
  await writeFile(path.join(directory, 'app.html'), '<html>App</html>');
  await writeFile(path.join(directory, 'style.css'), '.message::after{content:"Grüße — 日本語"}');
  await writeFile(path.join(directory, 'downloads/setup.exe'), bytes);
  await writeFile(path.join(directory, 'downloads/large.zip'), Buffer.alloc(4 * 1024 * 1024));
  const handler = await createHandler({ directory, config: { url: 'https://your-project.supabase.co', key: 'sb_publishable_download_fixture' }, fetcher: () => { throw Error('No network in fixture'); } });
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`, bytes); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
}

test('Windows download is an attachment with exact bytes; HEAD is empty and a missing file is a real 404', async () => {
  await fixture(async (base, bytes) => {
    const response = await fetch(base + '/downloads/setup.exe');
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/octet-stream');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="setup.exe"');
    assert.equal(response.headers.get('content-length'), String(bytes.length)); assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const head = await fetch(base + '/downloads/setup.exe', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(bytes.length)); assert.equal((await head.arrayBuffer()).byteLength, 0);
    const missing = await fetch(base + '/downloads/missing.exe');
    assert.equal(missing.status, 404); assert.equal(await missing.text(), 'Download unavailable');
  });
});

test('download resumes exact ranges and refuses malformed ranges without combining changed versions', async () => {
  await fixture(async (base, bytes) => {
    for (const [range, start, end] of [['bytes=2-7', 2, 7], ['bytes=8-', 8, bytes.length - 1], ['bytes=-4', bytes.length - 4, bytes.length - 1], ['bytes=2-999999', 2, bytes.length - 1]] as const) {
      const response = await fetch(base + '/downloads/setup.exe', { headers: { Range: range } });
      assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
    }
    for (const range of ['bytes=9999-', 'bytes=8-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'items=1-2']) {
      const response = await fetch(base + '/downloads/setup.exe', { headers: { Range: range } });
      assert.equal(response.status, 416, range); assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`); assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
    const current = await fetch(base + '/downloads/setup.exe', { method: 'HEAD' });
    const resume = await fetch(base + '/downloads/setup.exe', { headers: { Range: 'bytes=4-6', 'If-Range': current.headers.get('last-modified')! } });
    assert.equal(resume.status, 206); assert.deepEqual(Buffer.from(await resume.arrayBuffer()), bytes.subarray(4, 7));
    const changed = await fetch(base + '/downloads/setup.exe', { headers: { Range: 'bytes=4-6', 'If-Range': 'Wed, 01 Jan 2020 00:00:00 GMT' } });
    assert.equal(changed.status, 200); assert.deepEqual(Buffer.from(await changed.arrayBuffer()), bytes);
    await new Promise<void>((resolve, reject) => { const request = get(base + '/downloads/large.zip', response => { response.once('data', () => { response.destroy(); resolve(); }); }); request.on('error', reject); });
    assert.equal((await fetch(base + '/_onyx/health')).status, 200);
  });
});

test('static assets advertise their complete UTF-8 byte length for GET and HEAD', async () => {
  await fixture(async (base) => {
    const expected = Buffer.from('.message::after{content:"Grüße — 日本語"}');
    const response = await fetch(base + '/style.css');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), String(expected.byteLength));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    const head = await fetch(base + '/style.css', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(expected.byteLength));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  });
});

test('download page links the real Windows preview and omits unavailable operating systems', () => {
  const html = renderPage('download');
  if (siteConfig.desktopDownloads?.windows) {
    assert.match(html, /href="\/downloads\/ONYX-Desktop-Windows-0\.1-Setup\.exe" download/);
    assert.match(html, /Download for Windows/); assert.match(html, /unsigned preview/i);
  } else assert.doesNotMatch(html, /href="\/downloads\//);
  assert.doesNotMatch(html, /macOS|Linux|Desktop app · At launch|full ONYX desktop app/);
  assert.match(html, /ONYX in your browser/);
  assert.doesNotMatch(html, /ONYX-Activity-Windows\.zip|Download companion|Your games\. On your profile\./);
});
