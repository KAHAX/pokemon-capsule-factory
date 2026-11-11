import { createLightningStrokes } from './lightning-strokes.js';
import { TailDischarge } from './tail-discharge.js';
import * as THREE from 'three';
const TAU = Math.PI * 2;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const v = () => new THREE.Vector3();

// Batched soft particles, anchored to animated bones in world space. No shadow maps.
export class LegendaryEnergy {
  constructor(actor, electric = false) {
    this.actor = actor; this.electric = electric; this.time = 0;
    this.root = new THREE.Group(); this.root.name = electric ? 'Zekrom / intermittent violet discharge' : 'Reshiram / turbine and ground fire';
    this.root.userData.legendaryFX = true;
    this.tail = actor.rig.getObjectByName(electric ? 'tail' : 'tail_a_03');
    // The open turbine outlet ends at a_04; a_07/a_08 are the solid tail tip.
    this.tailEnd = actor.rig.getObjectByName(electric ? 'tail' : 'tail_a_04');
    this.tailMaterials = [];
    actor.rig.traverse(mesh => {
      if (!mesh.isMesh || !/tail_mesh|dynamo_mesh/.test(mesh.name)) return;
      const clone = source => {
        const material = source.clone();
        if (material.emissive) {
          this.tailMaterials.push({ material, color: material.emissive.clone(), intensity: material.emissiveIntensity });
        }
        return material;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    });
    this.tailOffset = new THREE.Vector3();
    this.tailDirection = new THREE.Vector3(0, 0, -1);
    if (electric && this.tail) {
      actor.root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      actor.rig.traverse(mesh => {
        if (!mesh.isMesh || !/dynamo_mesh/.test(mesh.name)) return;
        mesh.skeleton?.update(); mesh.computeBoundingBox?.();
        const bounds = mesh.boundingBox || mesh.geometry.boundingBox;
        if (bounds) box.union(bounds.clone().applyMatrix4(mesh.matrixWorld));
      });
      if (!box.isEmpty()) this.tailOffset.copy(this.tail.worldToLocal(box.getCenter(new THREE.Vector3())));
      this.tailDirection.applyQuaternion(actor.root.getWorldQuaternion(new THREE.Quaternion()))
        .applyQuaternion(this.tail.getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    this.tailQuaternion = new THREE.Quaternion();
    this.energyColor = new THREE.Color(electric ? '#773aff' : '#ff2410');
    this.head = actor.rig.getObjectByName('head');
    this.jaw = actor.rig.getObjectByName('jaw');
    this.origin = v(); this.end = v(); this.mouth = v(); this.forward = v();
    this.axis = v(); this.right = v(); this.up = v(); this.point = v(); this.target = v();
    this.arcPrevious = v(); this.arcFork = v(); this.arcPoint = v();
    this.count = 360;
    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.alphas = new Float32Array(this.count);
    const geometry = new THREE.BufferGeometry();
    for (const [name, array, size] of [['position',this.positions,3],['color',this.colors,3],['size',this.sizes,1],['alpha',this.alphas,1]])
      geometry.setAttribute(name, new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
      uniforms:{ pixelScale:{value:500}, clock:{value:0} },
      vertexShader:`attribute float size,alpha; varying vec3 tint; varying float opacity,seed;
        uniform float pixelScale; void main(){tint=color;opacity=alpha;seed=position.x*3.1+position.z;
        vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(size*pixelScale/max(1.,-mv.z),1.,120.);}`,
      fragmentShader:`uniform float clock; varying vec3 tint; varying float opacity,seed;
        void main(){vec2 p=gl_PointCoord*2.-1.; float r=length(p);
        float wisps=.83+.17*sin(p.x*9.+clock*9.+seed)*sin(p.y*7.-clock*6.);
        float soft=pow(max(0.,1.-r),2.2)*wisps;
        gl_FragColor=vec4(tint,soft*opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    material.userData.noToon=true;
    this.particles = new THREE.Points(geometry,material); this.particles.frustumCulled=false;
    this.particles.onBeforeRender=(renderer,scene,camera)=>{
      const viewport=renderer.getCurrentViewport(new THREE.Vector4());
      material.uniforms.pixelScale.value=viewport.w*.5*camera.projectionMatrix.elements[5];
    };
    this.root.add(this.particles);
    this.arcPositions=new Float32Array(512*6);
    this.arcStyles=new Float32Array(512*2).fill(1);
    this.discharge=electric?new TailDischarge(this.arcPositions,this.arcStyles):null;
    this.arcs=createLightningStrokes(this.arcPositions,this.arcStyles);
    this.root.add(this.arcs);
    this.particles.visible=!electric;
    this.root.visible=false;
  }
  attach() {
    if (this.root.parent) return;
    const parent=this.actor.root.parent;if(!parent)return;
    parent.add(this.root);
    let scene=parent;while(scene.parent)scene=scene.parent;
    // These are light, not opaque surfaces in the depth-of-field pass.
    (scene.userData.dreamNoDepth ||= new Set()).add(this.root);
  }
  update(dt, stage, elapsed) {
    this.time+=dt;this.attach();
    const skill=stage.key.startsWith('skill-');
    const skillStrength=stage.key==='skill-charge'?smooth(0,stage.duration,elapsed)*.65
      :stage.key==='skill-end'?1-smooth(0,stage.duration,elapsed)
      :skill ? .8+.2*Math.sin(elapsed*5):0;
    // Brief turbine ignition during take-off; otherwise long quiet intervals.
    const launch=stage.key==='take-off'?smooth(0,stage.duration,elapsed)
      :stage.key==='climb'?(1-smooth(2.5,stage.duration,elapsed))*.8:0;
    const energy=Math.max(skillStrength,launch);
    for (const state of this.tailMaterials) {
      state.material.emissive.copy(state.color).lerp(this.energyColor, energy);
      state.material.emissiveIntensity = state.intensity + energy * (this.electric ? 12 : 9);
    }
    this.root.visible=energy>.005;
    if(!this.root.visible){this.discharge?.reset();this.arcs.visible=false;return;}
    const a=this.actor, s=a.size;
    a.root.updateMatrixWorld(true);
    this.forward.set(0,0,1).applyQuaternion(a.root.quaternion);
    this.tail?.getWorldPosition(this.origin);
    this.tailEnd?.getWorldPosition(this.end);
    if(this.electric){
      this.origin.copy(this.tailOffset);this.tail.localToWorld(this.origin);
      this.axis.copy(this.tailDirection).applyQuaternion(this.tail.getWorldQuaternion(this.tailQuaternion));
      this.end.copy(this.origin).addScaledVector(this.axis,s*.2);
    }
    this.axis.subVectors(this.end,this.origin);
    if(this.axis.lengthSq()<.001)this.axis.copy(this.forward).negate();else this.axis.normalize();
    this.right.crossVectors(this.axis,new THREE.Vector3(0,1,0)).normalize();
    this.up.crossVectors(this.right,this.axis).normalize();
    (this.jaw||this.head)?.getWorldPosition(this.mouth);
    this.mouth.addScaledVector(this.forward,s*.06);
    this.target.copy(this.mouth).addScaledVector(this.forward,s*.75);this.target.y=-.64;
    let n=0;
    const add=(p,size,color,alpha)=>{
      if(n>=this.count)return;
      this.positions.set([p.x,p.y,p.z],n*3);this.colors.set(color,n*3);this.sizes[n]=size;this.alphas[n++]=alpha;
    };
    const t=this.time;
    if(!this.electric){
      // Annular outlet around the solid tail: heat lives inside the open pipe,
      // and streams leave its lip along a_03 -> a_04, never from the pointed tip.
      for(let i=0;i<20;i++){
        const angle=i*TAU/20;
        this.point.copy(this.end).addScaledVector(this.axis,-s*.012)
          .addScaledVector(this.right,Math.cos(angle)*s*.103)
          .addScaledVector(this.up,Math.sin(angle)*s*.103);
        add(this.point,s*.18,[16,.32,.035],energy*.95);
      }
      for(let i=0;i<125;i++){
        const life=(i/125+t*(.85+(i%5)*.06))%1;
        const angle=i*2.39996+t*9-life*7;
        const radius=s*(.105+.07*life);
        this.point.copy(this.end).addScaledVector(this.axis,s*life*.4)
          .addScaledVector(this.right,Math.cos(angle)*radius).addScaledVector(this.up,Math.sin(angle)*radius);
        this.point.y+=s*life*life*.08;
        const ember=i%5===0;
        add(this.point,s*(ember?.026:.14+.16*life),[12,.5+2.4*Math.sin(Math.PI*life),.08*(1-life)],energy*(1-life)*(ember?1.2:.85));
      }
      // Aim at the distant clearing, never at the machine. Warm flare + widening jet + ground scatter.
      const fire=stage.key==='skill-release'?smooth(0,.35,elapsed)*(1-smooth(stage.duration-.5,stage.duration,elapsed)):0;
      if(fire>0){
        add(this.mouth,s*.22,[3,2,.4],fire);
        for(let i=0;i<150;i++){
          const life=(i/150+t*1.6)%1, angle=i*2.399+t*3,spread=s*(.012+.13*life);
          this.point.lerpVectors(this.mouth,this.target,life).addScaledVector(this.right,Math.sin(angle)*spread);
          this.point.y+=Math.cos(angle)*spread*.6;
          add(this.point,s*(.065+.2*life),[3,.9-life*.8,.035],fire*(1-life*.55)*.55);
        }
        add(this.target,s*.65,[2.5,.65,.04],fire*.9);
        for(let i=0;i<55;i++){
          const life=(i/55+t*.9)%1,angle=i*2.399;
          this.point.copy(this.target);this.point.x+=Math.cos(angle)*life*s*.32;this.point.z+=Math.sin(angle)*life*s*.32;this.point.y+=Math.sin(life*Math.PI)*s*.13;
          add(this.point,s*.022,[3,.75,.07],fire*(1-life));
        }
      }
      this.arcs.visible=false;
    }else{
      // Independent jagged channels cling to the animated dynamo, then branch
      // outward in brief, asynchronous flashes. No sixfold coil or rotating halo.
      this.discharge.update(dt,energy,this.origin,this.axis,this.right,this.up,s);
      this.arcs.geometry.instanceCount=this.discharge.count;
      this.arcs.visible=this.discharge.count>0;
      this.arcs.material.uniforms.power.value=1;
      this.arcs.userData.positionBuffer.needsUpdate=true;
      this.arcs.userData.styleBuffer.needsUpdate=true;
      for(const state of this.tailMaterials)
        state.material.emissiveIntensity=state.intensity+energy*(7+7*this.discharge.flash);
    }
    this.particles.geometry.setDrawRange(0,n);
    Object.values(this.particles.geometry.attributes).forEach(attr=>{attr.needsUpdate=true;});
    this.particles.material.uniforms.clock.value=t;
  }
}

