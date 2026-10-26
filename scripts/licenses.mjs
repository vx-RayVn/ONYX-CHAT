import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const licenseBanner = '/*! Third-party license notices: /THIRD-PARTY-NOTICES.txt */';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Offline, locked production dependencies, including transitive packages and NOTICE files. */
export async function buildThirdPartyNotices({ root = process.cwd(), modulesRoot = root } = {}) {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const supplements = JSON.parse(await readFile(path.join(root, 'licenses/supplements.json'), 'utf8'));
  const base = await readFile(path.join(root, 'licenses/additional-notices.txt'), 'utf8');
  const sections = ['ONYX — Third-party runtime copyright and license notices\n\nGenerated offline from package-lock.json. Third-party works retain their own terms.\n\n' + base];
  const dependencies = [];
  for (const [relative, info] of Object.entries(lock.packages).filter(([relative, info]) => relative && !info.dev).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (!relative.startsWith('node_modules/') || relative.split('/').some(part => part === '..' || part === '.')) throw Error('Unexpected dependency location');
    const folder = path.resolve(modulesRoot, relative);
    if (!folder.startsWith(path.resolve(modulesRoot, 'node_modules') + path.sep)) throw Error('Dependency escapes node_modules');
    const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
    const name = relative.split('node_modules/').at(-1), identity = name + '@' + info.version;
    if (pkg.name !== name || pkg.version !== info.version) throw Error('Installed dependency differs from lock: ' + identity);
    const license = info.license ?? pkg.license;
    if (typeof license !== 'string' || !license) throw Error('Missing license metadata: ' + identity);
    const files = (await readdir(folder, { withFileTypes: true })).filter(entry => entry.isFile() && /^(?:licen[sc]e|copying|notice|ofl)(?:[.-]|$)/i.test(entry.name));
    const pieces = [];
    for (const entry of files) {
      const bytes = await readFile(path.join(folder, entry.name));
      pieces.push({ label: entry.name, text: bytes.toString('utf8'), sha256: hash(bytes), kind: /^notice/i.test(entry.name) ? 'notice' : 'license', source: 'distributed npm package' });
    }
    for (const extra of supplements[identity] ?? []) {
      const file = path.resolve(root, 'licenses', extra.file);
      if (!file.startsWith(path.resolve(root, 'licenses') + path.sep)) throw Error('Supplement escapes license directory');
      const bytes = await readFile(file);
      if (extra.sha256 && extra.sha256 !== hash(bytes)) throw Error('Changed upstream notice: ' + identity);
      pieces.push({ label: extra.file, text: bytes.toString('utf8'), sha256: hash(bytes), kind: /NOTICE/i.test(extra.file) ? 'notice' : 'license', source: extra.source });
    }
    // A NOTICE is not a replacement for a full licence. External proprietary terms stay explicit.
    if (!pieces.length || !pieces.some(piece => piece.kind === 'license') && !license.startsWith('SEE LICENSE IN https://')) throw Error('Missing full runtime license: ' + identity);
    sections.push('\n\n' + '='.repeat(72) + '\n' + identity + '\nLicense: ' + license + '\n' + '='.repeat(72) + '\n\n' + pieces.map(piece => '--- ' + piece.label + ' ---\nSource: ' + piece.source + '\n\n' + piece.text).join('\n\n'));
    dependencies.push({ name, version: info.version, license, notices: pieces.map(({ text, ...record }) => record) });
  }
  const text = sections.join('\n') + '\n';
  await mkdir(path.join(root, 'public'), { recursive: true });
  await writeFile(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'), text);
  await writeFile(path.join(root, 'public/THIRD-PARTY-DEPENDENCIES.json'), JSON.stringify({ format: 1, noticeSha256: hash(text), dependencies }, null, 2) + '\n');
  return { text, dependencies };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await buildThirdPartyNotices();
  console.log(JSON.stringify({ runtimeLicenseNotices: result.dependencies.length, bytes: Buffer.byteLength(result.text) }));
}
