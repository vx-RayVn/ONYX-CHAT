import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { receiveWebhook, toVoiceEvent } from '../../supabase/functions/_shared/livekit.ts';

const root = process.cwd();
const toolDir = path.join(root, '.tools');
await mkdir(toolDir, { recursive: true });
const binary = process.env.LIVEKIT_SERVER_PATH || path.join(toolDir, 'livekit', process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server');
if (!existsSync(binary)) throw new Error('Local LiveKit server missing. See README: npm run test:voice:setup.');
// Generated for this run only. Never use cloud credentials in local tests.
const cfg = { url: 'ws://127.0.0.1:7880', apiKey: `e2e${randomBytes(8).toString('hex')}`, apiSecret: randomBytes(32).toString('hex') };
const events = [];
const webhook = createServer(async (req, res) => {
  if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(events)); return; }
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const event = await receiveWebhook(cfg, Buffer.concat(chunks).toString(), req.headers.authorization ?? null);
    events.push({ raw: event, mapped: toVoiceEvent(event) });
    res.writeHead(200).end('ok');
  } catch { res.writeHead(401).end(); }
});
await new Promise((resolve, reject) => webhook.listen(7891, '127.0.0.1', resolve).once('error', reject));
const children = [];
function start(exe, args, name, env = {}) {
  const child = spawn(exe, args, { cwd: root, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = createWriteStream(path.join(toolDir, `${name}.log`));
  child.stdout.pipe(log); child.stderr.pipe(log);
  children.push(child); return child;
}
async function waitFor(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Local service exited: ${url}. See .tools logs.`);
    try { await fetch(url, { signal: AbortSignal.timeout(500) }); return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Local service unavailable: ${url}`);
}
const stop = () => { for (const child of children) child.kill(); webhook.close(); };
process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });
try {
  const serverConfig = `webhook:\n  api_key: ${cfg.apiKey}\n  urls:\n    - http://127.0.0.1:7891\n`;
  const livekit = start(binary, ['--dev', '--bind', '127.0.0.1', '--node-ip', '127.0.0.1', '--udp-port', '7882', '--keys', `${cfg.apiKey}: ${cfg.apiSecret}`, '--config-body', serverConfig], 'livekit');
  await waitFor('http://127.0.0.1:7880', livekit);
  const vite = start(process.execPath, ['tests/e2e/vite.mjs'], 'voice-vite', {
    VITE_SUPABASE_URL: 'http://127.0.0.1:5173', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_voice_fixture', VITE_ONYX_BACKEND: 'cloud',
  });
  await waitFor('http://127.0.0.1:5173', vite);
  // A deterministic sine wave is transmitted through real WebRTC. No microphone recording.
  const sampleRate = 48000, seconds = 4, length = sampleRate * seconds * 2;
  const wav = Buffer.alloc(44 + length);
  wav.write('RIFF'); wav.writeUInt32LE(36 + length, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length, 40);
  for (let i = 0; i < length / 2; i++) wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 8000), 44 + i * 2);
  await writeFile(path.join(toolDir, 'voice-tone.wav'), wav);
  const test = start(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=tests/e2e/playwright.config.ts', ...process.argv.slice(2)], 'voice-tests', {
    PLAYWRIGHT_BROWSERS_PATH: path.join(toolDir, 'browsers'), ONYX_E2E_KEY: cfg.apiKey, ONYX_E2E_SECRET: cfg.apiSecret, ONYX_E2E_RUN: randomUUID(),
  });
  test.stdout.on('data', (chunk) => process.stdout.write(chunk)); test.stderr.on('data', (chunk) => process.stderr.write(chunk));
  process.exitCode = await new Promise((resolve) => test.once('exit', (code) => resolve(code ?? 1)));
} finally { stop(); }
