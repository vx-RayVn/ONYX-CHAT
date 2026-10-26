import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildThirdPartyNotices } from '../scripts/licenses.mjs';

test('license generation includes transitive runtime copyright and NOTICE, excludes dev packages and stays deterministic', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onyx-license-'));
  try {
    await mkdir(path.join(root, 'licenses'), { recursive: true });
    await writeFile(path.join(root, 'licenses/additional-notices.txt'), 'Font/emoji attribution\n');
    await writeFile(path.join(root, 'licenses/supplements.json'), '{}');
    await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { '': {}, 'node_modules/runtime': { version: '1.0.0', license: 'Apache-2.0' }, 'node_modules/dev-only': { version: '1.0.0', dev: true } } }));
    await mkdir(path.join(root, 'node_modules/runtime'), { recursive: true });
    await writeFile(path.join(root, 'node_modules/runtime/package.json'), JSON.stringify({ name: 'runtime', version: '1.0.0' }));
    await writeFile(path.join(root, 'node_modules/runtime/LICENSE'), 'Apache License — synthetic full text');
    await writeFile(path.join(root, 'node_modules/runtime/NOTICE'), 'Copyright Synthetic Author');
    const a = await buildThirdPartyNotices({ root }), b = await buildThirdPartyNotices({ root });
    assert.equal(a.text, b.text);
    assert.match(a.text, /Copyright Synthetic Author/);
    assert.match(a.text, /Apache License — synthetic full text/);
    assert.doesNotMatch(a.text, /dev-only/);
    assert.equal(a.dependencies.length, 1);
    const manifest = JSON.parse(await readFile(path.join(root, 'public/THIRD-PARTY-DEPENDENCIES.json'), 'utf8'));
    assert.equal(manifest.dependencies[0].notices.length, 2);
    await rm(path.join(root, 'node_modules/runtime/LICENSE'));
    await assert.rejects(buildThirdPartyNotices({ root }), /Missing full runtime license/);
  } finally {
    assert.ok(path.basename(root).startsWith('onyx-license-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('the locked runtime packages retain missing upstream license texts and Apache NOTICE supplements', async () => {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const manifest = JSON.parse(await readFile('public/THIRD-PARTY-DEPENDENCIES.json', 'utf8'));
  assert.equal(manifest.dependencies.length, Object.entries(lock.packages).filter(([key, value]: [string, any]) => key && !value.dev).length);
  const byName = Object.fromEntries(manifest.dependencies.map(p => [p.name, p]));
  for (const name of ['@bufbuild/protobuf', 'react-remove-scroll-bar']) assert(byName[name].notices.some(p => p.kind === 'license'));
  for (const name of ['livekit-client', '@livekit/protocol', '@livekit/mutex']) assert(byName[name].notices.some(p => p.kind === 'notice'));
  const text = await readFile('public/THIRD-PARTY-NOTICES.txt', 'utf8');
  assert.match(text, /Copyright 2021-2024 Buf Technologies/);
  assert.match(text, /Copyright 2008 Google Inc\./);
  assert.match(text, /Anton Korzunov/);
});
