import{mkdir,writeFile,copyFile,readFile,stat}from'node:fs/promises';
import{createHash}from'node:crypto';
import path from'node:path';
import postcss from'postcss';
import{siteConfig}from'./config.mjs';
import{createReadStream}from'node:fs';
export async function buildAssets(root){
 if(Boolean(siteConfig.repositoryUrl)!==Boolean(siteConfig.license))throw Error('Publish the repository URL and license together.');
 for(const[platform,url]of Object.entries(siteConfig.desktopDownloads??{}))if(url){if(!/^\/downloads\/[a-z0-9._-]+$/i.test(url)||!(await stat(path.join(root,'public',url.slice(1)))).isFile())throw Error('Missing desktop download for '+platform);}
 if(siteConfig.desktopDownloads?.windows&&siteConfig.desktopRelease){
  const file=path.join(root,'public',siteConfig.desktopDownloads.windows.slice(1)),release=siteConfig.desktopRelease;
  const checksum=createHash('sha256');for await(const chunk of createReadStream(file))checksum.update(chunk);
  if((await stat(file)).size!==release.bytes||checksum.digest('hex')!==release.sha256)throw Error('Windows installer differs from the verified desktop release');
 }
 const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,16),assetsDirectory=path.join(root,'public/website/v13');
 await mkdir(assetsDirectory,{recursive:true});
 // Content-addressed assets are immutable. Cached HTML must still find earlier hashes.
 if(path.resolve(assetsDirectory)!==path.resolve(root,'public/website/v13'))throw Error('Unexpected asset directory');
 const emit=async(name,extension,value)=>{const url='/website/v13/'+name+'.'+hash(value)+'.'+extension;await writeFile(path.join(root,'public',url.slice(1)),value);return url;};
 await mkdir(path.join(root,'public/website/fonts'),{recursive:true});
 for(const[font,source]of Object.entries({inter:'inter-latin-opsz-normal.woff2',fredoka:'fredoka-latin-wght-normal.woff2',orbitron:'orbitron-latin-wght-normal.woff2'}))await copyFile(path.join(root,'node_modules/@fontsource-variable',font,'files',source),path.join(root,'public/website/fonts',font+'-latin.woff2'));
 const tokens=await readFile(path.join(root,'src/styles/tokens.css'),'utf8'),components=postcss.parse(await readFile(path.join(root,'src/styles/components.css'),'utf8')),core=postcss.root();
 components.each(node=>{if(node.type==='rule'&&node.selector.split(',').every(selector=>/^\.(?:wordmark|btn)(?:[\s:.\[-]|$)/.test(selector.trim())))core.append(node.clone());});
 const coreCSS=tokens+'\n'+core+'\n.wordmark .wordmark-logo{display:none}\n';
 const native=JSON.parse(await readFile(path.join(root,'website/native-previews.json'),'utf8'));
 if(!native.chat?.desktop||!native.chat?.mobile||!native.call)throw Error('Run node website/render-previews.mjs to export the genuine read-only UI first.');
 const classes=new Set([...JSON.stringify(native).replace(/\\"/g,'"').matchAll(/class="([^"]+)"/g)].flatMap(match=>match[1].split(/\s+/)));
 const files=['tokens','base','components','art','cosmetics','layout','chat','profile','views','studio','voice','responsive'];let nativeCSS='',sources={};
 for(const name of files){const css=await readFile(path.join(root,'src/styles',name+'.css'),'utf8');sources[name]=createHash('sha256').update(css).digest('hex');const tree=postcss.parse(css);tree.walkComments(comment=>comment.remove());tree.walkRules(rule=>{if(rule.parent?.type==='atrule'&&rule.parent.name==='keyframes')return;const found=[...rule.selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)];if(found.length&&!found.some(match=>classes.has(match[1])))rule.remove();else rule.selector=rule.selector.replaceAll(':root',':host');});nativeCSS+=tree+'\n';}
 nativeCSS+=await readFile(path.join(root,'website/read-only.css'),'utf8');
 // Light DOM keeps native selection/copy working in Safari. Scope every product selector.
 const scoped=postcss.parse(nativeCSS);scoped.walkRules(rule=>{if(rule.parent?.type==='atrule'&&rule.parent.name==='keyframes')return;rule.selectors=rule.selectors.map(selector=>{selector=selector.replace(/\bh1\b/g,'[data-native-title]');if(selector.includes(':host'))return selector.replace(/:host\(([^)]+)\)/g,'.native-preview$1').replaceAll(':host','.native-preview');return '.native-preview '+selector;});});nativeCSS=scoped.toString();
 const catalog=JSON.stringify({catalogue:native.catalogue,defaults:native.defaults});const catalogueUrl=await emit('catalog','json',catalog);
 const client=((await readFile(path.join(root,'website/client.js'),'utf8'))+'\n'+(await readFile(path.join(root,'website/profile-preview.js'),'utf8'))+'\n'+(await readFile(path.join(root,'website/commerce-client.js'),'utf8'))).replace('__ONYX_CATALOG_URL__',catalogueUrl),css=await readFile(path.join(root,'website/site.css'),'utf8');
 const manifest={core:await emit('core','css',coreCSS),style:await emit('site','css',css),native:await emit('native','css',nativeCSS),script:await emit('site','js',client),catalog:catalogueUrl};
 await writeFile(path.join(root,'website/assets-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 // Unversioned authoring copies are retained, but no public page requests these mutable URLs.
 for(const[name,value]of Object.entries({'site.css':css,'site.js':client,'onyx-core.css':coreCSS,'native.css':nativeCSS,'customizations.json':catalog}))await writeFile(path.join(root,'public/website',name),value);
 await writeFile(path.join(root,'website/native-sources.json'),JSON.stringify({format:'read-only HTML from original components',components:['AppShell','CallPanel','ProfileCard','Wordmark','Banner','ProfileEffect','ProfileFrame','AvatarDecoration','StyledName'],styles:sources},null,2)+'\n');
 return manifest;
}
