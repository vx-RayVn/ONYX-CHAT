import {readFileSync} from 'node:fs';
export const artwork=JSON.parse(readFileSync(new URL('./native-previews.json',import.meta.url),'utf8'));
const features=JSON.parse(readFileSync(new URL('../src/config/features.json',import.meta.url),'utf8'));
export const cleanFragment=html=>{
 const fragment=html.replace(/<link[^>]*rel="preload"[^>]*>/g,'');
 return features.onyxPlus?fragment:fragment.replace(/<button\b(?=[^>]*\bclass="[^"]*\bplus-pill\b)[^>]*>[\s\S]*?<\/button>/g,'').replace(/<span\b(?=[^>]*\bclass="[^"]*\bplus-check\b)[^>]*>[\s\S]*?<\/span>/g,'');
};
import {siteConfig} from './config.mjs';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={arrow:'M4 12h16m-6-6 6 6-6 6',down:'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4',chevron:'m6 9 6 6 6-6',check:'m5 12 4 4L19 6',hash:'M5 9h14M4 15h14M11 3 7 21M17 3l-4 18',mic:'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5m-3 5v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6',headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H5a2 2 0 0 1-2-2v-6m18 0h-4v8h2a2 2 0 0 0 2-2v-6',voice:'M12 3v18M7 7v10M17 6v12M3 10v4M21 9v6',video:'M3 6h12v12H3zm12 4 6-3v10l-6-3',screen:'M3 4h18v13H3zm5 17h8m-4-4v4',chat:'M4 4h16v13H9l-5 4V4',users:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-6 10v-2a6 6 0 0 1 12 0v2m2-17a4 4 0 0 1 0 8m6 9v-2a6 6 0 0 0-4-5',shield:'m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3m-4 9 3 3 5-6',code:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7',gem:'m7 3-5 6 10 13L22 9l-5-6H7m-5 6h20M7 3l5 19 5-19',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18m-9-9c5 5 5 13 0 18-5-5-5-13 0-18',bug:'M8 9h8v8a4 4 0 0 1-8 0V9m1-4 3 3 3-3M4 11h4m8 0h4M3 16h5m8 0h5M5 22l4-3m6 0 4 3M12 9v12',game:'M7 7h10a4 4 0 0 1 4 4l1 6c0 3-3 4-5 1l-1-1H8l-1 1c-2 3-5 2-5-1l1-6a4 4 0 0 1 4-4m0 3v6m-3-3h6m6-2h.01M18 14h.01',plus:'M12 4v16M4 12h16',smile:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M8 15c2 3 6 3 8 0',menu:'M4 6h16M4 12h16M4 18h16',copy:'M9 9h12v12H9zM5 15H3V3h12v2',external:'M14 3h7v7m0-7L10 14m1-11H3v18h18v-8',lock:'M5 10h14v11H5zm3 0V7a4 4 0 0 1 8 0v3',mail:'M3 5h18v14H3zm0 0 9 7 9-7',heart:'M12 21S2 15 2 8c0-6 8-7 10-1 2-6 10-5 10 1 0 7-10 13-10 13'};
export const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]??paths.spark}"/></svg>`;
export const brand=()=>`<a class="brand" href="/" aria-label="ONYX home">${cleanFragment(artwork.wordmark)}</a>`;
export const button=(text,href,secondary=false,small=false)=>`<a class="btn btn-${secondary?'secondary':'primary'} btn-lg" href="${href}"${href==='/developers/bot.mjs'?' download="onyx-bot.mjs"':''}>${text}</a>`;
export const link=(text,href)=>`<a class="text-link" href="${href}">${text}${icon('arrow')}</a>`;
export const code=(label,text)=>`<div class="code-block"><div class="code-head"><span>${escapeHtml(label)}</span><button class="code-copy" data-copy type="button" aria-label="Copy ${escapeHtml(label)}">${icon('copy')}<span aria-live="polite">Copy</span></button></div><pre><code>${escapeHtml(text)}</code></pre></div>`;
export const callout=(title,text)=>`<aside class="callout"><strong>${title}</strong><p>${text}</p></aside>`;

