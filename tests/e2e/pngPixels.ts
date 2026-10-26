import {inflateSync} from 'node:zlib';

/** Read lossless browser screenshots without a production image dependency. */
export function pngPixels(bytes:Buffer){
 let width=0,height=0,channels=0;const chunks:Buffer[]=[];
 for(let offset=8;offset<bytes.length;){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);if(data[8]!==8||![2,6].includes(data[9])||data[12]!==0)throw Error('Unsupported screenshot format');channels=data[9]===6?4:3;}if(type==='IDAT')chunks.push(data);offset+=length+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(stride*height);
 const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)],start=y*stride;for(let x=0;x<stride;x++){const a=x>=channels?pixels[start+x-channels]:0,b=y?pixels[start+x-stride]:0,c=y&&x>=channels?pixels[start+x-stride-channels]:0;const predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):NaN;if(!Number.isFinite(predict))throw Error('Unsupported PNG filter');pixels[start+x]=(raw[y*(stride+1)+1+x]+predict)&255;}}
 return (x:number,y:number)=>{if(x<0||y<0||x>=width||y>=height)throw Error('Pixel outside screenshot');const p=(y*width+x)*channels;return [pixels[p],pixels[p+1],pixels[p+2],channels===4?pixels[p+3]:255].join(',');};
}
