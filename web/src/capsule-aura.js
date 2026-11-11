import * as THREE from 'three';

export class CapsuleAura {
  constructor(ball, shiny = false) {
    this.root = new THREE.Group();
    this.root.name = 'Recessed capsule interior light';
    this.strength = 0;
    this.uniforms = {
      emissionPass: { value: 0 }, power: { value: 0 }, time: { value: 0 },
      tint: { value: new THREE.Color(shiny ? 0xffc45b : 0xffedcf) },
      coreTint: { value: new THREE.Color(shiny ? 0xffeab4 : 0xfff8ec) },
    };
    // The actual sealing lips end at y=+/-.008, radius .936. Recess the source
    // inside that opening, so both shells and the front latch naturally occlude it.
    // No exterior disc or rays: bloom comes only from the narrow visible slit.
    const coreMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      side: THREE.FrontSide,
      // Add radiance without writing a silhouette into the beauty alpha buffer.
      // Outline extraction must only see the shell, never the light-source mesh.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: `varying vec2 vUv;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float emissionPass,power,time;
        uniform vec3 tint,coreTint; varying vec2 vUv;
        void main(){
          if(power<.001)discard;
          float edge=1.0-smoothstep(.18,.5,abs(vUv.y-.5));
          float center=exp(-pow((vUv.y-.5)*5.0,2.0));
          float breath=.985+.015*sin(time*1.4);
          vec3 color=mix(tint,coreTint,center);
          float radiance=emissionPass>.5?3.0:2.0;
          float alpha=edge*.88;
          gl_FragColor=vec4(color*radiance*power*breath,alpha);
        }`,
    });
    coreMaterial.userData.emissionPass = this.uniforms.emissionPass;
    coreMaterial.userData.interiorSeam = this.uniforms.power;
    // One continuous ribbon follows the equator and the actual latch cutout.
    // Rounded junctions share vertices: no overlapping cylinder/arc end caps.
    const path=[], sealRadius=.934, latchRadius=.269, joinX=.31, joinY=.06;
    const projectFront=(x,y)=>new THREE.Vector3(x,y,
      Math.sqrt(sealRadius*sealRadius-x*x)+.023*y/latchRadius);
    const startAngle=Math.asin(joinX/sealRadius);
    for(let i=0;i<=224;i++) {
      const angle=startAngle+(Math.PI*2-2*startAngle)*i/224;
      path.push(new THREE.Vector3(sealRadius*Math.sin(angle),0,sealRadius*Math.cos(angle)));
    }
    const arcAngle=Math.asin(joinY/latchRadius), arcX=Math.cos(arcAngle)*latchRadius;
    const corner=(from,control,to)=>{
      for(let i=1;i<=16;i++) {
        const t=i/16,s=1-t;
        path.push(projectFront(s*s*from[0]+2*s*t*control[0]+t*t*to[0],
          s*s*from[1]+2*s*t*control[1]+t*t*to[1]));
      }
    };
    corner([-joinX,0],[-latchRadius,0],[-arcX,joinY]);
    for(let i=1;i<=96;i++) {
      const angle=Math.PI-arcAngle-(Math.PI-2*arcAngle)*i/96;
      path.push(projectFront(Math.cos(angle)*latchRadius,Math.sin(angle)*latchRadius));
    }
    corner([arcX,joinY],[latchRadius,0],[joinX,0]);
    path.pop(); // The indexed closure below shares the first ribbon cross-section.
    const positions=[],uvs=[],indices=[];
    path.forEach((point,i)=>{
      const tangent=path[(i+1)%path.length].clone().sub(path[(i+path.length-1)%path.length]).normalize();
      const outward=new THREE.Vector3(point.x,0,point.z).normalize();
      const across=new THREE.Vector3().crossVectors(tangent,outward).normalize();
      for(let side=0;side<2;side++) {
        const vertex=point.clone().addScaledVector(across,(side?1:-1)*.023);
        positions.push(...vertex.toArray());uvs.push(i/path.length,side);
      }
      const a=i*2,b=((i+1)%path.length)*2;
      indices.push(a,a+1,b,a+1,b+1,b);
    });
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices);
    coreMaterial.side=THREE.DoubleSide;
    const core=new THREE.Mesh(geometry,coreMaterial);
    core.name='Continuous recessed seam light';
    this.root.add(core);
    // Light plug: a glowing disc filling the equator plane just inside the sealing lips.
    // Any view ray entering the seam meets light instead of the capsule interior, so the
    // gap reads as light pouring out, never as a see-through crack.
    const plugMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float emissionPass,power,time; uniform vec3 tint,coreTint; varying vec2 vUv;
        void main(){
          if(power<.001)discard;
          float r=length(vUv-.5)*2.0;
          float rim=smoothstep(.55,1.0,r);
          float shimmer=.94+.06*sin(time*2.3+r*14.0);
          vec3 color=mix(coreTint,tint,rim)*(1.35+rim*1.4)*shimmer;
          gl_FragColor=vec4(color*power*(emissionPass>.5?2.4:1.0),1.0);
        }`,
    });
    plugMaterial.userData.emissionPass = this.uniforms.emissionPass;
    const plug = new THREE.Mesh(new THREE.CircleGeometry(.926, 96), plugMaterial);
    plug.name = 'Seam light plug';
    plug.rotation.x = -Math.PI / 2;
    this.root.add(plug);
    this.seamMeshes=[core, plug];

    // Star-dust gathering: spiralling motes with fading comet trails plus twinkling
    // four-point sparkles, all animated on the GPU. Colour is added without writing
    // alpha, so the overlay's silhouette outline never traces the particles.
    const STREAMS = 130, TRAIL = 7, SPARKS = 22;
    const seeds = [], meta = [];
    let s = shiny ? 517 : 211;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < STREAMS + SPARKS; i++) {
      const spark = i >= STREAMS ? 1 : 0;
      const seed = [rnd() * Math.PI * 2, rnd() * 2 - 1, rnd(), rnd() * .34];
      const trail = spark ? 1 : TRAIL;
      for (let k = 0; k < trail; k++) { seeds.push(...seed); meta.push(k, spark, rnd()); }
    }
    this.particleGeometry = new THREE.BufferGeometry();
    const count = meta.length / 3;
    this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    this.particleGeometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 4));
    this.particleGeometry.setAttribute('meta', new THREE.Float32BufferAttribute(meta, 3));
    this.particleUniforms = {
      emissionPass: this.uniforms.emissionPass, power: { value: 0 }, gather: { value: 0 }, time: this.uniforms.time,
      tint: this.uniforms.tint, viewHeight: { value: 1000 },
      palette: { value: shiny
        ? [new THREE.Color('#ffe7a3'), new THREE.Color('#ffb7d9'), new THREE.Color('#a8f3ff')]
        : [new THREE.Color('#fff4dc'), new THREE.Color('#bfe6ff'), new THREE.Color('#e3c8ff')] },
    };
    const particlesMaterial = new THREE.ShaderMaterial({
      uniforms: this.particleUniforms, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: `
        attribute vec4 seed; attribute vec3 meta;
        uniform float gather, time, viewHeight;
        uniform vec3 palette[3];
        varying vec3 vColor; varying float vAlpha, vSpark, vRot;
        vec3 pathAt(float t) {
          float e = t * t * (3.0 - 2.0 * t);
          float ease = 1.0 - pow(1.0 - e, 1.6);
          float angle = seed.x + (1.0 - ease) * (2.2 + seed.z * 1.8) + time * .25;
          float radius = mix(1.12 + seed.z * .7, .934, ease);
          float y = seed.y * .85 * (1.0 - ease) + sin(seed.x * 3.0 + t * 6.0) * .06 * (1.0 - ease);
          return vec3(cos(angle) * radius, y, sin(angle) * radius);
        }
        void main() {
          float k = meta.x;
          vSpark = meta.y;
          float local = (gather - seed.w) / .62 - k * .028;
          vec3 p = pathAt(clamp(local, 0.0, 1.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float alive = step(0.0, local) * (1.0 - step(1.0, local));
          float arrive = smoothstep(.78, 1.0, local);
          float tail = pow(1.0 - k / 7.0, 1.7);
          float twinkle = .6 + .4 * sin(time * 9.0 + meta.z * 40.0);
          vec3 c = palette[int(mod(floor(meta.z * 3.0), 3.0))];
          vColor = mix(c, vec3(1.0), .35 + arrive * .5);
          float fadeIn = smoothstep(0.0, .12, local);
          vAlpha = alive * fadeIn * tail * (vSpark > .5 ? twinkle * (1.0 - arrive * .6) : (.7 + arrive * 1.4));
          float world = vSpark > .5 ? .11 + .06 * meta.z : (.026 + .02 * meta.z) * (1.0 - k * .1) * (1.0 + arrive * .6);
          gl_PointSize = alive * clamp(world * projectionMatrix[1][1] * viewHeight * .5 / -mv.z, 1.0, 40.0);
          vRot = time * (meta.z - .5) * 2.0 + seed.x;
        }`,
      fragmentShader: `
        uniform float emissionPass, power;
        varying vec3 vColor; varying float vAlpha, vSpark, vRot;
        void main() {
          if (power < .001 || vAlpha < .002) discard;
          vec2 p = gl_PointCoord - .5;
          float d = length(p) * 2.0;
          float a;
          if (vSpark > .5) {
            float c = cos(vRot), s = sin(vRot);
            vec2 q = mat2(c, -s, s, c) * p;
            float rays = exp(-abs(q.x) * 48.0) * exp(-abs(q.y) * 4.5) + exp(-abs(q.y) * 48.0) * exp(-abs(q.x) * 4.5);
            a = exp(-d * d * 30.0) * 1.2 + rays * .9 + exp(-d * d * 5.0) * .12;
          } else {
            a = exp(-d * d * 9.0) + exp(-d * d * 2.5) * .12;
          }
          float energy = emissionPass > .5 ? 3.2 : 1.6;
          gl_FragColor = vec4(vColor * a * vAlpha * power * energy, 0.0);
        }`,
    });
    particlesMaterial.userData.emissionPass = this.uniforms.emissionPass;
    const particles = new THREE.Points(this.particleGeometry, particlesMaterial);
    particles.frustumCulled = false;
    particles.renderOrder = 10;
    particles.visible = false;
    const size = new THREE.Vector2();
    particles.onBeforeRender = renderer => {
      this.particleUniforms.viewHeight.value = renderer.getDrawingBufferSize(size).y;
    };
    this.particles = particles;
    this.root.add(particles);
    this.root.traverse(o=>{o.layers.set(1);o.raycast=()=>{};});
    ball.add(this.root);
  }

  update(dt, target, time, gather = -1) {
    // Gentle fade so the seam halo eases in after the hand-off instead of snapping on.
    this.strength=THREE.MathUtils.damp(this.strength,target,target>this.strength?2.4:7,Math.min(dt,.05));
    this.uniforms.power.value=this.strength;
    // Remove dormant effect geometry entirely after the smooth fade.
    for (const mesh of this.seamMeshes) mesh.visible=this.strength>=.001;
    this.uniforms.time.value=time;
    const active = gather >= 0 && gather <= 1.15;
    this.particles.visible = active;
    this.particleUniforms.power.value = active ? 1 - THREE.MathUtils.smoothstep(gather, 1.0, 1.15) : 0;
    this.particleUniforms.gather.value = Math.max(0, gather);
  }
  dispose(){this.root.removeFromParent();this.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
