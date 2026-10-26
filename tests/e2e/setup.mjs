import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const version = '1.13.10';
const directory = path.resolve('.tools/livekit');
await mkdir(directory, { recursive: true });
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const arch = process.arch === 'x64' ? 'amd64' : process.arch;
const filename = `livekit_${version}_${platform}_${arch}.${platform === 'windows' ? 'zip' : 'tar.gz'}`;
const base = `https://github.com/livekit/livekit/releases/download/v${version}`;
async function download(name) {
  const response = await fetch(`${base}/${name}`);
  if (!response.ok) throw new Error(`Download ${name}: HTTP ${response.status}. Alternatively set LIVEKIT_SERVER_PATH to an installed LiveKit server.`);
  return Buffer.from(await response.arrayBuffer());
}
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, env });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
if (!process.env.LIVEKIT_SERVER_PATH) {
  if (process.platform === 'darwin') throw new Error('On macOS install livekit-server first (e.g. brew install livekit), then set LIVEKIT_SERVER_PATH to that executable and run setup again.');
  const [archive, checksums] = await Promise.all([download(filename), download('checksums.txt')]);
  const expected = checksums.toString().split('\n').find((line) => line.trimEnd().endsWith(filename))?.trim().split(/\s+/)[0];
  if (!expected || createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('LiveKit checksum mismatch');
  const archivePath = path.join(directory, filename);
  await writeFile(archivePath, archive);
  if (platform === 'windows') {
    const quote = (text) => `'${text.replaceAll("'", "''")}'`;
    await run('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(archivePath)} -DestinationPath ${quote(directory)} -Force`]);
  } else await run('tar', ['-xzf', archivePath, '-C', directory]);
  console.log(`LiveKit ${version}: SHA256 verified`);
}
await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'install', 'chromium', 'firefox', 'webkit'], {
  ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.resolve('.tools/browsers'),
});
