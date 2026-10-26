import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const locales=['ar','de','es','fr','it','ja','ko','nl','pl','pt-BR','ru','tr','uk','zh-CN'];
const strings={};
const nativeKeys=new Set(['Game activity','Registered games','Remove','Disconnect','Connect','Pause','Resume','Add game','Open ONYX','Close','Confirm this code in ONYX.','Connection interrupted','Connected','Activity paused','No game detected','Name','Save','Cancel','Try again']);
for(const locale of locales){const text=await readFile(path.join(root,'src/i18n/locales',locale+'.ts'),'utf8');const dict={};for(const match of text.matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)){const [key,value]=JSON.parse('['+match[1]+','+match[2]+']');if(nativeKeys.has(key))dict[key]=value;}strings[locale]=dict;}
await mkdir(path.join(root,'desktop/Onyx.Activity'),{recursive:true});await writeFile(path.join(root,'desktop/Onyx.Activity/strings.json'),JSON.stringify(strings));
await cp(path.join(root,'public/brand/favicon-64.png'),path.join(root,'desktop/Onyx.Activity/onyx.png'));
console.log('Native localization generated from all 14 website dictionaries.');
