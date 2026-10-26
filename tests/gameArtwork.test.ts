import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {sanitizeGameArtwork} from '../supabase/functions/_shared/game-artwork.ts';
import {createActivityHandler} from '../supabase/functions/_shared/activity-handler.ts';
function crc(bytes:Uint8Array){let v=0xffffffff;for(const b of bytes){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return (v^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(type,4);b.set(data,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function png({width=96,height=96,meta=false,raw=Buffer.alloc(height*(width*4+1)),interlace=0}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;header[12]=interlace;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(meta?[chunk('tEXt',Buffer.from('path\0C:\\private\\game.exe'))]:[]),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
test('small game icons are valid static PNGs and metadata is removed',async()=>{
 const clean=await sanitizeGameArtwork(png({meta:true}).toString('base64'));assert.equal(clean,png().toString('base64'));assert.ok(!Buffer.from(clean,'base64').includes(Buffer.from('private')));
});
test('artwork rejects SVG, URLs, bad checksums and oversized input',async()=>{
 const damaged=png();damaged[damaged.length-1]^=1;
 for(const value of ['https://evil.invalid/image.png','data:image/svg+xml,<svg/>','iVBORw0KGgo'+'A'.repeat(44000),damaged.toString('base64')])await assert.rejects(()=>sanitizeGameArtwork(value));
});
test('PNG dimensions, interlacing, row filters and decompressed length are bounded',async()=>{
 for(const bytes of [png({width:129}),png({interlace:1}),png({raw:Buffer.from([5,...Array(96*(96*4+1)-1).fill(0)])}),png({raw:Buffer.alloc(200000)}),Buffer.concat([png(),Buffer.from('trailing')])])await assert.rejects(()=>sanitizeGameArtwork(bytes.toString('base64')));
});
test('icons use the same device authentication and never introduce URL fetching',async()=>{
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const handler=createActivityHandler({env:()=>'',user:async()=>null,rpc:async(name,args)=>{calls.push({name,args});return {data:{enabled:true,artwork_hash:'a'.repeat(32)},error:null};},fetcher:async()=>{throw Error('unexpected external fetch');}});
 const send=(artwork:unknown,token='onyx_activity_'+'a'.repeat(64))=>handler(new Request('https://project.invalid/functions/v1/activity/publish',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({title:'Fortnite',key:'epic:Fortnite',artwork})}));
 assert.equal((await send(png({meta:true}).toString('base64'))).status,200);assert.equal(calls[0].name,'activity_publish_artwork');assert.equal(calls[0].args.p_artwork,png().toString('base64'));
 assert.equal((await send('https://evil.invalid')).status,400);assert.equal((await send(png().toString('base64'),'normal-session')).status,401);assert.equal(calls.length,1);
});
test('large artwork request bodies are rejected before a database call',async()=>{
 const handler=createActivityHandler({env:()=>'',user:async()=>null,rpc:async()=>{throw Error('unexpected database call');}});
 const response=await handler(new Request('https://project.invalid/functions/v1/activity/publish',{method:'POST',body:JSON.stringify({artwork:'a'.repeat(47000)})}));assert.equal(response.status,413);
});
