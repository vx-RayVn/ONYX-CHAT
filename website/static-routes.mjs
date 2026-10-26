/** Physical app entries for static hosts; server.js keeps its existing dynamic routing. */
import{readFile,mkdir,writeFile}from'node:fs/promises';
import path from'node:path';
import{pathToFileURL}from'node:url';
export const staticAppEntries=['app','login','signup','settings','channels'];
export async function writeStaticAppEntries(directory='dist'){
 const app=await readFile(path.join(directory,'app.html'),'utf8');
 for(const route of staticAppEntries){const target=path.join(directory,route);await mkdir(target,{recursive:true});await writeFile(path.join(target,'index.html'),app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){await writeStaticAppEntries();console.log('Static hosts: app, login and signup entries preserved.');}
