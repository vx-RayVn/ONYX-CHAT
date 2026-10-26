import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {useStore} from '../store/store';
import {canServer} from '../store/selectors';
type Target={category:string|null;before:string|null;row:string|null;after:boolean};
export function useChannelReorder(serverId:string){
  const [drag,setDrag]=useState<{id:string;target:Target|null}|null>(null);
  const active=useRef<{id:string;x:number;y:number;startX:number;startY:number;moved:boolean;target:Target|null}|null>(null),frame=useRef(0);
  const stop=()=>{cancelAnimationFrame(frame.current);active.current=null;setDrag(null);};
  useEffect(()=>stop,[serverId]);
  const hit=(a:NonNullable<typeof active.current>)=>{
    const element=document.elementFromPoint(a.x,a.y),row=element?.closest<HTMLElement>('[data-reorder-channel]'),group=element?.closest<HTMLElement>('[data-reorder-category]');
    const s=useStore.getState();let target:Target|null=null;
    if(row){const c=s.channels[row.dataset.reorderChannel!];if(c?.serverId===serverId&&c.id!==a.id){const after=a.y>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;const siblings=Object.values(s.channels).filter(p=>p.serverId===serverId&&p.categoryId===c.categoryId&&p.id!==a.id).sort((x,y)=>x.position-y.position||x.id.localeCompare(y.id));target={category:c.categoryId,before:after?siblings[siblings.findIndex(p=>p.id===c.id)+1]?.id??null:c.id,row:c.id,after};}}
    else if(group)target={category:group.dataset.reorderCategory||null,before:null,row:null,after:false};
    return target;
  };
  const tick=()=>{
    const a=active.current;if(!a?.moved)return;
    const target=hit(a);
    if(JSON.stringify(a.target)!==JSON.stringify(target)){a.target=target;setDrag({id:a.id,target});}
    const scroll=document.querySelector<HTMLElement>('.sidebar-scroll');if(scroll){const b=scroll.getBoundingClientRect();if(a.x>=b.left&&a.x<=b.right){if(a.y<b.top+48)scroll.scrollTop-=10;else if(a.y>b.bottom-48)scroll.scrollTop+=10;}}
    frame.current=requestAnimationFrame(tick);
  };
  const start=(e:React.PointerEvent,id:string)=>{
    if(e.button!==0||!canServer(useStore.getState(),serverId,'manageChannels'))return;
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    active.current={id,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,target:null};
  };
  const move=(e:React.PointerEvent)=>{
    const a=active.current;if(!a)return;e.preventDefault();e.stopPropagation();a.x=e.clientX;a.y=e.clientY;
    if(!a.moved&&Math.hypot(a.x-a.startX,a.y-a.startY)>5){a.moved=true;setDrag({id:a.id,target:null});frame.current=requestAnimationFrame(tick);}
  };
  const end=(e:React.PointerEvent)=>{
    const a=active.current;if(!a)return;e.preventDefault();e.stopPropagation();
    a.x=e.clientX;a.y=e.clientY;const target=hit(a);
    if(a.moved&&target)useStore.getState().reorderChannel(a.id,target.category,target.before);
    stop();
  };
  return {drag,start,move,end,cancel:stop};
}
export const ChannelDragContext=createContext<ReturnType<typeof useChannelReorder>|null>(null);
export const useChannelDrag=()=>useContext(ChannelDragContext);
