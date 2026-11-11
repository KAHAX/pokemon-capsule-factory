import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
for(const name of ['machine','scene-v5-additions']) {
 const d=await io.read(`public/assets/${name}.glb`);
 const rows=d.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>({name:n.getName(),mesh:n.getMesh().getName(),triangles:n.getMesh().listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),bounds:getBounds(n),materials:n.getMesh().listPrimitives().map(p=>p.getMaterial()?.getName())}));
 fs.writeFileSync(`D:/Codex/2026-11-11/${name}-layout.json`,JSON.stringify(rows,null,2));
 console.log(name,rows.length,rows.reduce((s,n)=>s+n.triangles,0));
 console.log(rows.slice(0,15).map(r=>r.name));
}
