import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
const me='28282828-2828-4282-8282-282828282801', peer='28282828-2828-4282-8282-282828282802';
const server='28282828-2828-4282-8282-282828282811', chat='28282828-2828-4282-8282-282828282821';
const stamp=new Date().toISOString();
type Row={id:string;channel_id:string|null;dm_id:string|null;author_id:string;content:string;created_at:string;type:string;reactions:{emoji:string;user_id:string}[]};
async function fixture(page:Page) {
 const state={revision:0,rows:[] as Row[],events:[] as {revision:number;id:string}[],sync:[] as any[],typing:[] as any[],joins:[] as any[],requests:[] as any[],allowed:true,hold:false,release:null as null|(()=>void),sockets:[] as {ws:WebSocketRoute;topics:Set<string>}[]};
 const user={id:me,aud:'authenticated',role:'authenticated',email:'rt-local@onyx.invalid',email_confirmed_at:stamp,created_at:stamp,app_metadata:{provider:'email',providers:['email']},user_metadata:{locale:'en'},factors:[]};
 const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const session={access_token:enc({alg:'HS256'})+'.'+enc({sub:me,role:'authenticated',aud:'authenticated',aal:'aal1',session_id:me,exp:Math.floor(Date.now()/1000)+3600})+'.'+enc('synthetic-local'),refresh_token:'synthetic-local-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 await page.addInitScript(session=>localStorage.setItem('onyx-auth',JSON.stringify(session)),session);
 await page.route('https://**',r=>r.fulfill({status:204}));
 await page.route('**/auth/v1/**',route=>route.fulfill({json:user}));
 await page.route('**/functions/v1/**',r=>r.fulfill({status:503,json:{error:'local_realtime_fixture'}}));
 await page.routeWebSocket(/\/realtime\/v1\/websocket/,ws=>{
  const socket={ws,topics:new Set<string>()};state.sockets.push(socket);
  ws.onMessage(raw=>{
   const msg=JSON.parse(String(raw)),array=Array.isArray(msg);
   const [joinRef,ref,topic,event,payload]=array?msg:[msg.join_ref,msg.ref,msg.topic,msg.event,msg.payload];
   const send=(event:string,payload:any)=>ws.send(JSON.stringify(array?[joinRef,ref,topic,event,payload]:{join_ref:joinRef,ref,topic,event,payload}));
   if(event==='phx_join'){socket.topics.add(topic);state.joins.push({topic,payload});send('phx_reply',{status:'ok',response:{postgres_changes:[]}});}
   else if(event==='phx_leave'){socket.topics.delete(topic);send('phx_reply',{status:'ok',response:{}});}
   else if(event==='heartbeat')send('phx_reply',{status:'ok',response:{}});
   else if(event==='broadcast')throw Error('Client attempted an untrusted broadcast');
  });
 });
 const wake=(event='messages',payload:any={})=>{for(const socket of state.sockets)for(const topic of socket.topics)if(topic==='realtime:onyx:server:'+server)socket.ws.send(JSON.stringify([null,null,topic,'broadcast',{event,payload,type:'broadcast'}]));};
 const change=(id:string,content:string|null)=>{
  state.revision++;state.events.push({revision:state.revision,id});
  const old=state.rows.find(r=>r.id===id);
  if(content===null)state.rows=state.rows.filter(r=>r.id!==id);
  else if(old)old.content=content;
  else state.rows.push({id,channel_id:chat,dm_id:null,author_id:peer,content,created_at:new Date(Date.now()+state.revision).toISOString(),type:'default',reactions:[]});
 };
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),table=new URL(req.url()).pathname.split('/').at(-1),body=req.postData()?req.postDataJSON():{};
  state.requests.push({table,body});
  if(table==='account_status')return route.fulfill({json:{admin:false,suspension:null}});
  if(table==='ensure_official_server')return route.fulfill({json:server});
  if(table==='profiles')return route.fulfill({json:[me,peer].map((id,i)=>({id,username:i?'localpeer':'localme',display_name:i?'Local Peer':'Local Me',status:'online',avatar_color:'#10b981',badges:[],member_number:900000028+i,created_at:stamp}))});
  if(table==='servers')return route.fulfill({json:[{id:server,name:'Local Realtime',owner_id:me,created_at:stamp}]});
  if(table==='channels')return route.fulfill({json:[{id:chat,server_id:server,name:'general',type:'text',position:0}]});
  if(table==='roles')return route.fulfill({json:[{id:server,server_id:server,name:'@everyone',is_default:true,position:0,permissions:['viewChannel','readHistory','sendMessages','addReactions']}]});
  if(table==='server_members')return route.fulfill({json:[me,peer].map(user_id=>({server_id:server,user_id,joined_at:stamp}))});
  if(table==='friendships')return route.fulfill({json:[{id:peer,requester_id:me,addressee_id:peer,status:'accepted',created_at:stamp,accepted_at:stamp}]});
  if(table==='recent_messages')return route.fulfill({json:state.rows});
  if(table==='presence_touch')return route.fulfill({json:null});
  if(table==='presence_snapshot')return route.fulfill({json:{[peer]:{status:'online',online:true}}});
  if(table==='typing_ping'){state.typing.push(body);return route.fulfill({json:null});}
  if(table==='message_sync'){
   state.sync.push(body);
   if(state.hold)await new Promise<void>(r=>state.release=r);
   return route.fulfill({json:body.p_scopes.map((s:any)=>{
    if(!state.allowed)return {id:s.id,dm:s.dm,allowed:false,rows:[],deleted:[]};
    const reset=s.cursor===null, events=state.events.filter(e=>e.revision>Number(s.cursor??0)).slice(0,200),changed=new Set(events.map(e=>e.id)),cursor=reset?state.revision:events.at(-1)?.revision??state.revision;
    const rows=state.rows.filter(r=>s.dm?r.dm_id===s.id:r.channel_id===s.id);
    return {id:s.id,dm:s.dm,allowed:true,reset,cursor:String(cursor),more:cursor<state.revision,rows:(reset?rows:rows.filter(r=>changed.has(r.id))).map(r=>({...r})),deleted:[...changed].filter(id=>!state.rows.some(r=>r.id===id))};
   })});
  }
  return route.fulfill({json:[]});
 });
 await page.goto('/app');
 await expect(page.locator('.app')).toBeVisible();
 await expect.poll(()=>state.sync.length).toBeGreaterThan(0);
 await page.evaluate(async({server,chat})=>{const {useStore}=await import('/src/store/store.ts');useStore.setState({view:{kind:'server',serverId:server,channelId:chat}});},{server,chat});
 await expect.poll(()=>state.joins.some(j=>j.topic==='realtime:onyx:server:'+server)).toBe(true);
 return {state,wake,change};
}
async function messages(page:Page){return page.evaluate(async chat=>{const {useStore}=await import('/src/store/store.ts');return useStore.getState().messages[chat]??[];},chat);}
test('scoped signals merge burst messages, edits, reactions and durable deletes exactly once',async({page})=>{
 const {state,wake,change}=await fixture(page);
 await page.waitForTimeout(200);const before=state.sync.length;
 for(let i=0;i<25;i++){change('28282828-2828-4282-8282-'+String(282828282900+i),'Burst '+i);wake();}
 await expect.poll(async()=>(await messages(page)).length).toBe(25);
 expect(state.sync.length-before).toBeLessThanOrEqual(2);
 const id=state.rows[0].id;change(id,'Edited');state.rows[0].reactions=[{emoji:'👍',user_id:peer}];wake();
 await expect.poll(async()=>(await messages(page)).find(m=>m.id===id)?.content).toBe('Edited');
 expect((await messages(page)).find(m=>m.id===id)?.reactions[0].userIds).toEqual([peer]);
 change(id,null);wake();await expect.poll(async()=>(await messages(page)).length).toBe(24);
 expect(state.joins.some(j=>j.topic==='realtime:onyx:presence')).toBe(false);
 expect(state.joins.flatMap(j=>j.payload.config?.postgres_changes??[]).some((v:any)=>['messages','reactions'].includes(v.table))).toBe(false);
});

test('a newly discovered DM keeps its first incoming message unread and notifies once',async({page})=>{
 const {state,change}=await fixture(page);await page.waitForTimeout(250);
 const dm='28282828-2828-4282-8282-282828282871',mid='28282828-2828-4282-8282-282828282872';
 change(mid,'First message in new DM');state.rows[0].channel_id=null;state.rows[0].dm_id=dm;
 await page.evaluate(async({dm,me,peer})=>{
  const {cloudHooks}=await import('/src/backend/bridge.ts');(window as any).incoming=[];
  cloudHooks.incomingMessage=(scope:string,id:string)=>(window as any).incoming.push([scope,id]);
  const {useStore}=await import('/src/store/store.ts');useStore.setState(s=>{s.dms[dm]={id:dm,type:'dm',participantIds:[me,peer],lastActivityAt:Date.now()};s.readState[dm]=Date.now();});
 },{dm,me,peer});
 await expect.poll(()=>page.evaluate(async dm=>{const {useStore}=await import('/src/store/store.ts');return useStore.getState().messages[dm]?.length??0;},dm)).toBe(1);
 expect(await page.evaluate(()=>(window as any).incoming)).toEqual([[dm,mid]]);
 const read=await page.evaluate(async dm=>{const {useStore}=await import('/src/store/store.ts');const s=useStore.getState();return {at:s.readState[dm],message:s.messages[dm][0].createdAt};},dm);expect(read.at).toBeLessThan(read.message);
});
test('presence hints fetch only changed relevant users and ignore unknown actors',async({page})=>{
 const {state,wake}=await fixture(page),other='28282828-2828-4282-8282-282828282898';
 await page.evaluate(async({other,peer})=>{const {useStore}=await import('/src/store/store.ts');useStore.setState(s=>{s.users[other]={...s.users[peer],id:other};s.relationships[other]={userId:other,type:'friend',since:Date.now()};});},{other,peer});
 await expect.poll(()=>state.requests.some(r=>r.table==='presence_snapshot'&&r.body.p_users.includes(other))).toBe(true);await page.waitForTimeout(250);
 const before=state.requests.filter(r=>r.table==='presence_snapshot').length;wake('presence',{user_id:peer});
 await expect.poll(()=>state.requests.filter(r=>r.table==='presence_snapshot').length).toBe(before+1);
 expect(state.requests.filter(r=>r.table==='presence_snapshot').at(-1).body.p_users).toEqual([peer]);
 wake('presence',{user_id:'28282828-2828-4282-8282-282828282897'});await page.waitForTimeout(250);
 expect(state.requests.filter(r=>r.table==='presence_snapshot').length).toBe(before+1);
});
test('many joined servers keep a bounded subscription set including the selected server',async({page})=>{
 const {state}=await fixture(page);
 const chosen=await page.evaluate(async server=>{const {useStore}=await import('/src/store/store.ts');const ids=Array.from({length:60},()=>crypto.randomUUID());useStore.setState(s=>{for(const id of ids)s.servers[id]={...s.servers[server],id,members:{}};s.serverOrder=[server,...ids];s.view={kind:'server',serverId:ids.at(-1)!,channelId:null};});return ids.at(-1)!;},server);
 await expect.poll(()=>state.joins.some(j=>j.topic==='realtime:onyx:server:'+chosen)).toBe(true);
 const active=new Set(state.sockets.flatMap(s=>[...s.topics]).filter(t=>t.startsWith('realtime:onyx:')));
 expect(active.size).toBeLessThanOrEqual(49);expect(active.has('realtime:onyx:inbox:'+me)).toBe(true);
});
test('online/focus catch-up retrieves events missed without any Broadcast',async({page})=>{
 const {change}=await fixture(page);await page.waitForTimeout(200);
 change('28282828-2828-4282-8282-282828282961','Missed while offline');
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(async()=>(await messages(page)).map(m=>m.content)).toEqual(['Missed while offline']);
});
test('fresh authorization denial removes cached message bodies',async({page})=>{
 const {state,wake,change}=await fixture(page);await page.waitForTimeout(200);
 change('28282828-2828-4282-8282-282828282962','Before removal');wake();
 await expect.poll(async()=>(await messages(page)).length).toBe(1);
 state.allowed=false;wake();await expect.poll(async()=>(await messages(page)).length).toBe(0);
});
test('late message responses cannot enter another account after stopping the session',async({page})=>{
 const {state,wake,change}=await fixture(page);await page.waitForTimeout(200);
 state.hold=true;change('28282828-2828-4282-8282-282828282963','Old account private body');wake();
 await expect.poll(()=>!!state.release).toBe(true);
 await page.evaluate(async()=>{const {stopCloud,clearCloudData}=await import('/src/backend/sync.ts');stopCloud();clearCloudData();const {useStore}=await import('/src/store/store.ts');useStore.setState({meId:'28282828-2828-4282-8282-282828282899'});});
 state.release!();await page.waitForTimeout(250);expect(await messages(page)).toEqual([]);
});
test('typing is published by RPC and only server-confirmed actors are displayed',async({page})=>{
 const {state,wake}=await fixture(page);
 await page.evaluate(async chat=>{const {sendTyping}=await import('/src/backend/typing.ts');sendTyping(chat);},chat);
 await expect.poll(()=>state.typing.length).toBe(1);expect(state.typing[0]).toEqual({p_scope:chat,p_dm:false});
 const topic='realtime:typing:v2:channel:'+chat;
 await expect.poll(()=>state.joins.some(j=>j.topic===topic)).toBe(true);
 for(const socket of state.sockets)if(socket.topics.has(topic))socket.ws.send(JSON.stringify([null,null,topic,'broadcast',{event:'typing',payload:{user_id:peer},type:'broadcast'}]));
 await expect.poll(()=>page.evaluate(async chat=>{const {useTypingStore}=await import('/src/backend/typing.ts');return Object.keys(useTypingStore.getState().typing[chat]??{});},chat)).toEqual([peer]);
 wake('presence');
 await expect.poll(()=>state.requests.some(r=>r.table==='presence_snapshot'&&r.body.p_users.includes(peer))).toBe(true);
});
