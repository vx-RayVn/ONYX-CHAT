import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'desktop/Onyx.Desktop');
await mkdir(dir, { recursive: true });
const keys = new Set([
  'Back','Forward','Full screen','Minimize','Maximize','Close',
  'Open ONYX', 'Reload', 'Game activity', 'Try again', 'Open in browser', 'Connection interrupted',
  'Check for updates', 'Quit ONYX', 'Quit ONYX and end any active call?',
  'Install Microsoft Edge WebView2 Runtime to open ONYX.', 'No updates available.', 'Download desktop update?',
  'Restart ONYX to install the update and end any active call?',
]);
const strings = {};
for (const locale of ['ar','de','es','fr','it','ja','ko','nl','pl','pt-BR','ru','tr','uk','zh-CN']) {
  const text = await readFile(path.join(root, 'src/i18n/locales', locale + '.ts'), 'utf8');
  const dict = {};
  for (const match of text.matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)) {
    const [key, value] = JSON.parse('[' + match[1] + ',' + match[2] + ']');
    if (keys.has(key)) dict[key] = value;
  }
  if ([...keys].some(key => !dict[key])) throw new Error('Missing desktop translation in ' + locale);
  strings[locale] = dict;
}
await writeFile(path.join(dir, 'strings.json'), JSON.stringify(strings));
// ICO containing the existing PNG logo, with no change to the original artwork.
const png = await readFile(path.join(root, 'public/brand/favicon-64.png'));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = header[7] = 64;
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await writeFile(path.join(dir, 'onyx.ico'), Buffer.concat([header, png]));
console.log('Desktop icon and all 14 translations generated.');
