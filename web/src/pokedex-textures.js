import * as THREE from 'three';
import { mobileEdition } from './mobile-performance.js';
import mobileTextures from './mobile-textures.json';
import { createPokedexDetailArt } from './pokedex-detail-art.js';

// AI-authored material atlas, sampled in each part's own coordinates so the
// surface follows the hinge and does not depend on the original missing UVs.
const key = name => name.replace(/[^a-z0-9]/gi, '').toLowerCase();

function makeLegends() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  const tile = (i, width, height, draw) => {
    ctx.save(); ctx.translate(i % 4 * 512, Math.floor(i / 4) * 512);
    ctx.beginPath(); ctx.rect(0, 0, 512, 512); ctx.clip();
    ctx.scale(512 / width, 512 / height);
    ctx.fillStyle = '#e8f5eb'; ctx.strokeStyle = '#d8eee7';
    ctx.lineWidth = .008; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    draw(ctx); ctx.restore();
  };
  for (let i = 0; i < 9; i++) tile(i, .54, .52, g => {
    g.font = '600 .21px Arial'; g.fillText(String(i+1), .27, .21);
    g.font = '600 .064px Arial'; g.globalAlpha = .85;
    g.fillText(['SCAN','DATA','MAP','LINK','SAVE','ABC','DEF','GHI','JKL'][i], .27, .385);
    g.globalAlpha = .32; g.beginPath();g.moveTo(.11,.44);g.lineTo(.43,.44);g.stroke();
  });
  // Print below the existing controls; their geometry and labels remain intact.
  tile(9, 4.0114, 5.346, g => {
    g.textAlign = 'left'; g.font = '600 .085px monospace';
    g.globalAlpha = .58; g.fillText('KANTO  /  FIELD TERMINAL', .29, 5.23);
    g.textAlign = 'right'; g.fillText('REV. 03', 3.73, 5.23);
    g.lineWidth = .009;g.globalAlpha = .22;
    g.beginPath();g.moveTo(.25,5.10);g.lineTo(3.77,5.10);g.stroke();
    g.textAlign = 'left';g.globalAlpha=.52;g.font='500 .082px monospace';
    g.fillText('COMMAND / 10 KEY', .31, 3.65);
  });
  tile(10, 3.8818, 1.2445, g => {
    g.textAlign='right';g.globalAlpha=.72;g.font='600 .078px monospace';
    g.fillText('OPTICAL SCAN',3.48,1.04);
    g.globalAlpha=.4;g.beginPath();g.moveTo(1.64,1.15);g.lineTo(3.48,1.15);g.stroke();
    for(let i=0;i<12;i++){g.fillRect(1.66+i*.035,1.14,.014,.035);}
  });
  tile(11,3.6098,4.74,g=>{
    g.textAlign='left';g.globalAlpha=.65;g.font='600 .082px monospace';
    g.fillText('FIELD RESEARCH',.79,4.48);
    g.font='500 .059px monospace';g.globalAlpha=.5;g.fillText('KANTO // PORTABLE DATABASE',.79,4.60);
  });
  tile(12,2.82,2.4237,g=>{
    g.fillStyle='#34464c';g.globalAlpha=.7;g.font='600 .052px monospace';
    g.textAlign='left';g.fillText('DOT MATRIX',.22,2.26);
    g.textAlign='right';g.fillText('LCD / 01',2.18,2.26);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function surfaceKind(name) {
  if (/Vermilion|Raised red|Rear cover/.test(name)) return 0;
  if (/Charcoal faceplate/.test(name)) return 1;
  if (/Satin aluminium|Screen ivory silver/.test(name)) return 2;
  if (/Blue key tops|Cyan key highlights/.test(name)) return 3;
  return -1;
}

function applySurface(mesh, source, kind, atlas, legends, legendIndex, details, detail) {
  const material = source.clone();
  material.name = `${source.name} / illustrated surface`;
  const hasLegend = legendIndex >= 0;
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  const extent = bounds.getSize(new THREE.Vector3());
  const isKey = /^Bluekey/.test(mesh.name.replace(/[^a-z0-9]/gi,''));
  const scale = isKey ? 1.8 : .235;
  const colorMix = [ .72, .72, .6, .62 ][kind];
  material.roughness = [.32, .51, .26, .31][kind];
  material.metalness = [.08,.08,.75,.1][kind];
  if ('clearcoat' in material) { material.clearcoat = kind === 0 ? .38 : .12; material.clearcoatRoughness = .25; }
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uDexAtlas:{value:atlas}, uDexLegends:{value:legends}, uDexDetails:{value:details},
      uDexDetailTile:{value:new THREE.Vector2((detail?.tile??0)%2,Math.floor((detail?.tile??0)/2))},
      uDexDetailRect:{value:new THREE.Vector4(...(detail?.rect??[0,0,1,1]))},
      uDexDetailOpacity:{value:detail?.opacity??0},uDexBack:{value:detail?.back?-1:1},
      uDexTile:{value:new THREE.Vector2(kind%2,Math.floor(kind/2))},
      uDexPrintTile:{value:new THREE.Vector2(legendIndex%4,Math.floor(legendIndex/4))},
      uDexMin:{value:bounds.min},uDexSize:{value:extent},
      uDexScale:{value:scale}, uDexMix:{value:colorMix}, uDexLegend:{value:hasLegend?1:0},
      uDexRelief:{value:kind===2?.0018:.0045},
    });
    shader.vertexShader=shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vDexP; varying vec3 vDexN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vDexP=position;vDexN=normal;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vDexP; varying vec3 vDexN;
uniform sampler2D uDexAtlas, uDexLegends, uDexDetails;
uniform vec2 uDexDetailTile;uniform vec4 uDexDetailRect;uniform float uDexDetailOpacity,uDexBack;
uniform vec2 uDexTile,uDexPrintTile;
uniform vec3 uDexMin,uDexSize;
uniform float uDexScale,uDexMix,uDexLegend,uDexRelief;
vec3 dexSwatch(vec2 p) {
  vec2 uv=1.0-abs(mod(p,2.0)-1.0);
  uv=mix(vec2(.006),vec2(.994),uv);
  uv=(uv+vec2(uDexTile.x,1.0-uDexTile.y))*.5;
  return texture2D(uDexAtlas,uv).rgb;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 dexW=pow(abs(normalize(vDexN)),vec3(6.0));dexW/=dot(dexW,vec3(1.0));
vec3 dexP=vDexP*uDexScale;
vec3 dexColor=dexSwatch(dexP.zy)*dexW.x+dexSwatch(dexP.xz)*dexW.y+dexSwatch(dexP.xy)*dexW.z;
diffuseColor.rgb=mix(diffuseColor.rgb,dexColor,uDexMix);
if(uDexDetailOpacity>0.) {
 vec2 uv=vec2((vDexP.x-uDexMin.x)/uDexSize.x,1.-(vDexP.z-uDexMin.z)/uDexSize.z);
 if(uDexBack<0.)uv.x=1.-uv.x;
 vec2 duv=(uv-uDexDetailRect.xy)/uDexDetailRect.zw;
 if(all(greaterThanEqual(duv,vec2(0.)))&&all(lessThanEqual(duv,vec2(1.)))) {
  vec4 art=texture2D(uDexDetails,(clamp(duv,.002,.998)+vec2(uDexDetailTile.x,1.-uDexDetailTile.y))*.5);
  float facing=smoothstep(.72,.98,normalize(vDexN).y*uDexBack);
  diffuseColor.rgb=mix(diffuseColor.rgb,art.rgb,art.a*facing*uDexDetailOpacity);
 }
}
if(uDexLegend>.5) {
 vec2 uv=vec2((vDexP.x-uDexMin.x)/uDexSize.x,1.0-(vDexP.z-uDexMin.z)/uDexSize.z);
 vec4 ink=texture2D(uDexLegends,(clamp(uv,.001,.999)+vec2(uDexPrintTile.x,3.0-uDexPrintTile.y))*.25);
 float front=smoothstep(.7,.98,normalize(vDexN).y)*smoothstep(.75,.98,(vDexP.y-uDexMin.y)/max(.0001,uDexSize.y));
 diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a*front);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float dexGrain=dot(dexColor,vec3(.2126,.7152,.0722));
roughnessFactor=clamp(roughnessFactor+(dexGrain-.3)*.19,.16,.65);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
// Fine relief from the same authored texture, without altering silhouettes.
vec3 dexDx=dFdx(-vViewPosition), dexDy=dFdy(-vViewPosition);
vec3 dexR1=cross(dexDy,normal),dexR2=cross(normal,dexDx);
float dexDet=dot(dexDx,dexR1);
vec3 dexGradient=uDexRelief*(dFdx(dexGrain)*dexR1+dFdy(dexGrain)*dexR2);
normal=normalize(abs(dexDet)*normal-sign(dexDet)*dexGradient);`);
  };
  material.customProgramCacheKey=()=>`pokedex-ai-surfaces-v4-reference-print`;
  material.userData.pokedexAiSurface=true;
  return material;
}

export async function applyPokedexTextures(pack) {
  const atlas=await new THREE.TextureLoader().loadAsync(mobileEdition ? mobileTextures.pokedex : '/assets/pokedex/pokedex-material-atlas-v1.png');
  atlas.colorSpace=THREE.SRGBColorSpace;
  atlas.anisotropy=Math.min(8,pack.renderer.capabilities.getMaxAnisotropy());
  const legends=makeLegends();legends.anisotropy=atlas.anisotropy;
  const labels={rightcharcoalfaceplate:9,raisedsensorcrown:10,silverdisplaysurround:12};
  const details=await createPokedexDetailArt();details.anisotropy=atlas.anisotropy;
  const detailLayouts={
    frontredinset:{tile:0,rect:[0,0,1,1],opacity:1},
    rightcharcoalfaceplate:{tile:2,rect:[0,0,1,1],opacity:1},
    cartridgeredlabel:{tile:1,rect:[.02,.04,.96,.9],opacity:1},
    rearcoverinsetpanel:{tile:3,rect:[0,0,1,1],opacity:1,back:true},
  };
  const replacedPrint=new Set(['cartridgeivorystripe','cartridgepokeballband','cartridgepokeballcenter','cartridgepokeballwhite','cartridgetinytitle','rearresearchlabel','pokemonlogocreamkeyline','pokemonlogooutline','pokemonlogoyellowface']);
  let count=0;
  pack.model.traverse(mesh=>{
    if(!mesh.isMesh || mesh.userData.pokedexAiSurface) return;
    const id=key(mesh.name), match=id.match(/^bluekey([01])([0-4])$/);
    if(replacedPrint.has(id))mesh.visible=false;
    const legend=match?Number(match[1])*5+Number(match[2]):labels[id]??-1;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const next=materials.map(material=>{
      const kind=surfaceKind(material.name);
      if(kind<0 || material.map) return material;
      count++;
      // The tenth key already has a modeled return glyph.
      return applySurface(mesh,material,kind,atlas,legends,match&&legend===9?-1:legend,details,detailLayouts[id]);
    });
    mesh.material=Array.isArray(mesh.material)?next:next[0];
    mesh.userData.pokedexAiSurface=true;
  });
  pack.textureAssets={atlas,legends,details,treatedMeshes:count};
  await pack.renderer.compileAsync(pack.scene,pack.camera);
}
