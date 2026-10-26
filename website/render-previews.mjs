/** Export the actual ONYX components as selectable, read-only HTML. Local authoring only. */
import{writeFile}from'node:fs/promises';
import{createServer}from'vite';
import path from'node:path';
const root=path.resolve(import.meta.dirname,'..');
process.env.VITE_ONYX_BACKEND='local';process.env.PLAYWRIGHT_BROWSERS_PATH??=path.join(root,'.tools/browsers');
const{chromium}=await import('@playwright/test');
const server=await createServer({root,server:{host:'127.0.0.1',port:5173,strictPort:true}});let browser;
try{
 await server.listen();browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1360,height:760}});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:5173/website/preview-source.html');await page.waitForFunction(()=>window.__websiteArtwork);await page.evaluate(()=>document.fonts.ready);
 const exportDOM=async(selector,prefix)=>page.evaluate(({selector,prefix})=>{
  const element=document.querySelector(selector);if(!element)throw Error('Missing genuine preview '+selector);const clone=element.cloneNode(true);
  clone.querySelectorAll('.notify-prompt,.demo-pill').forEach(el=>el.remove());
  if(prefix==='chat-mobile')clone.querySelectorAll('.rail,.sidebar,.side-panel').forEach(el=>el.remove());
  clone.querySelectorAll('h1').forEach(el=>{const heading=document.createElement('h3');for(const attr of el.attributes)heading.setAttribute(attr.name,attr.value);heading.setAttribute('data-native-title','');heading.append(...el.childNodes);el.replaceWith(heading);});
  clone.querySelectorAll('main').forEach(el=>el.setAttribute('role','presentation'));
  clone.querySelectorAll('form').forEach(form=>{const div=document.createElement('div');for(const attr of form.attributes)if(!['action','method'].includes(attr.name))div.setAttribute(attr.name,attr.value);div.append(...form.childNodes);form.replaceWith(div);});
  clone.querySelectorAll('button,input,textarea,select,[contenteditable],a,[tabindex]').forEach(el=>{el.removeAttribute('contenteditable');el.removeAttribute('autofocus');el.removeAttribute('href');el.removeAttribute('target');el.setAttribute('tabindex','-1');if(el.matches('input,textarea')){el.setAttribute('readonly','');el.removeAttribute('value');}if(el.matches('button')){el.setAttribute('type','button');el.setAttribute('aria-disabled','true');}if(el.getAttribute('role')==='textbox')el.removeAttribute('role');});
  const ids=new Map();clone.querySelectorAll('[id]').forEach(el=>{const old=el.id;ids.set(old,prefix+'-'+old);el.id=ids.get(old);});
  clone.querySelectorAll('*').forEach(el=>{for(const attr of [...el.attributes]){let value=attr.value;for(const[old,next]of ids){value=value.replaceAll('url(#'+old+')','url(#'+next+')');if(['for','aria-labelledby','aria-describedby','aria-controls'].includes(attr.name))value=value.split(' ').map(id=>id===old?next:id).join(' ');}if(attr.name!=='id')el.setAttribute(attr.name,value);}});
  const walker=document.createTreeWalker(clone,NodeFilter.SHOW_TEXT),empty=[];while(walker.nextNode())if(walker.currentNode.textContent==='0')empty.push(walker.currentNode);empty.forEach(node=>node.remove());
  return clone.outerHTML;
 },{selector,prefix});
 const data=await page.evaluate(()=>window.__websiteArtwork.data);data.chat={desktop:await exportDOM('#root > .app','chat-desktop')};
 await page.setViewportSize({width:390,height:700});await page.waitForSelector('.app.is-mobile');data.chat.mobile=await exportDOM('#root > .app','chat-mobile');
 await page.setViewportSize({width:1100,height:700});await page.evaluate(()=>window.__websiteArtwork.mount('call'));await page.waitForSelector('.call-panel');data.call=await exportDOM('.call-panel','call');
 await page.evaluate(()=>window.__websiteArtwork.mount('profile'));await page.waitForSelector('.pcard');data.profile=await exportDOM('.pcard','profile');
 await writeFile(path.join(root,'website/native-previews.json'),JSON.stringify(data));
 console.log(JSON.stringify({mode:'selectable read-only HTML',chatBytes:Object.fromEntries(Object.entries(data.chat).map(([key,value])=>[key,Buffer.byteLength(value)])),callBytes:Buffer.byteLength(data.call),externalRequests:false,accountOrMediaSession:false}));
}finally{if(browser)await browser.close();await server.close();}
