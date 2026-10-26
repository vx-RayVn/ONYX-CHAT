import{mkdir,writeFile}from'node:fs/promises';
import path from'node:path';
import{buildAssets}from'./build-assets.mjs';
import{renderPage,pageNames}from'./render.mjs';
const root=path.resolve(import.meta.dirname,'..'),assets=await buildAssets(root);
for(const page of pageNames){const file=page==='home'?path.join(root,'index.html'):path.join(root,'public',page,'index.html');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,renderPage(page,assets));}
await writeFile(path.join(root,'public/sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+pageNames.map(page=>'<url><loc>https://onyxchat.site/'+(page==='home'?'':page+'/')+'</loc></url>').join('')+'</urlset>');
console.log('ONYX website: 9 static pages, genuine read-only HTML, versioned assets.');
