import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
const raw=Buffer.from('phone resource'.repeat(100)),packed=gzipSync(raw);
globalThis.location={href:'http://test.local/mobile/'};
globalThis.decodeTest=async b=>new Uint8Array(gunzipSync(b));
const original={'/model.glb':{size:99,parts:[{url:'/desktop',size:99,bytes:99}]}};
const mobile={'/model.glb':{size:raw.length,parts:[{url:'/phone',size:raw.length,bytes:packed.length}]}};
const source=(await fs.readFile('src/asset-transfer.js','utf8'))
 .replace("import {decodeAssetChunk} from './asset-decode.js';",'const decodeAssetChunk=globalThis.decodeTest;')
 .replace("import originalManifest from './transfer-manifest.json';",'const originalManifest='+JSON.stringify(original)+';')
 .replace("import mobileManifest from './mobile-transfer-manifest.json';",'const mobileManifest='+JSON.stringify(mobile)+';')
 .replace("import { mobileEdition } from './mobile-performance.js';",'const mobileEdition=true;')
 .replaceAll('30000','100'); // Scale the inactivity deadline for a fast test.
let requests=0;
globalThis.fetch=async(url,{signal})=>{
 assert.equal(url,'/phone');requests++;
 let cursor=0;
 return {ok:true,body:{getReader(){return {
  async read(){await new Promise(r=>setTimeout(r,40));if(signal.aborted)throw Error('aborted');if(cursor>=packed.length)return {done:true};const value=packed.subarray(cursor,cursor+6);cursor+=value.length;return {done:false,value};},releaseLock(){}
 };}}};
};
const {downloadPacked}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const progress=[],started=Date.now(),result=await downloadPacked('/model.glb',x=>progress.push(x));
assert(Buffer.from(result).equals(raw));assert(Date.now()-started>100);assert.equal(requests,1,'progressing slow download must not retry');assert(progress.length>1);
console.log('PASS: mobile manifest routing and streaming progress; long progressing downloads survive the inactivity deadline');
