import {decodeAssetChunk} from './asset-decode.js';
import originalManifest from './transfer-manifest.json';
import mobileManifest from './mobile-transfer-manifest.json';
import { mobileEdition } from './mobile-performance.js';
const manifest=mobileEdition ? {...originalManifest,...mobileManifest} : originalManifest;

const states=new Map();
const names={'machine.glb':'扭蛋机','pokeball.glb':'精灵球','scene-v5-additions.glb':'背景装置','chamber-one-shot.glb':'舱内动画','pokedex.glb':'图鉴'};
function display(key,text) {
  if(text) states.set(key,text);else states.delete(key);
  const loading=document.querySelector('#loading');
  if(!loading || loading.classList.contains('done'))return;
  let label=document.querySelector('#asset-transfer-status');
  if(!label){label=document.createElement('p');label.id='asset-transfer-status';label.style.cssText='white-space:pre-line;text-align:center;font:12px/1.7 sans-serif;color:#e4c38d;margin:10px 18px 0;max-width:90vw';loading.appendChild(label);}
  label.textContent=[...states.values()].join('\n');
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function downloadPacked(url,onProgress) {
 const key=new URL(url,location.href).pathname,entry=manifest[key];
 if(!entry)return null;
 const output=new Uint8Array(entry.size);let completed=0,transferred=0,next=0;
 const transferBytes=entry.parts.reduce((n,part)=>n+part.bytes,0);
 const partialBytes=new Array(entry.parts.length).fill(0);let lastProgress=0;
 const offsets=[];let total=0;
 for(const part of entry.parts){offsets.push(total);total+=part.size;}
 if(total!==entry.size)throw Error('模型分块清单不完整');
 // Two independent pieces hide request latency. The shared model queue keeps
 // this bounded to four requests on mobile, six on desktop.
 async function downloadPart(i) {
  const part=entry.parts[i];let result;
  for(let attempt=0;attempt<3;attempt++) {
   const controller=new AbortController();let timeout;
   const resetTimeout=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),30000);};
   resetTimeout();partialBytes[i]=0;
   try {
    const response=await fetch(part.url,{signal:controller.signal,cache:'force-cache'});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    let bytes;
    if(mobileEdition && response.body?.getReader) {
     // A slow but progressing download must not restart every 30 seconds.
     // On phones, time out only after 30 seconds with no new network data.
     const reader=response.body.getReader(),chunks=[];let length=0;
     try { while(true) {
      const {done,value}=await reader.read();if(done)break;
      resetTimeout();chunks.push(value);length+=value.byteLength;partialBytes[i]=length;
      if(length>part.bytes)throw Error('下载数据长度异常');
      if(Date.now()-lastProgress>200){lastProgress=Date.now();onProgress?.(`下载 ${((transferred+partialBytes.reduce((n,b)=>n+b,0))/1048576).toFixed(1)}/${(transferBytes/1048576).toFixed(1)} MB`);}
     }} finally { reader.releaseLock(); }
     bytes=new Uint8Array(length);let cursor=0;
     for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.byteLength;}
    } else bytes=new Uint8Array(await response.arrayBuffer());
    clearTimeout(timeout);
    if(bytes.length!==part.bytes)throw Error('下载数据不完整');
    result=await decodeAssetChunk(bytes);
    if(result.length!==part.size)throw Error('解压校验失败');
    break;
   } catch(error) {
    if(attempt===2)throw Error(`${key.split('/').pop()} 第 ${i+1}/${entry.parts.length} 块下载失败：${error.name==='AbortError'?'网络超时':error.message}`);
    onProgress?.(`网络较慢，重试第 ${i+1} 块（${attempt+1}/2）`);
    await delay(500*(attempt+1));
   } finally {clearTimeout(timeout);}
  }
  output.set(result,offsets[i]);completed+=result.length;transferred+=part.bytes;partialBytes[i]=0;
  onProgress?.(`下载 ${((mobileEdition?transferred:completed)/1048576).toFixed(1)}/${((mobileEdition?transferBytes:entry.size)/1048576).toFixed(1)} MB`);
  await delay(0);
 }
 await Promise.all(Array.from({length:Math.min(2,entry.parts.length)},async()=>{
  while(next<entry.parts.length)await downloadPart(next++);
 }));
 return output.buffer;
}
export async function loadPackedModel(url,makeLoader) {
 const key=new URL(url,location.href).pathname;
 if(!manifest[key])return makeLoader().loadAsync(url);
 const name=names[key.split('/').pop()]||key.split('/').pop(),blobs=new Map();
 const status=text=>display(key,`${name} · ${text}`);
 try {
  status('开始下载');
  const data=await downloadPacked(url,status),view=new DataView(data);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,view.getUint32(12,true))));
  const base=new URL('.',new URL(url,location.href));
  for(const buffer of json.buffers||[]) {
   if(!buffer.uri || buffer.uri.startsWith('data:'))continue;
   const uri=new URL(buffer.uri,base).href;
   const raw=await downloadPacked(uri,status);
   if(raw)blobs.set(new URL(uri).pathname,URL.createObjectURL(new Blob([raw])));
  }
  status('解析模型与贴图');await delay(0);
  const loader=makeLoader();
  loader.manager.setURLModifier(uri=>blobs.get(new URL(uri,location.href).pathname)||uri);
  let timeout, slow;
  try {
   slow=setTimeout(()=>status('贴图解码较慢，仍在处理中…'),8000);
   return await Promise.race([
    loader.parseAsync(data,base.href),
    new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error(`${name} 的贴图解码超时，请点击重新加载`)),45000);}),
   ]);
  } finally {clearTimeout(timeout);clearTimeout(slow);}
 } finally {for(const blob of blobs.values())URL.revokeObjectURL(blob);display(key,null);}
}
