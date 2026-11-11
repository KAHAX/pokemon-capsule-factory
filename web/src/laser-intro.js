import * as THREE from 'three';
import { createGalaxyStage } from './galaxy-stage.js';
import './laser-intro.css';

const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
// Reference reveal: two-second back.out(1.7), then back.in(1.3).
const backOut=t=>1+2.7*Math.pow(t-1,3)+1.7*Math.pow(t-1,2);
const backIn=t=>2.3*t*t*t-1.3*t*t;

export class LaserIntro {
  constructor({scene,camera,renderer,controls,depthOfField,bloom,prepareMaterials,renderMainScene}) {
    Object.assign(this,{scene,camera,renderer,controls,depthOfField,bloom,prepareMaterials,renderMainScene});
    this.center=new THREE.Vector2(-1.5,1.0);
    this.islandRadius=10.2;
    this.uniforms={radius:{value:0},center:{value:this.center},enabled:{value:1},strength:{value:1},warmth:{value:1}};
    this.state='loading';this.time=0;this.blocking=true;
    this.materials=new WeakSet();this.objects=new WeakSet();
    this.homePosition=camera.position.clone();this.homeTarget=controls.target.clone();
    this.previewTarget=new THREE.Vector3(-1.5,4.2,1);
    this.previewPosition=this.previewTarget.clone().add(this.homePosition.clone().sub(this.homeTarget).multiplyScalar(1.62));
    this.oldBloom=bloom.strength;
    this.oldAperture=depthOfField.uniforms.aperture.value;
    this.controls.enabled=false;
    document.body.classList.add('laser-intro-active');
    this.createUI();this.createRing();this.scan();
    // Bokeh's override depth pass must agree with the visible cut, or hidden tracks leave ghost outlines.
    this.patchMaterial(depthOfField.materialDepth,true);
    this.ready=createGalaxyStage(scene,this.center,this.islandRadius,this.uniforms);
    this.bind();
  }
  createUI(){
    this.ui=document.createElement('section');this.ui.className='laser-invitation';
    this.ui.innerHTML='<button class="laser-start" type="button" aria-label="点击圈内，进入扭蛋工坊"><svg viewBox="0 0 70 50"><path d="M65 8C45 1 20 6 10 34M4 22l6 14 17-4"/></svg><span>CLICK TO<br>DISCOVER</span><small>点击圈内 · 开启工坊</small></button>';
    document.querySelector('#app').appendChild(this.ui);
    this.ui.querySelector('button').addEventListener('click',()=>this.expand());
    const credit=document.createElement('a');credit.className='galaxy-credit';
    credit.href='https://www.eso.org/public/images/eso0932a/';credit.target='_blank';credit.rel='noopener';
    credit.textContent='Milky Way · ESO/S. Brunier';credit.title='Real 360° Milky Way panorama · CC BY 4.0 · resized and colour graded';
    document.querySelector('#app').appendChild(credit);
  }
  createRing(){
    const material=new THREE.ShaderMaterial({
      uniforms:{radius:this.uniforms.radius,center:this.uniforms.center,strength:this.uniforms.strength},
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`varying vec3 ringWorld; void main(){ringWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(ringWorld,1.0);}`,
      fragmentShader:`uniform float radius,strength;uniform vec2 center;varying vec3 ringWorld;
        void main(){float d=abs(length(ringWorld.xz-center)-radius);
          float core=1.0-smoothstep(.025,.080,d);
          float halo=exp(-d*d/0.065)*.55+exp(-d*d/.65)*.10;
          float alpha=(core+halo)*strength*smoothstep(0.0,.3,radius);
          if(alpha<.001)discard;
          vec3 color=mix(vec3(.62,.10,1.8),vec3(5.5,3.2,6.0),core);
          gl_FragColor=vec4(color,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.ring=new THREE.Mesh(new THREE.PlaneGeometry(320,320),material);
    this.ring.name='Laser reveal / luminous floor circumference';this.ring.userData.laserExempt=true;
    this.ring.rotation.x=-Math.PI/2;this.ring.position.y=-.69;this.ring.renderOrder=20;
    this.scene.add(this.ring);
  }
  patchMaterial(material,depth=false){
    if(!material||this.materials.has(material)||material.isShaderMaterial&&!material.vertexShader.includes('#include <project_vertex>'))return;
    this.materials.add(material);
    const before=material.onBeforeCompile,key=material.customProgramCacheKey();
    const uniforms=this.uniforms;
    material.onBeforeCompile=function(shader,renderer){
      before.call(this,shader,renderer);
      Object.assign(shader.uniforms,{laserRadius:uniforms.radius,laserCenter:uniforms.center,laserEnabled:uniforms.enabled,laserStrength:uniforms.strength});
      shader.vertexShader='varying vec3 laserWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 laserPosition=vec4(transformed,1.0);
        #ifdef USE_BATCHING
          laserPosition=batchingMatrix*laserPosition;
        #endif
        #ifdef USE_INSTANCING
          laserPosition=instanceMatrix*laserPosition;
        #endif
        laserWorld=(modelMatrix*laserPosition).xyz;`);
      shader.fragmentShader='varying vec3 laserWorld;uniform vec2 laserCenter;uniform float laserRadius,laserEnabled,laserStrength;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('void main() {',`void main() {
        float laserDistance=length(laserWorld.xz-laserCenter);
        if(laserEnabled>.5 && laserDistance>laserRadius)discard;`);
      if(!depth)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        if(laserEnabled>.5){
          float edge=1.0-smoothstep(.025,.15,laserRadius-laserDistance);
          outgoingLight=mix(outgoingLight,vec3(5.5,2.2,7.0)*laserStrength,edge);
        }
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>key+'/cylindrical-laser-v1'+(depth?'-depth':'');
    material.needsUpdate=true;
  }
  scan(){
    this.scene.traverse(object=>{
      if(object.userData.laserExempt||(!object.isMesh&&!object.isLine&&!object.isPoints))return;
      const materials=[].concat(object.material||[]);
      if(materials.some(m=>/FLEECE \/ honey apricot dyed plush/i.test(m.name))){object.visible=false;return;}
      materials.forEach(m=>this.patchMaterial(m));
      if(this.objects.has(object))return;
      this.objects.add(object);
      if(object.isMesh&&object.castShadow){
        if(!object.customDepthMaterial){
          const m=materials[0];
          object.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:m.side,map:m.map,alphaMap:m.alphaMap,alphaTest:m.alphaTest});
        }
        this.patchMaterial(object.customDepthMaterial,true);
      }
    });
  }
  bind(){
    const canvas=this.renderer.domElement;
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),point=new THREE.Vector3();
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),.70);
    let start=null;
    const hit=e=>{
      const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
      ray.setFromCamera(pointer,this.camera);
      // Clicking the machine itself counts too, even its upper silhouette above the ground circle.
      const o=ray.ray.origin,d=ray.ray.direction;
      const ox=o.x-this.center.x,oz=o.z-this.center.y;
      const a=d.x*d.x+d.z*d.z,b=2*(ox*d.x+oz*d.z),c=ox*ox+oz*oz-this.islandRadius*this.islandRadius;
      const disc=b*b-4*a*c;
      if(a>1e-6&&disc>=0){
        const root=Math.sqrt(disc);
        for(const t of [(-b-root)/(2*a),(-b+root)/(2*a)]){
          const y=o.y+t*d.y;if(t>=0&&y>=-.71&&y<=15)return true;
        }
      }
      return ray.ray.intersectPlane(plane,point)&&Math.hypot(point.x-this.center.x,point.z-this.center.y)<=this.islandRadius;
    };
    canvas.addEventListener('pointerdown',e=>{if(!this.blocking)return;start={x:e.clientX,y:e.clientY};e.stopImmediatePropagation();},{capture:true});
    canvas.addEventListener('pointerup',e=>{
      if(!this.blocking)return;
      e.stopImmediatePropagation();
      if(e.button===0&&start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<7&&hit(e))this.expand();start=null;
    },{capture:true});
    canvas.addEventListener('pointermove',e=>{if(!this.blocking)return;canvas.style.cursor=this.state==='waiting'&&hit(e)?'pointer':'default';e.stopImmediatePropagation();},{capture:true});
    canvas.addEventListener('wheel',e=>{if(this.blocking){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
    window.addEventListener('keydown',e=>{
      if(!this.blocking||e.target.matches('input,textarea'))return;
      if(e.code==='Enter'||e.code==='Space'){e.preventDefault();e.stopImmediatePropagation();this.expand();}
    },{capture:true});
  }
  start(){if(this.state!=='loading')return;this.state='arriving';this.time=0;}
  async warmup(){
    // Compile the far factory and companions before the visible sweep reaches them.
    const companions=this.scene.getObjectByName('Background Pokemon / repair, flight and play');
    const visible=companions?.visible;
    if(companions)companions.visible=true;
    this.scan();this.prepareMaterials();
    try {
      await this.renderer.compileAsync(this.scene,this.camera);
      // compileAsync does not upload geometry, textures or shadow/depth variants.
      // Draw under the loading overlay so first visibility cannot stall the reveal.
      this.renderMainScene();
    }
    finally { if(companions)companions.visible=visible; }
  }
  expand(){if(this.state!=='waiting')return;this.state='expanding';this.time=0;this.ui.classList.add('leaving');}
  update(dt){
    if(!this.blocking)return;
    this.time+=Math.min(dt,.05);
    this.scanClock=(this.scanClock||0)+dt;if(this.scanClock>.3){this.scan();this.scanClock=0;}
    let cameraBlend=0;
    if(this.state==='loading')this.uniforms.radius.value=0;
    if(this.state==='arriving'){
      const t=clamp(this.time/2.0);this.uniforms.radius.value=this.islandRadius*backOut(t);
      if(this.time>.75)this.ui.classList.add('visible');
      if(t>=1){this.state='waiting';this.time=0;}
    }
    if(this.state==='waiting')this.uniforms.radius.value=this.islandRadius;
    if(this.state==='expanding'){
      const t=clamp(this.time/2.4);
      // A small anticipation followed by acceleration, matching the reference's second reveal.
      this.uniforms.radius.value=this.islandRadius+(this.islandRadius*30/3.5-this.islandRadius)*backIn(t);
      cameraBlend=smooth(Math.max(0,(t-.12)/.88));
      this.uniforms.strength.value=1-smooth((t-.72)/.28);
      this.uniforms.warmth.value=1-smooth((t-.45)/.55);
      if(t>=1){this.complete();return;}
    }
    this.camera.position.lerpVectors(this.previewPosition,this.homePosition,cameraBlend);
    this.controls.target.lerpVectors(this.previewTarget,this.homeTarget,cameraBlend);
    this.camera.lookAt(this.controls.target);this.camera.updateMatrixWorld();
    this.bloom.strength=THREE.MathUtils.lerp(.30,this.oldBloom,cameraBlend);
  }
  complete(){
    this.state='complete';this.blocking=false;this.uniforms.enabled.value=0;this.uniforms.radius.value=10000;this.uniforms.warmth.value=0;
    this.ring.visible=false;this.bloom.strength=this.oldBloom;
    this.camera.position.copy(this.homePosition);this.controls.target.copy(this.homeTarget);
    this.controls.enabled=true;this.controls.update();
    const companions=this.scene.getObjectByName('Background Pokemon / repair, flight and play');if(companions)companions.visible=true;
    document.body.classList.remove('laser-intro-active');this.ui.remove();this.renderer.domElement.style.cursor='';
  }
}
