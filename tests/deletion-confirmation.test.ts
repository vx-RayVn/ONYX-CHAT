import test from 'node:test';
import assert from 'node:assert/strict';
import {DeletionReauth,deletionSignInMethod} from '../src/lib/deletionReauth.ts';
const id='00000000-0040-4000-8000-000000000011';
const token=(method='password')=>'h.'+Buffer.from(JSON.stringify({amr:[{method,timestamp:1}]})).toString('base64url')+'.synthetic';
function fixture({method='password',mfa=false,wrongUser=false}:any={}){
 const calls:any[]=[],session={user:{id,email:'synthetic@example.invalid'},access_token:'synthetic_fresh_deletion_token'};
 let active:string|null=id;
 const reply=async(name:string,input?:any)=>{calls.push({name,input});return {error:null,data:{session}};};
 const client={auth:{signInWithPassword:(input:any)=>reply('password',input),signInWithOtp:(input:any)=>reply('sendEmail',input),verifyOtp:(input:any)=>reply('emailCode',input),getUser:async()=>({error:null,data:{user:{id:wrongUser?'other':id}}}),getSession:async()=>({error:null,data:{session}}),mfa:{listFactors:async()=>({error:null,data:{all:mfa?[{id:'factor',factor_type:'totp',status:'verified',friendly_name:'Synthetic factor'}]:[]}}),challengeAndVerify:(input:any)=>reply('mfa',input)},signOut:(input:any)=>reply('signOut',input),dispose:()=>reply('dispose')}};
 const flow=new DeletionReauth(client as any,{user:{id,email:'synthetic@example.invalid'},access_token:token(method)} as any,()=>active);
 return {flow,calls,session,switchAccount:()=>{active='other';}};
}
test('password confirmation stays isolated and cleans up only the temporary session',async()=>{
 const f=fixture();assert.throws(()=>f.flow.getProof());await f.flow.password('synthetic-password','synthetic-captcha');assert.equal(f.flow.step,'ready');assert.deepEqual(f.flow.getProof(),{userId:id,accessToken:f.session.access_token});
 await f.flow.dispose();assert.deepEqual(f.calls.find(c=>c.name==='signOut').input,{scope:'local'});assert.throws(()=>f.flow.getProof());assert(!f.calls.some(c=>c.name==='setSession'));
});
test('email confirmation never creates accounts and requires verification of the code',async()=>{
 const f=fixture({method:'otp'});assert.equal(f.flow.step,'email');await f.flow.sendEmail('synthetic-captcha');assert.equal(f.flow.step,'email-code');assert.throws(()=>f.flow.getProof());
 const options=f.calls.find(c=>c.name==='sendEmail').input.options;assert.equal(options.shouldCreateUser,false);await f.flow.emailCode('12345678');assert.equal(f.flow.step,'ready');await f.flow.dispose();
});
test('a verified MFA factor always requires a new challenge, even if primary login returned a session',async()=>{
 const f=fixture({mfa:true});await f.flow.password('synthetic-password','synthetic-captcha');assert.equal(f.flow.step,'mfa');assert.throws(()=>f.flow.getProof());await assert.rejects(()=>f.flow.mfa('other','123456'));assert(!f.calls.some(c=>c.name==='mfa'));
 await f.flow.mfa('factor','123456');assert.equal(f.flow.step,'ready');assert.equal(f.calls.filter(c=>c.name==='mfa').length,1);await f.flow.dispose();
});
test('foreign identities and account switches never yield a deletion token',async()=>{
 const wrong=fixture({wrongUser:true});await assert.rejects(()=>wrong.flow.password('synthetic-password','synthetic-captcha'),/account_changed/);assert.throws(()=>wrong.flow.getProof());await wrong.flow.dispose();
 const switched=fixture();await switched.flow.password('synthetic-password','synthetic-captcha');switched.switchAccount();assert.throws(()=>switched.flow.getProof(),/account_changed/);await switched.flow.dispose();
});
test('only the last supported primary method guides the UI; refresh and metadata are not proof',()=>{
 assert.equal(deletionSignInMethod(token('password')),'password');assert.equal(deletionSignInMethod(token('otp')),'email');assert.equal(deletionSignInMethod(token('token_refresh')),'email');assert.equal(deletionSignInMethod('invalid'),'email');
});
