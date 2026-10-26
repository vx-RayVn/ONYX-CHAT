import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {protectAppStyles} from '../scripts/asset-integrity.mjs';

test('built stylesheet integrity covers final UTF-8 bytes and is idempotent',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'onyx-integrity-'));
  try{
    await mkdir(path.join(directory,'assets'));
    const css='/* Grüße */ .auth-screen{display:flex}';
    await writeFile(path.join(directory,'assets/app-test.css'),css);
    await writeFile(path.join(directory,'app.html'),'<link rel="stylesheet" crossorigin href="/assets/app-test.css">');
    await protectAppStyles(directory);const html=await readFile(path.join(directory,'app.html'),'utf8');
    assert.ok(html.includes('sha384-'+createHash('sha384').update(css).digest('base64')));assert.ok(html.includes('data-onyx-app-style'));
    await protectAppStyles(directory);assert.equal(await readFile(path.join(directory,'app.html'),'utf8'),html);
    await writeFile(path.join(directory,'assets/app-test.css'),css+'/* changed */');
    await protectAppStyles(directory);assert.notEqual(await readFile(path.join(directory,'app.html'),'utf8'),html);
  }finally{await rm(directory,{recursive:true,force:true});}
});
