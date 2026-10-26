import {useEffect,type RefObject} from 'react';
import {useUI} from '../store/ui';

/** Touch-only navigation. Drag in CSS, commit one store update on release. */
export function usePaneSwipe(ref:RefObject<HTMLDivElement|null>,enabled:boolean){
 useEffect(()=>{
  const el=ref.current;if(!enabled||!el)return;
  const app=el.closest<HTMLElement>('.app')!;
  type Drag={x:number;y:number;time:number;width:number;direction:number;panel:'main'|'nav';phase:'pending'|'horizontal';delta:number;origin:number;travel:number};
  let drag:Drag|null=null,frame=0,suppressUntil=0;
  const excluded=(target:EventTarget|null)=>{
   if(!(target instanceof Element))return true;
   if(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),video,audio,canvas,[role="slider"],[role="tablist"],[data-no-pane-swipe],.tabs,.chips,.vcontrols,.header-overflow'))return true;
   for(let node:Element|null=target;node&&node!==el;node=node.parentElement){
    const style=getComputedStyle(node);
    if(/auto|scroll/.test(style.overflowX)&&node.scrollWidth>node.clientWidth+1)return true;
   }
   return false;
  };
  const paint=()=>{frame=0;if(drag)app.style.setProperty('--pane-drag',`${drag.delta}px`);};
  const reset=()=>{cancelAnimationFrame(frame);frame=0;drag=null;app.style.removeProperty('--pane-drag');delete app.dataset.panning;};
  const start=(event:TouchEvent)=>{
   reset();suppressUntil=0;
   const ui=useUI.getState(),selection=window.getSelection();
   if(event.touches.length!==1||ui.modal||ui.settings||ui.mobileMembers||ui.search||selection&&!selection.isCollapsed||excluded(event.target))return;
   if(document.activeElement?.matches('input,textarea,[contenteditable="true"]'))return;
   const point=event.touches[0],rect=el.getBoundingClientRect();
   // Leave OS/browser edge navigation and back/forward gestures untouched.
   if(point.clientX<rect.left+24||point.clientX>rect.right-24)return;
   drag={x:point.clientX,y:point.clientY,time:performance.now(),width:rect.width,direction:document.documentElement.dir==='rtl'?-1:1,panel:ui.mobilePanel,phase:'pending',delta:0,origin:0,travel:0};
  };
  const move=(event:TouchEvent)=>{
   if(!drag)return;
   if(event.touches.length!==1||window.getSelection()?.isCollapsed===false){reset();return;}
   const point=event.touches[0],dx=point.clientX-drag.x,dy=point.clientY-drag.y;
   if(drag.phase==='pending'){
    if(Math.abs(dy)>10&&Math.abs(dy)>=Math.abs(dx)){reset();return;}
    if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.35)return;
    if((drag.panel==='main'&&dx*drag.direction<0)||(drag.panel==='nav'&&dx*drag.direction>0)){reset();return;}
    // Pick up a still-running transition at its current position. A quick
    // reverse swipe must not jump to the previous animation's destination.
    const main=el.querySelector<HTMLElement>('.main');
    drag.origin=main?(main.getBoundingClientRect().left-el.getBoundingClientRect().left)*drag.direction:drag.panel==='nav'?drag.width:0;
    drag.phase='horizontal';app.dataset.panning='true';
   }
   if(event.cancelable)event.preventDefault();
   const base=drag.panel==='nav'?drag.width:0;
   drag.travel=dx*drag.direction;
   drag.delta=Math.max(0,Math.min(drag.width,drag.origin+drag.travel))-base;
   if(!frame)frame=requestAnimationFrame(paint);
  };
  const end=()=>{
   if(!drag)return;
   if(drag.phase==='horizontal'){
    const distance=Math.max(0,drag.travel*(drag.panel==='main'?1:-1)),speed=distance/Math.max(1,performance.now()-drag.time);
    if(distance>Math.min(80,drag.width*.22)||distance>28&&speed>.45)useUI.getState().setMobilePanel(drag.panel==='main'?'nav':'main');
    suppressUntil=performance.now()+400;
   }
   reset();
  };
  const cancel=()=>{if(drag?.phase==='horizontal')suppressUntil=performance.now()+400;reset();};
  const click=(event:MouseEvent)=>{if(event.detail>0&&performance.now()<suppressUntil){suppressUntil=0;event.preventDefault();event.stopPropagation();}};
  el.addEventListener('touchstart',start,{passive:true});el.addEventListener('touchmove',move,{passive:false});el.addEventListener('touchend',end);el.addEventListener('touchcancel',cancel);el.addEventListener('click',click,true);
  window.addEventListener('resize',cancel);
  return()=>{reset();el.removeEventListener('touchstart',start);el.removeEventListener('touchmove',move);el.removeEventListener('touchend',end);el.removeEventListener('touchcancel',cancel);el.removeEventListener('click',click,true);window.removeEventListener('resize',cancel);};
 },[ref,enabled]);
}
