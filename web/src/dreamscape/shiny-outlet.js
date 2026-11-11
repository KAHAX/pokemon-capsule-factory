import * as THREE from 'three';

const MAX_DURATION = 12; // Safety timeout; normal fade starts at the actual outlet crossing.
const FADE_OUT = .45;
const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';

function material(fragmentShader, uniforms) {
  const result = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent:true,depthWrite:false,depthTest:true,
    blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,
  });
  result.userData.noToon=true;
  return result;
}

function createSource(uniforms) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.12,.82),material(`
    varying vec2 vUv; uniform float power;
    void main(){
      vec2 p=abs(vUv-.5)*2.;
      float edge=(1.-smoothstep(.70,1.,p.x))*(1.-smoothstep(.58,1.,p.y));
      float core=exp(-dot((vUv-.5)*vec2(1.3,2.0),(vUv-.5)*vec2(1.3,2.0))*3.);
      gl_FragColor=vec4(vec3(1.,.985,.965)*(8.+core*14.)*power,edge);
    }`,uniforms));
  mesh.renderOrder=59;
  return mesh;
}

function createShaft(uniforms, x, y, dx, dy, length, width, horizontal=false) {
  // Soft ribbons all originate inside the rectangular mouth. They occupy real
  // scene space and are occluded by the housing and emerging ball.
  const start=new THREE.Vector3(x,y,0);
  const end=new THREE.Vector3(x+dx,y+dy,length);
  const cross=horizontal?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  const vertices=[];
  for(const [p,w] of [[start,width*.28],[end,width]]) {
    vertices.push(...p.clone().addScaledVector(cross,-w).toArray(),...p.clone().addScaledVector(cross,w).toArray());
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
  geometry.setIndex([0,1,2,2,1,3]);
  const mesh=new THREE.Mesh(geometry,material(`
    varying vec2 vUv;uniform float power,t;
    void main(){
      float across=(vUv.x-.5)*2.;
      float feather=exp(-across*across*7.)*(1.-smoothstep(.72,1.,abs(across)));
      float along=pow(max(0.,1.-vUv.y),1.7)*smoothstep(0.,.07,vUv.y);
      float haze=.94+.06*sin(vUv.y*13.+t*1.6+vUv.x*5.);
      gl_FragColor=vec4(vec3(.97,.985,1.)*3.8*power,feather*along*haze*.48);
    }`,uniforms));
  mesh.renderOrder=60;
  mesh.frustumCulled=false;
  return mesh;
}

function createDust(uniforms) {
  const count=56, seeds=[];
  for(let i=0;i<count;i++)seeds.push(Math.random(),Math.random(),Math.random());
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(count*3),3));
  geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,3));
  const mat=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,fog:false,
    vertexShader:`attribute vec3 seed;uniform float t,viewHeight;varying float fade;
      void main(){
        float age=max(0.,t-seed.z*.19);
        vec3 p=vec3((seed.x-.5)*1.7,(seed.y-.5)*.35,age*(.65+seed.z*.8));
        p.x+=(seed.x-.5)*age*.25;p.y+=age*.1;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((.014+seed.y*.014)*projectionMatrix[1][1]*viewHeight*.5/-mv.z,1.,5.);
        fade=smoothstep(0.,.10,age)*(1.-smoothstep(.35,.85,age))*.32;
      }`,
    fragmentShader:`uniform float power;varying float fade;
      void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-r*r*7.)*(1.-smoothstep(.6,1.,r));
      gl_FragColor=vec4(vec3(2.7)*power,a*fade);}`,
  });
  mat.userData.noToon=true;
  const mesh=new THREE.Points(geometry,mat);
  mesh.frustumCulled=false;mesh.renderOrder=61;
  const size=new THREE.Vector2();
  mesh.onBeforeRender=renderer=>{uniforms.viewHeight.value=renderer.getDrawingBufferSize(size).y;};
  return mesh;
}

export class ShinyOutletFX {
  constructor(scene,machine) {
    this.scene=scene;this.machine=machine;this.active=[];
    const mouthZ=machine.outputAnimator.curtain.flaps[0]?.pivot.position.z??1.375;
    this.origin=new THREE.Vector3(0,1.43,mouthZ-.19);
    // Keep one unshadowed light in the scene from startup, avoiding shader
    // recompilation at the exact moment the prize is released.
    this.spill=new THREE.PointLight('#fffaf2',0,4.2,2);
    this.spill.name='Outlet / white interior spill';
    this.spill.position.copy(this.origin).add(new THREE.Vector3(0,.1,.32));
    scene.add(this.spill);
    machine.onShinyOutletStart=()=>this.burst();
    machine.onShinyOutletClear=()=>this.finish();
  }

  burst() {
    const root=new THREE.Group();root.name='Outlet / white backlight and shafts';root.position.copy(this.origin);
    const uniforms={t:{value:0},power:{value:0},viewHeight:{value:1000}};
    const meshes=[createSource(uniforms)];
    for(const [x,y,dx,dy,length,width,horizontal] of [
      [-.78,.01,-.52,.34,2.5,.45,false],[-.43,.04,-.26,.42,2.7,.38,false],
      [-.06,.02,.10,.5,2.9,.44,false],[.34,.01,.38,.37,2.7,.4,false],
      [.72,.02,.62,.27,2.4,.43,false],
      [0,-.15,0,.12,2.5,1.32,true],[0,.2,0,.38,2.5,1.42,true],
    ]) meshes.push(createShaft(uniforms,x,y,dx,dy,length,width,horizontal));
    meshes.push(createDust(uniforms));
    root.add(...meshes);this.scene.add(root);this.scene.userData.dreamNoDepth?.add(root);
    this.active.push({root,meshes,uniforms,t:0,endAt:MAX_DURATION-FADE_OUT});
  }

  finish() {for(const fx of this.active)fx.endAt=Math.min(fx.endAt,fx.t);}

  update(dt) {
    let peak=0;
    this.active=this.active.filter(fx=>{
      fx.t+=dt;
      const power=THREE.MathUtils.smoothstep(fx.t,0,.45)*(1-THREE.MathUtils.smoothstep(fx.t,fx.endAt,fx.endAt+FADE_OUT));
      fx.uniforms.t.value=fx.t;fx.uniforms.power.value=power;peak=Math.max(peak,power);
      if(fx.t<fx.endAt+FADE_OUT)return true;
      fx.root.removeFromParent();this.scene.userData.dreamNoDepth?.delete(fx.root);
      fx.meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
      return false;
    });
    this.spill.intensity=peak*10;
  }
}
