/** Node 22+: ONYX bot, no account login or token in frontend/source. Run: node examples/bot.mjs <bot-id> */
import {randomBytes} from 'node:crypto';
const bot=process.argv[2],base=process.env.ONYX_BOT_API??'https://your-project.supabase.co/functions/v1/bot-api';
if(!/^[a-f0-9-]{36}$/i.test(bot??''))throw new Error('Usage: node examples/bot.mjs <bot-id>');
async function request(route,{method='GET',data,token}={}){
 const res=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
 const body=await res.json();if(!res.ok&&res.status!==202)throw new Error(`${res.status}: ${body.error??'request failed'}`);return body;
}
const device=randomBytes(32).toString('hex');
const pairing=await request('/pair/start',{method:'POST',data:{bot_id:bot,device_code:device}});
console.log(`Open ${pairing.verification_uri}, sign in yourself and approve this bot using code ${pairing.user_code}.`);
let token;const deadline=Date.now()+pairing.expires_in*1000;
while(Date.now()<deadline){await new Promise(r=>setTimeout(r,3000));const state=await request('/pair/poll',{method:'POST',data:{device_code:device}});if(state.status==='approved'){token=state.token;break;}}
if(!token)throw new Error('Pairing expired');
// The token remains only in this process. Restarting requires a new pairing; revoke it from Developer settings.
await request('/commands',{method:'POST',token,data:{commands:[{name:'ping',description:'Check whether the bot can answer.'}]}});
console.log('Connected. Install this bot into selected server channels, then use its /ping command.');
let cursor='0';
while(true){
 try{
  const events=await request(`/events?after=${cursor}`,{token});
  for(const event of events){
   const response=event.command==='ping'?'Pong!':`Unknown command: ${event.command}`;
   // A stable nonce makes retrying this event safe; no duplicate response after a network retry.
   const nonce=event.id.padStart(32,'0').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
   await request('/messages',{method:'POST',token,data:{channel_id:event.channel_id,nonce,content:response}});
   cursor=event.id;
  }
 }catch(error){console.error(error.message);if(/401:|403:/.test(error.message))break;}
 await new Promise(r=>setTimeout(r,3000));
}
