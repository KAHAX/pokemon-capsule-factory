import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const root='public/assets',dir=root+'/transfer';
await fs.mkdir(dir,{recursive:true});
const files=['machine.glb','pokeball.glb','scene-v5-additions.glb','handbag-v5.glb','box-v5.glb','display_props.glb','output-sequence.glb','chamber-one-shot.glb','cart-v5.glb','pokedex.glb'];
for(const f of [...files]) {
 const b=await fs.readFile(root+'/'+f),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 for(const ref of j.buffers||[]) if(ref.uri && !ref.uri.startsWith('data:')) files.push(ref.uri);
}
const manifest={};let raw=0,packed=0;
for(const file of new Set(files)) {
 const b=await fs.readFile(root+'/'+file),parts=[],restored=[];
 for(let offset=0;offset<b.length;offset+=512*1024) {
  const part=b.subarray(offset,offset+512*1024),gz=gzipSync(part,{level:9});
  const name=crypto.createHash('sha256').update(gz).digest('hex').slice(0,24)+'.bin';
  await fs.writeFile(dir+'/'+name,gz);parts.push({url:'/assets/transfer/'+name,bytes:gz.length,size:part.length});
  restored.push(gunzipSync(gz));packed+=gz.length;
 }
 if(!Buffer.concat(restored).equals(b))throw Error('Transfer validation failed: '+file);
 manifest['/assets/'+file]={size:b.length,parts};raw+=b.length;
}
await fs.writeFile('src/transfer-manifest.json',JSON.stringify(manifest));
console.log(JSON.stringify({files:Object.keys(manifest).length,raw,packed,byteExact:true}));
