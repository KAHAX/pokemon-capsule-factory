import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import fs from 'node:fs/promises';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report=[];
for(const file of ['scene-v5-additions','machine','chamber-one-shot','pokeball','output-sequence']) {
 const d=await io.read(`public/assets/${file}.glb`);
 const meshes=d.getRoot().listMeshes().map(m=>({name:m.getName(),triangles:m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0)}));
 report.push({file,triangles:meshes.reduce((n,m)=>n+m.triangles,0),meshes:meshes.length,top:meshes.sort((a,b)=>b.triangles-a.triangles).slice(0,20)});
}
await fs.writeFile('../geometry-before.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
