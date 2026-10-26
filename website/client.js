// Public website only. No account session or application runtime.
document.documentElement.classList.add('js');
const header=document.querySelector('.site-header'),toggle=document.querySelector('.nav-toggle'),nav=document.querySelector('.nav-links'),highlight=document.querySelector('.nav-highlight');
function closeMenu(){header?.removeAttribute('data-menu');toggle?.setAttribute('aria-expanded','false');}
toggle?.addEventListener('click',()=>{const open=header?.dataset.menu!=='open';if(header)header.dataset.menu=open?'open':'';toggle.setAttribute('aria-expanded',String(open));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&header?.dataset.menu==='open'){closeMenu();toggle?.focus();}});
function moveHighlight(link){if(!link||!nav||!highlight){highlight?.classList.remove('visible');return;}const rect=link.getBoundingClientRect(),parent=nav.getBoundingClientRect();highlight.style.width=rect.width+'px';highlight.style.transform=`translateX(${rect.left-parent.left}px)`;highlight.classList.add('visible');}
document.querySelectorAll('.nav-links a').forEach(link=>{link.addEventListener('click',closeMenu);for(const event of['pointerenter','focus'])link.addEventListener(event,()=>moveHighlight(link));});
nav?.addEventListener('pointerleave',()=>moveHighlight(nav.querySelector('[aria-current]')));
nav?.addEventListener('focusout',event=>{if(!nav.contains(event.relatedTarget))moveHighlight(nav.querySelector('[aria-current]'));});
if('IntersectionObserver'in window)new IntersectionObserver(entries=>header?.classList.toggle('is-scrolled',!entries[0].isIntersecting)).observe(document.querySelector('.scroll-sentinel'));else header?.classList.add('is-scrolled');
window.addEventListener('resize',()=>{if(innerWidth>1000)closeMenu();moveHighlight(nav?.querySelector('[aria-current]'));},{passive:true});
moveHighlight(nav?.querySelector('[aria-current]'));
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
 const code=button.closest('.code-block')?.querySelector('code')?.textContent;if(!code)return;const label=button.querySelector('span');
 try{await navigator.clipboard.writeText(code);if(label)label.textContent='Copied';}
 catch{if(label)label.textContent='Select code to copy';const selection=getSelection(),range=document.createRange();range.selectNodeContents(button.closest('.code-block').querySelector('code'));selection?.removeAllRanges();selection?.addRange(range);}
 setTimeout(()=>{if(label)label.textContent='Copy';},2500);
}));
