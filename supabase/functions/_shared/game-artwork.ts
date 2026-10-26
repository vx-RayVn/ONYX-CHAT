// Accept tiny static PNG icons only. Rebuild without filenames, text, EXIF or other metadata.
const signature=[137,80,78,71,13,10,26,10];
function crc(bytes:Uint8Array){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
export async function sanitizeGameArtwork(value:unknown):Promise<string>{
 if(typeof value!=='string'||value.length>43692||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('invalid artwork');
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(bytes.length>32768||signature.some((b,i)=>bytes[i]!==b))throw Error('invalid artwork');
 const view=new DataView(bytes.buffer),chunks:Uint8Array[]=[],compressed:Uint8Array[]=[];let offset=8,width=0,height=0,channels=0,ended=false,count=0;
 while(offset+12<=bytes.length){
  if(++count>32)throw Error('invalid artwork');const size=view.getUint32(offset),end=offset+12+size;if(end>bytes.length)throw Error('invalid artwork');
  const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8)),data=bytes.subarray(offset+8,offset+8+size);
  if(crc(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4))throw Error('invalid artwork');
  if(type==='IHDR'){
   if(offset!==8||size!==13)throw Error('invalid artwork');width=view.getUint32(offset+8);height=view.getUint32(offset+12);channels=data[9]===6?4:data[9]===2?3:0;
   if(!width||!height||width>128||height>128||!channels||data[8]!==8||data[10]||data[11]||data[12])throw Error('invalid artwork');
  }else if(!width)throw Error('invalid artwork');
  else if(type==='IDAT')compressed.push(data);
  else if(type==='IEND'){if(size||end!==bytes.length)throw Error('invalid artwork');ended=true;}
  else if(type[0]===type[0].toUpperCase())throw Error('invalid artwork');
  if(['IHDR','IDAT','IEND'].includes(type))chunks.push(bytes.subarray(offset,end));offset=end;
 }
 if(!ended||!compressed.length)throw Error('invalid artwork');
 const packed=new Uint8Array(compressed.reduce((n,p)=>n+p.length,0));let at=0;for(const part of compressed){packed.set(part,at);at+=part.length;}
 const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),expected=height*(width*channels+1);let total=0;
 try{while(true){const part=await reader.read();if(part.done)break;for(let i=0;i<part.value.length;i++)if((total+i)%(width*channels+1)===0&&part.value[i]>4)throw Error('invalid artwork');total+=part.value.length;if(total>expected)throw Error('invalid artwork');}}finally{await reader.cancel().catch(()=>{});}
 if(total!==expected)throw Error('invalid artwork');
 const clean=new Uint8Array(8+chunks.reduce((n,c)=>n+c.length,0));clean.set(signature);at=8;for(const chunk of chunks){clean.set(chunk,at);at+=chunk.length;}
 return btoa(String.fromCharCode(...clean));
}
