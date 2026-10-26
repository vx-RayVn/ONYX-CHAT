import test from 'node:test';
import assert from 'node:assert/strict';
import {accountSessionAllowed} from '../supabase/functions/_shared/account-session.ts';
const user='00000000-0000-4000-8000-000000000001',session='15151515-1515-4151-8151-151515151501';
const jwt=(claims:Record<string,unknown>)=>'header.'+Buffer.from(JSON.stringify({sub:user,session_id:session,role:'authenticated',aal:'aal1',...claims})).toString('base64url')+'.verified-by-auth-first';
test('privileged functions check fresh server-side session and MFA state after Auth validation',async()=>{
 const calls:any[]=[];const rpc=async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:true,error:null};};
 assert.equal(await accountSessionAllowed(jwt({}),user,rpc),true);assert.deepEqual(calls,[{name:'account_session_check',args:{p_user:user,p_session:session,p_aal:'aal1'}}]);
});
test('claims from another actor, capability token or missing session never reach privileged RPCs',async()=>{
 let calls=0;const rpc=async()=>{calls++;return {data:true,error:null};};
 for(const token of['invalid',jwt({sub:'other'}),jwt({role:'anon'}),jwt({session_id:null}),jwt({session_id:'not-a-session'})])assert.equal(await accountSessionAllowed(token,user,rpc),false);
 assert.equal(calls,0);
});
test('unverified, revoked and unavailable session checks fail closed, including AAL2 tokens',async()=>{
 for(const response of[{data:false,error:null},{data:null,error:{message:'mfa_required'}},{data:true,error:{message:'database unavailable'}}])assert.equal(await accountSessionAllowed(jwt({aal:'aal2'}),user,async()=>response),false);
 assert.equal(await accountSessionAllowed(jwt({}),user,async()=>{throw Error('offline');}),false);
});
