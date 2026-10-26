/** Don't mount interactive UI with a rejected or incomplete production stylesheet. */
export async function prepareAppStyles(){
  const links=[...document.querySelectorAll<HTMLLinkElement>('link[data-onyx-app-style]')];
  for(const original of links){
    // sheet can already exist while a failed/pending response is being parsed.
    // Only the verified load event is evidence that the stylesheet is ready.
    if(original.dataset.onyxStyleState==='ready')continue;
    if(original.dataset.onyxStyleState!=='error'){
      const ready=await new Promise<boolean>(resolve=>{
        const finish=(ok:boolean)=>{clearTimeout(timer);original.removeEventListener('load',success);original.removeEventListener('error',failure);resolve(ok);};
        const success=()=>finish(true),failure=()=>finish(false),timer=setTimeout(failure,8000);
        original.addEventListener('load',success);original.addEventListener('error',failure);
        if(original.dataset.onyxStyleState==='ready')finish(true);else if(original.dataset.onyxStyleState==='error')finish(false);
      });
      if(ready)continue;
    }
    let loaded=false;
    for(let attempt=1;attempt<=2&&!loaded;attempt++){
      const replacement=original.cloneNode() as HTMLLinkElement;
      delete replacement.dataset.onyxStyleState;
      const url=new URL(original.href);url.searchParams.set('onyx-style-retry',`${Date.now()}-${attempt}`);replacement.href=url.href;
      loaded=await new Promise<boolean>(resolve=>{
        const finish=(ok:boolean)=>{clearTimeout(timer);replacement.onload=replacement.onerror=null;if(!ok)replacement.remove();resolve(ok);};
        const timer=setTimeout(()=>finish(false),8000);
        replacement.onload=()=>{replacement.dataset.onyxStyleState='ready';finish(!!replacement.sheet);};replacement.onerror=()=>{replacement.dataset.onyxStyleState='error';finish(false);};
        original.after(replacement);
      });
      if(loaded)original.remove();
    }
    if(!loaded)throw new Error('App stylesheet unavailable');
  }
}
