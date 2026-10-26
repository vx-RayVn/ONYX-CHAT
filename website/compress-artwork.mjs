/** Lossless-layout export: only encode genuine UI captures, never redraw them. */
import{readFile,writeFile,unlink}from'node:fs/promises';
export async function compressArtwork(page,directory){
 for(const name of['chat-desktop','chat-mobile','call']){
  const png=await readFile(directory+'/'+name+'.png');
  const webp=await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/webp',.96).split(',')[1];},png.toString('base64'));
  await writeFile(directory+'/'+name+'.webp',Buffer.from(webp,'base64'));await unlink(directory+'/'+name+'.png');
 }
}
