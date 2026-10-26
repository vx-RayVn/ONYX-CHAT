import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

async function verify(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await verify(file); continue; }
    if (!/\.(js|css|html|json|map)$/.test(entry.name)) continue;
    const content = await readFile(file, 'utf8');
    for (const marker of ['voice-e2e', '__onyxVoiceE2E', 'sb_publishable_local_voice_fixture', 'ONYX Voice E2E', 'ui-e2e', 'ONYX UI E2E', 'sb_publishable_local_ui_fixture', 'SYNTHETICSETUPKEYONLY', 'security-fixture@onyx.invalid']) {
      if (content.includes(marker)) throw new Error(`Dev-only voice fixture found in production: ${file} (${marker})`);
    }
  }
}
await verify('dist');
const dependencyNotices=JSON.parse(await readFile('dist/THIRD-PARTY-DEPENDENCIES.json','utf8'));
const productionLock=JSON.parse(await readFile('package-lock.json','utf8'));
const expectedNotices=Object.entries(productionLock.packages).filter(([key,value])=>key&&!value.dev).map(([key,value])=>key.split('node_modules/').at(-1)+'@'+value.version).sort();
const actualNotices=dependencyNotices.dependencies.map(value=>value.name+'@'+value.version).sort();
if(JSON.stringify(expectedNotices)!==JSON.stringify(actualNotices))throw Error('Runtime license coverage mismatch');
if(dependencyNotices.noticeSha256!==createHash('sha256').update(await readFile('dist/THIRD-PARTY-NOTICES.txt')).digest('hex'))throw Error('Runtime license notice bytes mismatch');
for(const file of await readdir('dist/assets'))if(file.endsWith('.js')&&!(await readFile('dist/assets/'+file,'utf8')).slice(0,4096).includes('/*! Third-party license notices: /THIRD-PARTY-NOTICES.txt */'))throw Error('Built chunk has no license notice reference in its preamble: '+file);
for(const entry of ['index.html','app.html']) {
  const html = await readFile(`dist/${entry}`, 'utf8');
  if (/<link[^>]+modulepreload[^>]+krisp-/i.test(html)) throw new Error('Optional Krisp SDK must not be preloaded on startup.');
  if(entry==='index.html'&&/<(?:script|link)[^>]+(?:src|href)="\/assets\//i.test(html))throw new Error('Public website must not load app chunks.');
  if(entry==='app.html'){
    const links=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
    if(!links.length)throw new Error('App stylesheet absent');
    for(const [tag] of links){
      const href=tag.match(/href="(\/assets\/[^"?#]+\.css)"/)?.[1],integrity=tag.match(/integrity="([^"]+)"/)?.[1];
      if(!href||!tag.includes('data-onyx-app-style')||integrity!=='sha384-'+createHash('sha384').update(await readFile(path.join('dist',href.slice(1)))).digest('base64'))throw new Error('App stylesheet integrity mismatch');
    }
    if(!html.includes('<style>')||!html.includes('id="onyx-startup"'))throw new Error('Independent startup surface missing');
  }
}
for (const file of await readdir('dist/assets')) {
  if (/^livekit-.*\.js$/.test(file) && (await stat(path.join('dist/assets', file))).size > 1_100_000)
    throw new Error('Core LiveKit chunk unexpectedly large; keep the optional Krisp SDK separate.');
}
console.log('Production: dev-only voice entry and local fixture credentials absent.');
