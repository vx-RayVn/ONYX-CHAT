import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountDeletionHandler} from '../supabase/functions/_shared/account-deletion.ts';
import {deletionReauthenticated,guestDeletionSessionAllowed} from '../supabase/functions/_shared/deletion-reauth.ts';
const id='00000000-0040-4000-8000-000000000001',session='00000000-0040-4000-8000-000000000002',now=1800000000;
const jwt=(extra:any={})=>'header.'+Buffer.from(JSON.stringify({sub:id,session_id:session,role:'authenticated',is_anonymous:false,aal:'aal1',iat:now,amr:[{method:'password',timestamp:now-1}],...extra})).toString('base64url')+'.verified-by-getUser-in-fixture';
function fixture({registered=true,guest=false,authError=false,mfa=false,factorError=false}:any={}){
 const calls:string[]=[];
 const admin={auth:{getUser:async()=>{calls.push('getUser');return {data:{user:{id,is_anonymous:guest}},error:authError?Error('invalid signature'):null};},admin:{mfa:{listFactors:async()=>{calls.push('factors');return {data:{factors:mfa?[{status:'verified',factor_type:'totp'}]:[]},error:factorError?Error('offline'):null};}},deleteUser:async(user:string)=>{assert.equal(user,id);calls.push('delete');return {error:null};}}},
  rpc:async(name:string)=>{calls.push(name);return {data:name==='account_session_check'?registered:{owned_servers:[],media:['synthetic/avatar'],attachments:['synthetic/attachment']},error:null};},
  from:(name:string)=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{username:'synthetic'},error:null}),is:()=>({limit:async()=>({data:[],error:null})})})})}),
  storage:{from:(bucket:string)=>({remove:async()=>{calls.push('remove:'+bucket);return {error:null};}})}};
 const handler=createAccountDeletionHandler({admin:()=>admin,now:()=>now*1000,guestSessionAllowed:async(_token,userId)=>{assert.equal(userId,id);calls.push('guestRls');return guest;},closeBilling:async()=>{calls.push('billing');}});
 const send=(token=jwt())=>handler(new Request('https://synthetic.invalid/delete-account',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({username:'synthetic',guest:true})}));
 return {send,calls};
}
const mutations=(calls:string[])=>calls.filter(n=>n==='account_deletion_prepare'||n==='billing'||n==='delete'||n.startsWith('remove:'));
test('fresh password and email-code authentication allow deletion after the session gate',async()=>{
 for(const method of ['password','otp','magiclink']){const f=fixture();assert.equal((await f.send(jwt({amr:[{method,timestamp:now-10}]}))).status,200);assert.deepEqual(f.calls.slice(0,3),['getUser','account_session_check','factors']);assert.deepEqual(mutations(f.calls),['account_deletion_prepare','billing','remove:media','remove:attachments','delete']);}
});
test('old login, fresh token refresh, recovery and malformed AMR cannot delete or stop billing',async()=>{
 for(const amr of [[{method:'password',timestamp:now-601}],[{method:'password',timestamp:now-3600},{method:'token_refresh',timestamp:now}],[{method:'recovery',timestamp:now}],[{method:'password',timestamp:String(now)}],[{method:'password',timestamp:now+31}],[]]){
  const f=fixture(),response=await f.send(jwt({amr}));assert.equal(response.status,403);assert.equal((await response.json()).error,'reauthentication_required');assert.deepEqual(mutations(f.calls),[]);
 }
});
test('MFA requires both fresh primary authentication and a fresh second-factor AMR',async()=>{
 const primary={method:'password',timestamp:now-10};
 for(const claims of [{aal:'aal2',amr:[primary]},{aal:'aal2',amr:[primary,{method:'totp',timestamp:now-700}]},{aal:'aal2',amr:[primary,{method:'totp',timestamp:now-20}]},{aal:'aal1',amr:[primary,{method:'totp',timestamp:now}]}]){
  const f=fixture({mfa:true}),r=await f.send(jwt(claims));assert.equal(r.status,403);assert.equal((await r.json()).error,'reauthentication_required');assert.deepEqual(mutations(f.calls),[]);
 }
 for(const method of ['totp','mfa/totp']){const f=fixture({mfa:true});assert.equal((await f.send(jwt({aal:'aal2',amr:[primary,{method,timestamp:now-1}]}))).status,200);}
});
test('unknown MFA state and rejected signatures or sessions fail before destructive work',async()=>{
 for(const options of [{authError:true},{registered:false},{factorError:true}]){const f=fixture(options);assert((await f.send()).status>=400);assert.deepEqual(mutations(f.calls),[]);}
});
test('guests use a separately RLS-validated own guest profile; body guest flags grant nothing',async()=>{
 const guest=fixture({registered:false,guest:true});assert.equal((await guest.send(jwt({is_anonymous:true,amr:[]}))).status,200);assert(guest.calls.includes('guestRls'));assert(!guest.calls.includes('factors'));
 const registered=fixture();assert.equal((await registered.send(jwt({amr:[]}))).status,403);assert.deepEqual(mutations(registered.calls),[]);
 const revoked=fixture({registered:false});assert.equal((await revoked.send(jwt({is_anonymous:true,amr:[]}))).status,403);assert.deepEqual(mutations(revoked.calls),[]);
});
test('freshness has a bounded 10-minute window and never trusts a different subject',()=>{
 assert(deletionReauthenticated(jwt({amr:[{method:'password',timestamp:now-600}]}),id,false,false,now));
 assert(!deletionReauthenticated(jwt(), 'other',false,false,now));
 assert(!deletionReauthenticated('invalid',id,false,true,now));
});
test('guest exception needs the exact own protected profile and rejects missing or denied rows',async()=>{
 for(const response of [{data:{id,is_guest:true},error:null},{data:{id,is_guest:false},error:null},{data:{id:'other',is_guest:true},error:null},{data:null,error:null},{data:{id,is_guest:true},error:Error('session expired')}]){
  const caller={from:(table:string)=>{assert.equal(table,'profiles');return {select:(fields:string)=>{assert.equal(fields,'id,is_guest');return {eq:(column:string,value:string)=>{assert.equal(column,'id');assert.equal(value,id);return {maybeSingle:async()=>response};}};}};}};
  assert.equal(await guestDeletionSessionAllowed(caller,id),response.data?.id===id&&response.data?.is_guest===true&&!response.error);
 }
});
