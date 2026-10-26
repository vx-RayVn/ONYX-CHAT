// Selectable product HTML, isolated from the actual account and application.
const catalogueUrl='__ONYX_CATALOG_URL__';
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)'),nativeViews=[],ambientViews=[],motionUpdates=[];
function watch(element,callback,options){if(!element)return;if('IntersectionObserver'in window)new IntersectionObserver(entries=>callback(entries[0].isIntersecting),options).observe(element);else callback(true);}
function updateMotion(){for(const view of nativeViews)view.host.toggleAttribute('data-offscreen',!view.visible||document.hidden||reducedMotion.matches);for(const view of ambientViews)view.host.toggleAttribute('data-paused',!view.visible||document.hidden||reducedMotion.matches);for(const update of motionUpdates)update();}
document.querySelectorAll('[data-native]').forEach(host=>{
 const view={host,visible:false};nativeViews.push(view);watch(host,visible=>{view.visible=visible;updateMotion();},{rootMargin:'80px'});
 host.addEventListener('submit',event=>event.preventDefault());
});
document.querySelectorAll('[data-ambient]').forEach(host=>{const view={host,visible:false};ambientViews.push(view);watch(host,visible=>{view.visible=visible;updateMotion();});});
document.addEventListener('visibilitychange',updateMotion);
if(reducedMotion.addEventListener)reducedMotion.addEventListener('change',updateMotion);else reducedMotion.addListener(updateMotion);
updateMotion();
// Illustrative call only: one visible-page clock, no audio or media connection.
const callView=nativeViews.find(view=>view.host.dataset.kind==='call');
if(callView){
 const timer=callView.host.querySelector('.call-time'),tiles=[...callView.host.querySelectorAll('.vtile')];let timeout,startedAt;
 timer.setAttribute('role','timer');timer.setAttribute('aria-label','Example call duration');timer.setAttribute('aria-live','off');
 const clearSpeakers=()=>tiles.forEach(tile=>{tile.classList.remove('is-speaking');tile.querySelector('.avatar')?.classList.remove('is-speaking');});
 function syncCall(){clearTimeout(timeout);clearSpeakers();if(!callView.visible||document.hidden)return;startedAt??=performance.now();
  function tick(){const elapsed=Math.floor((performance.now()-startedAt)/1000),seconds=732+elapsed;timer.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');const beat=elapsed%16,speaker=reducedMotion.matches?-1:beat<4?0:beat>=7&&beat<12?1:-1;tiles.forEach((tile,index)=>{tile.classList.toggle('is-speaking',index===speaker);tile.querySelector('.avatar')?.classList.toggle('is-speaking',index===speaker);});timeout=setTimeout(tick,1000);}
  tick();
 }
 motionUpdates.push(syncCall);window.addEventListener('pagehide',()=>{clearTimeout(timeout);clearSpeakers();});window.addEventListener('pageshow',updateMotion);syncCall();
}
const profileHost=document.querySelector('.profile-host');
if(profileHost){
 const shadow=profileHost,root=shadow.querySelector('.native-root'),initial=root.innerHTML,choices=document.querySelector('.custom-choices'),select=document.querySelector('[data-custom-select]'),tabs=[...document.querySelectorAll('[data-category]')],panel=document.querySelector('#custom-panel'),status=document.querySelector('[data-profile-status]'),retry=document.querySelector('[data-preview-retry]');
 let data,pending,category='banner',current={};
 const labels={banner:'Choose a banner',effect:'Choose an effect',frame:'Choose a frame',decoration:'Choose an avatar decoration',name:'Choose a name style'};
 function replace(selector,html,parent){const old=shadow.querySelector(selector);if(old)old.outerHTML=html;else shadow.querySelector(parent).insertAdjacentHTML('beforeend',html);}
 const looks={original:null,aurora:{banner:'emerald-aurora',effect:'aurora-veil',frame:'celestial-frame',decoration:'orbit',name:'emerald-glow'},synthwave:{banner:'synthwave',effect:'shooting-stars',frame:'plasma-frame',decoration:'neon-ears',name:'velocity'}};
 const markLook=id=>document.querySelectorAll('[data-look]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.look===id)));
 function apply(item,type=category){const selectors={banner:['.pcard-banner .banner','.pcard-banner'],effect:['.pcard > .profile-effect','.pcard'],frame:['.pcard > .pframe','.pcard'],decoration:['.pcard-avatar .avatar-deco','.pcard-avatar .avatar'],name:['.pcard-name > .display-name','.pcard-name']};replace(...[selectors[type][0],item.html,selectors[type][1]]);current[type]=item.id;if(type===category){select.value=item.id;choices.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.choice===item.id)));}markLook('');status.textContent=item.label+' selected';}
 function renderChoices(){if(!data)return;choices.replaceChildren();select.replaceChildren();choices.setAttribute('aria-label',labels[category]);select.setAttribute('aria-label',labels[category]);for(const item of data.catalogue[category]){const option=new Option(item.label,item.id);option.selected=item.id===current[category];select.add(option);const button=document.createElement('button');button.type='button';button.className='custom-choice';button.dataset.choice=item.id;button.textContent=item.label;button.setAttribute('aria-pressed',String(item.id===current[category]));button.addEventListener('click',()=>apply(item));choices.append(button);}select.disabled=false;}
 async function load(){if(data)return;if(pending)return pending;pending=(async()=>{try{const response=await fetch(catalogueUrl);if(!response.ok)throw Error('preview');data=await response.json();current={...data.defaults};renderChoices();retry.hidden=true;document.querySelector('.custom-options').dataset.ready='true';}catch{retry.hidden=false;status.textContent='Reload the profile preview to try again.';}finally{pending=null;}})();return pending;}
 function selectTab(tab){category=tab.dataset.category;tabs.forEach(item=>{const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;});panel.setAttribute('aria-labelledby',tab.id);renderChoices();if(!data)load();}
 tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{let target;if(event.key==='ArrowRight')target=(index+1)%tabs.length;if(event.key==='ArrowLeft')target=(index+tabs.length-1)%tabs.length;if(event.key==='Home')target=0;if(event.key==='End')target=tabs.length-1;if(target!==undefined){event.preventDefault();selectTab(tabs[target]);tabs[target].focus();}});});
 select.addEventListener('change',()=>{const item=data?.catalogue[category].find(item=>item.id===select.value);if(item)apply(item);});
 function reset(){root.innerHTML=initial;current={...data.defaults};renderChoices();markLook('original');status.textContent='rayvn’s profile restored';}
 document.querySelectorAll('[data-look]').forEach(button=>button.addEventListener('click',async()=>{await load();if(!data)return;reset();const look=looks[button.dataset.look];if(look)for(const[type,id]of Object.entries(look)){const item=data.catalogue[type].find(item=>item.id===id);if(item)apply(item,type);}renderChoices();markLook(button.dataset.look);status.textContent=button.textContent.trim()+' look selected';}));
 document.querySelector('[data-reset]').addEventListener('click',async()=>{await load();if(data)reset();});
 retry.addEventListener('click',load);watch(profileHost,visible=>{if(visible)load();},{rootMargin:'250px'});
}
