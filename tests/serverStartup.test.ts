import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const mode of ['cli', 'import', 'require']) {
  test(`production server calls listen when started by ${mode}`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'onyx-startup-'));
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('onyx-startup-'));
    let child;
    try {
      await mkdir(path.join(dir, 'website')); await mkdir(path.join(dir, 'dist'));
      for (const name of ['server.js', 'website/routes.js']) await cp(path.join(root, name), path.join(dir, name));
      try { await access(path.join(root, 'server-handler.js')); await cp(path.join(root, 'server-handler.js'), path.join(dir, 'server-handler.js')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
      for (const name of ['index.html', 'app.html']) await writeFile(path.join(dir, 'dist', name), '<html><title>ONYX startup fixture</title></html>');
      // Observe the actual entry's listen call, binding a private ephemeral port like a hosting launcher.
      await writeFile(path.join(dir, 'observe.mjs'), `import {Server} from 'node:http';
const listen=Server.prototype.listen;
Server.prototype.listen=function(...args){const requestedPort=args[0];listen.call(this,0,'127.0.0.1',()=>process.send({port:this.address().port,requestedPort}));return this;};`);
      const args = ['--import', './observe.mjs', ...(mode === 'cli' ? ['server.js'] : mode === 'import' ? ['--input-type=module', '-e', "await import('./server.js')"] : ['-e', "require('./server.js')"])];
      child = spawn(process.execPath, args, { cwd: dir, env: { ...process.env, PORT: '31337', VITE_SUPABASE_URL: 'https://your-project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_startup_fixture' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      const started = await new Promise<{port:number; requestedPort:number}>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Entry did not call listen within 3 seconds')), 3000);
        child.once('message', message => { clearTimeout(timer); resolve(message as any); });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(Error(`Entry exited before listen (${code})`)); });
      });
      assert.equal(started.requestedPort, 31337);
      const response = await fetch(`http://127.0.0.1:${started.port}/_onyx/health`, { signal: AbortSignal.timeout(1000) });
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { service: 'onyx', status: 'ok' });
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
      await rm(dir, { recursive: true, force: true });
    }
  });
}
