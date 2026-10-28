/** Hostinger's Node entry: serves the Vite build and real invitation metadata to link crawlers. */
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import { readFile,stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {reservedPaths,publicPage,appLocation} from './website/routes.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const origin='https://onyxchat.site';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function invitationCode(url) {
  const code=url.searchParams.get('invite')??url.pathname.match(/^\/(?:invite\/|i\/)?([a-z0-9_-]{3,100})\/?$/i)?.[1];
  return code&&/^[a-z0-9_-]{3,100}$/i.test(code)&&!reservedPaths.has(code.toLowerCase())?code.toLowerCase():null;
}
export function inviteMetadata(html,preview,code,projectUrl) {
  const title=preview?`${preview.name} · ONYX`:'ONYX · Server invitation';
  const description=preview?`${preview.members} members · ${preview.description||`Join ${preview.name} on ONYX.`}`:'This invitation is unavailable or has expired.';
  const raw=preview?.banner?.kind==='image'?preview.banner.src:preview?.icon;
  let image=raw?.startsWith('storage:media/')?`${projectUrl}/storage/v1/object/public/media/${raw.slice(14)}`:raw;
  try { const candidate=new URL(image);if(candidate.protocol!=='https:'||![new URL(projectUrl).hostname,'onyxchat.site'].includes(candidate.hostname))image=null; } catch { image=null; }
  image||=`${origin}/brand/apple-touch-icon.png`;
  const fields={'og:type':'website','og:site_name':'ONYX','og:title':title,'og:description':description,'og:url':`${origin}/invite/${encodeURIComponent(code)}`,'og:image':image,'twitter:card':'summary_large_image','twitter:title':title,'twitter:description':description,'twitter:image':image};
  const meta=Object.entries(fields).map(([key,value])=>`<meta ${key.startsWith('og:')?'property':'name'}="${key}" content="${escapeHtml(value)}">`).join('\n');
  return html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${escapeHtml(title)}</title>`).replace(/<meta\s+name="description"[^>]*>/i,`<meta name="description" content="${escapeHtml(description)}">`).replace('</head>',`${meta}\n</head>`);
}
async function publicConfig() {
  let text='';try{text=await readFile(path.join(root,'.env.production'),'utf8');}catch{}
  const get=name=>process.env[name]??text.match(new RegExp(`^${name}=(.*)$`,'m'))?.[1]?.trim();
  return {url:get('VITE_SUPABASE_URL'),key:get('VITE_SUPABASE_PUBLISHABLE_KEY')};
}
export async function createHandler({directory=path.join(root,'dist'),config,fetcher=fetch}={}) {
  const html=await readFile(path.join(directory,'index.html'),'utf8');
  const appHtml=await readFile(path.join(directory,'app.html'),'utf8').catch(()=>html);
  const cfg=config??await publicConfig(),cache=new Map();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url??'')||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg.key??''))throw new Error('Public ONYX backend configuration missing');
  return async(req,res)=>{
    res.setHeader('Strict-Transport-Security','max-age=31536000');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const url=new URL(req.url,'http://localhost'),code=invitationCode(url);
    if(url.pathname==='/_onyx/health'){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:JSON.stringify({service:'onyx',status:'ok'}));return;
    }
    if(code){
      const canonical=`/invite/${encodeURIComponent(code)}`;
      if(url.pathname!==canonical||url.searchParams.has('invite')){
        url.searchParams.delete('invite');
        res.writeHead(302,{'Location':canonical+url.search,'Cache-Control':'no-store'}).end();return;
      }
      let preview=cache.get(code);
      try{
        if(!preview||preview.until<Date.now()){
          const response=await fetcher(`${cfg.url}/rest/v1/rpc/invite_preview`,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({p_code:code}),signal:AbortSignal.timeout(3000)});
          if(!response.ok)throw new Error('preview unavailable');
          preview={value:await response.json(),until:Date.now()+15000};
          if(cache.size>=200)cache.delete(cache.keys().next().value);
          cache.set(code,preview);
        }
        res.writeHead(preview.value?200:404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:inviteMetadata(appHtml,preview.value,code,cfg.url));return;
      }catch{
        // Keep the actual app usable during a preview-service outage; never cache a false "expired" result.
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:appHtml);return;
      }
    }
    if(appLocation(url)) {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:appHtml);return;}
    const page=publicPage(url.pathname);
    if(page&&page!=='home'){
      try{const content=await readFile(path.join(directory,page,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);return;}catch{}
    }
    let file;
    try { file=path.resolve(directory,`.${decodeURIComponent(url.pathname)}`); }catch{res.writeHead(400).end();return;}
    if(!file.startsWith(path.resolve(directory)+path.sep)){file=path.join(directory,'index.html');}
    try{
      const info=await stat(file);if(!info.isFile())throw new Error('not file');
      if(['.zip','.exe'].includes(path.extname(file))&&file.includes(path.sep+'downloads'+path.sep)){
        const modified=info.mtime.toUTCString();
        const headers={'Content-Type':path.extname(file)==='.zip'?'application/zip':'application/octet-stream','Content-Disposition':`attachment; filename="${path.basename(file).replace(/[^A-Za-z0-9._-]/g,'_')}"`,'Cache-Control':'no-cache','Accept-Ranges':'bytes','Last-Modified':modified};
        let start=0,end=info.size-1,status=200;
        // A mismatched If-Range restarts the complete download instead of combining versions.
        if(req.method==='GET'&&req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===modified)){
          const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if(match&&(match[1]||match[2])){
            if(!match[1]){const suffix=Number(match[2]);start=Number.isSafeInteger(suffix)&&suffix>0?Math.max(0,info.size-suffix):info.size;}
            else {start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),info.size-1);}
          }
          if(!match||!(match[1]||match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=info.size||end<start){res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`,'Content-Length':0}).end();return;}
          status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
        }
        res.writeHead(status,{...headers,'Content-Length':Math.max(0,end-start+1)});
        if(req.method==='HEAD'||!info.size)res.end();else await pipeline(createReadStream(file,{start,end}),res);return;
      }
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'}[path.extname(file)]??'application/octet-stream';
      const content=await readFile(file);
      res.writeHead(200,{'Content-Type':mime,'Content-Length':content.byteLength,'Cache-Control':file.includes(path.sep+'assets'+path.sep)?'public, max-age=31536000, immutable':'no-cache'});
      res.end(req.method==='HEAD'?undefined:content);
    }catch{if(res.headersSent){res.destroy?.();return;}if(url.pathname.startsWith('/downloads/')){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:'Download unavailable');return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:html);}
  };
}
