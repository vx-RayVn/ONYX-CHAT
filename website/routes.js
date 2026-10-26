/** Shared public routing. No app imports: the marketing pages stay independent of chat/voice. */
export const publicPages = ['developers','guidelines','bugs','safety','privacy','open-source','download','roadmap'];
export const reservedPaths = new Set([...publicPages,'app','app.html','login','signup','channels','settings']);
export function publicPage(pathname) {
 const path=pathname.replace(/\/+$/,'')||'/';
 return path==='/'?'home':publicPages.includes(path.slice(1))?path.slice(1):null;
}
export function appLocation(url) {
 const path=url.pathname.replace(/\/+$/,'');
 return ['/app','/app.html','/login','/signup','/channels','/settings'].includes(path)||path===''&&['developer','settings','code','token_hash','type','error','error_code','error_description'].some(key=>url.searchParams.has(key));
}
