import type {Channel} from '../types';
/** Stable, contiguous positions in both affected groups; never crosses server boundaries. */
export function channelOrder(channels:Record<string,Channel>,id:string,categoryId:string|null,before:string|null){
  const source=channels[id];if(!source||before===id)return [];
  const target=before?channels[before]:null;
  if(before&&(!target||target.serverId!==source.serverId||target.categoryId!==categoryId))return [];
  const siblings=Object.values(channels).filter(c=>c.serverId===source.serverId&&c.categoryId===categoryId&&c.id!==id).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
  const at=before?siblings.findIndex(c=>c.id===before):siblings.length;if(at<0)return [];
  siblings.splice(at,0,{...source,categoryId});
  const result=siblings.map((c,position)=>({id:c.id,categoryId,position}));
  if(source.categoryId!==categoryId)Object.values(channels).filter(c=>c.serverId===source.serverId&&c.categoryId===source.categoryId&&c.id!==id).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id)).forEach((c,position)=>result.push({id:c.id,categoryId:source.categoryId,position}));
  return result.filter(p=>channels[p.id].position!==p.position||channels[p.id].categoryId!==p.categoryId);
}
