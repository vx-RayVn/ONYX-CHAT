import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Final built bytes, before static aliases are copied. */
export async function protectAppStyles(directory='dist'){
  const file=path.join(directory,'app.html');let html=await readFile(file,'utf8');
  const tags=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
  if(!tags.length)throw new Error('App stylesheet missing');
  for(const [tag] of tags){
    const url=tag.match(/href="(\/assets\/[^"?#]+\.css)"/)?.[1];
    if(!url)throw new Error('Unexpected app stylesheet location');
    const content=await readFile(path.join(directory,url.slice(1)));
    const integrity='sha384-'+createHash('sha384').update(content).digest('base64');
    html=html.replace(tag,tag.replace(/\s+integrity="[^"]*"/g,'').replace(/\s+data-onyx-app-style(?:="[^"]*")?/g,'').replace(/\s+on(?:load|error)="[^"]*"/g,'').replace(/>$/,` data-onyx-app-style integrity="${integrity}" onload="this.dataset.onyxStyleState='ready'" onerror="this.dataset.onyxStyleState='error'">`));
  }
  await writeFile(file,html);console.log('App stylesheet integrity pinned to final bytes.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await protectAppStyles();
