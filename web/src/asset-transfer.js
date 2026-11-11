import {gunzipSync} from 'fflate';
import manifest from './transfer-manifest.json';

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
 const output=new Uint8Array(entry.size);let offset=0;
 // Sequential small pieces per model; the model queue limits total parallelism.
 for(let i=0;i<entry.parts.length;i++) {
  const part=entry.parts[i];let result;
  for(let attempt=0;attempt<3;attempt++) {
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
   try {
    const response=await fetch(part.url,{signal:controller.signal,cache:'force-cache'});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length!==part.bytes)throw Error('下载数据不完整');
    result=gunzipSync(bytes);
    if(result.length!==part.size)throw Error('解压校验失败');
    break;
   } catch(error) {
    if(attempt===2)throw Error(`${key.split('/').pop()} 第 ${i+1}/${entry.parts.length} 块下载失败：${error.name==='AbortError'?'网络超时':error.message}`);
    onProgress?.(`网络较慢，重试第 ${i+1} 块（${attempt+1}/2）`);
    await delay(500*(attempt+1));
   } finally {clearTimeout(timeout);}
  }
  output.set(result,offset);offset+=result.length;
  onProgress?.(`下载 ${(offset/1048576).toFixed(1)}/${(entry.size/1048576).toFixed(1)} MB`);
  await delay(0);
 }
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
  return await loader.parseAsync(data,base.href);
 } finally {for(const blob of blobs.values())URL.revokeObjectURL(blob);display(key,null);}
}
