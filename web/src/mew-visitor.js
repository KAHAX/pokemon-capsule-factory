import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const random = (a, b) => a + Math.random() * (b - a);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// A visitor-only glide: keep the floating idle's tail/limbs, but stabilize
// its torso. Sample interpolants so glTF cubic-spline tracks remain valid.
function psychicGlideClip(source) {
  const clip = source.clone();
  clip.name = 'mew_psychic_glide';
  clip.tracks = clip.tracks.map(track => {
    if (!/^(waist|spine_01|spine_02)\.(position|quaternion)$/.test(track.name)) return track;
    const sampler = track.createInterpolant();
    const reference = Array.from(sampler.evaluate(0));
    if (track.name.endsWith('.position')) {
      return new THREE.VectorKeyframeTrack(track.name, [0, clip.duration], [...reference, ...reference]);
    }
    const base = new THREE.Quaternion().fromArray(reference).normalize();
    const pose = new THREE.Quaternion();
    const times = [], values = [];
    const count = Math.ceil(clip.duration * 30);
    for (let i = 0; i <= count; i++) {
      const time = i / count * clip.duration;
      times.push(time);
      pose.fromArray(sampler.evaluate(time)).normalize();
      base.clone().slerp(pose, .18).toArray(values, values.length);
    }
    return new THREE.QuaternionKeyframeTrack(track.name, times, values);
  });
  return clip;
}

// Reusable psychic confetti: a brief flash and a loose three-dimensional spray.
// No aperture, circle, orbiting ring or permanent light.
class MewPortal {
  constructor(parent, scene, camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'Mew / psychic pop and stardust';
    this.root.visible = false;
    parent.add(this.root);
    scene.userData.dreamNoDepth?.add(this.root);
    this.count = 193;
    this.positions = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.alphas = new Float32Array(this.count);
    this.velocities = new Float32Array(this.count * 3);
    this.delays = new Float32Array(this.count);
    this.lives = new Float32Array(this.count);
    this.seeds = new Float32Array(this.count);
    this.geometry = new THREE.BufferGeometry();
    for (const [name,array,itemSize] of [['position',this.positions,3],['opacity',this.alphas,1],['size',this.sizes,1],['seed',this.seeds,1]]) {
      this.geometry.setAttribute(name,new THREE.BufferAttribute(array,itemSize).setUsage(THREE.DynamicDrawUsage));
    }
    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: { pixelScale: { value: 1000 } },
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `attribute float opacity; attribute float size; attribute float seed;
        uniform float pixelScale; varying float vOpacity; varying float vSeed;
        void main(){vOpacity=opacity;vSeed=seed;vec4 p=modelViewMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*pixelScale/max(.1,-p.z),1.,180.);}`,
      fragmentShader: `varying float vOpacity; varying float vSeed;
        void main(){
          vec2 p=(gl_PointCoord-.5)*2.;
          float angle=vSeed*5.7; p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
          float r=length(p);
          float star=exp(-abs(p.x)*28.-abs(p.y)*4.)+exp(-abs(p.y)*28.-abs(p.x)*4.);
          float glow=exp(-r*r*10.);
          float shape=mix(glow,glow*.3+star*.7,step(.7,vSeed));
          if(vSeed<0.) shape=exp(-r*r*8.)*.7+star*.12;
          float alpha=shape*(1.-smoothstep(.65,1.,r))*vOpacity;
          if(alpha<.002) discard;
          vec3 color=vSeed<0.?vec3(5.,3.4,4.5):mix(vec3(4.8,.9,3.7),vec3(1.5,3.2,5.),vSeed);
          gl_FragColor=vec4(color,alpha);
        }`,
    });
    particleMaterial.userData.noToon = true;
    this.particles = new THREE.Points(this.geometry, particleMaterial);
    this.particles.frustumCulled = false;
    const viewport = new THREE.Vector4();
    this.particles.onBeforeRender = renderer => {
      renderer.getCurrentViewport(viewport);
      particleMaterial.uniforms.pixelScale.value = viewport.w * (this.camera?.projectionMatrix.elements[5] || 1);
    };
    this.root.add(this.particles);
    this.age = 100;
    this.duration = 1;
  }

  burst(position, departing = false, startled = false, inside = false) {
    this.age = 0;
    this.duration = startled ? .5 : departing ? .68 : .9;
    this.departing = departing;
    this.flashAt = departing ? (startled ? .12 : .19) : .065;
    this.inside = inside;
    // Preserve the transmission source path for effects inside the real glass.
    this.particles.material.transparent = !inside;
    this.particles.renderOrder = inside ? 900 : 0;
    this.root.position.copy(position); this.root.position.y += .78;
    this.root.visible = true;
    for(let i=1;i<this.count;i++) {
      const a=random(0,Math.PI*2), z=random(-1,1), radial=Math.sqrt(1-z*z);
      const speed=random(3.2,10.2)*(inside?.58:1);
      this.velocities[i*3]=Math.cos(a)*radial*speed;
      this.velocities[i*3+1]=z*speed+random(.2,1.2);
      this.velocities[i*3+2]=Math.sin(a)*radial*speed;
      this.seeds[i]=Math.random();
      this.delays[i]=this.flashAt+random(-.018,.085);
      this.lives[i]=random(.22,this.duration-this.delays[i]);
      this.sizes[i]=this.seeds[i]>.7?random(.17,.30):random(.045,.105);
    }
    this.seeds[0]=-1;
    this.geometry.attributes.seed.needsUpdate=true;
    this.update(0);
  }

  update(dt) {
    if (!this.root.visible) return;
    this.age += dt;
    if (this.age >= this.duration) { this.root.visible = false; return; }
    const flashLife=(this.age-this.flashAt)/.15;
    this.alphas[0]=flashLife>=0&&flashLife<1?Math.pow(1-flashLife,2)*.95:0;
    this.sizes[0]=1.0+Math.max(0,flashLife)*1.7;
    this.positions[0]=this.positions[1]=this.positions[2]=0;
    for(let i=1;i<this.count;i++) {
      const t=this.age-this.delays[i], u=clamp(t/this.lives[i],0,1);
      // Fast initial kick, then drifting glitter; no common circular shell.
      const distance=(1-Math.exp(-Math.max(0,t)*5))/5;
      this.positions[i*3]=this.velocities[i*3]*distance;
      this.positions[i*3+1]=this.velocities[i*3+1]*distance-.65*t*t;
      this.positions[i*3+2]=this.velocities[i*3+2]*distance;
      const twinkle=.7+.3*Math.sin(t*(23+i%13)+i*7.3);
      this.alphas[i]=t>0&&u<1?smooth(t/.025)*Math.pow(1-u,1.25)*twinkle:0;
    }
    this.geometry.attributes.position.needsUpdate=true;
    this.geometry.attributes.opacity.needsUpdate=true;
    this.geometry.attributes.size.needsUpdate=true;
  }
}


export class MewVisitor {
  constructor(actor, { scene, parent, machine, camera }) {
    this.actor = actor;
    this.machine = machine;
    this.portal = new MewPortal(parent, scene, camera);
    this.state = 'hidden';
    this.kind = null;
    this.age = 0;
    this.wait = random(14, 22);
    this.visitCount = 0;
    this.head = actor.rig.getObjectByName('head');
    this.tangent = V();
    this.lookTangent = V();
    actor.clips.push(psychicGlideClip(actor.clips.find(c => c.name.includes('20000_defaultwait01'))));
    this.anchor = V();
    this.root = actor.root;
    this.root.visible = false;
    this.root.userData.mewVisitor = true;
    this.routes = [
      [[-3.8, 6.2, 4], [-5.1, 7.7, 3.6], [-3.2, 9.3, 4.8], [.2, 8.9, 5.2], [3.3, 7.6, 4.8], [4.3, 5, 4.6], [1.4, 4.8, 5.5]],
      [[3.7, 6.3, 4.4], [4.6, 8.3, 4], [1.8, 9.2, 4.8], [-2.1, 8.6, 5], [-4.7, 6.4, 3.9], [-3.5, 4.8, 5], [-.8, 5.5, 5.4]],
    ].map(points => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => V(...p)), false, 'centripetal');
      curve.arcLengthDivisions = 160;
      curve.updateArcLengths();
      return curve;
    });
  }

  // Kept explicit so both variants can be previewed without waiting for chance.
  begin(kind) {
    if (this.state !== 'hidden') return false;
    if (kind === 'inside' && this.machine?.busy) return false;
    this.kind = kind;
    this.lastKind = kind;
    this.visitCount++;
    this.state = 'arriving';
    this.age = 0;
    this.duration = kind === 'inside' ? random(9, 14) : random(3.4, 4.4) / .75;
    this.route = this.routes[Math.random() < .5 ? 0 : 1];
    this.anchor.copy(kind === 'inside' ? V(.06, 6.65, .1) : this.route.getPointAt(0));
    this.root.position.copy(this.anchor);
    this.route.getTangentAt(0, this.tangent);
    const yaw = kind === 'inside' ? .5 : Math.atan2(this.tangent.x, this.tangent.z);
    this.root.rotation.set(0, yaw, 0);
    this.actor.targetYaw = yaw;
    this.root.scale.setScalar(.001);
    this.actor.play(kind === 'inside' ? '20000_defaultwait01' : 'mew_psychic_glide', .1, kind === 'inside' ? 1 : .8);
    this.actor.action.reset();
    this.root.visible = true;
    this.portal.burst(this.root.position, false, false, kind === 'inside');
    return true;
  }

  leave(startled = false) {
    if (this.state === 'hidden' || this.state === 'departing') return;
    this.state = 'departing';
    this.age = 0;
    this.startled = startled;
    this.exitScale = this.root.scale.x;
    this.anchor.copy(this.root.position);
    this.actor.play(startled ? '20560_notice01' : '20000_defaultwait01', .06, startled ? 2.6 : 1, true);
    this.portal.burst(this.anchor, true, startled, this.kind === 'inside');
  }

  startle() {
    if (this.kind === 'inside' && this.state !== 'hidden') this.leave(true);
  }

  update(dt) {
    this.portal.update(dt);
    if (this.state === 'hidden') {
      this.wait -= dt;
      if (this.wait <= 0) {
        // Alternate often enough to show both surprises; never enter during spin.
        const insideChance = this.lastKind === 'inside' ? .25 : .65;
        this.begin(!this.machine?.busy && Math.random() < insideChance ? 'inside' : 'outside');
      }
      return;
    }
    this.age += dt;
    if (this.kind === 'inside' && this.machine?.spinning) this.startle();
    if (this.state === 'arriving') {
      const pop = clamp((this.age - .055) / .29, 0, 1);
      const overshoot = this.kind === 'inside' ? 1.0 : 1.8;
      const q = pop - 1;
      const scale = 1 + (overshoot + 1) * q*q*q + overshoot * q*q;
      this.root.scale.setScalar(Math.max(.001, scale));
      this.root.position.copy(this.anchor);
      this.root.position.y += .78 * (1 - this.root.scale.x);
      if (this.age >= .38) { this.state = 'visiting'; this.age = 0; this.root.scale.setScalar(1); }
    } else if (this.state === 'visiting') {
      if (this.kind === 'inside') {
        this.root.position.copy(this.anchor);
        this.root.position.y += Math.sin(this.age * 1.65) * .045;
        this.actor.targetYaw = .5 + Math.sin(this.age * .72) * .85;
        // The second idle and happy jump exceed the glass cap. Only the small
        // first idle is used inside, along with the original hovering loop.
        const curious = this.age > 2.2 && this.age < 7.8;
        this.actor.play(curious ? '20010_defaultidle01' : '20000_defaultwait01', .45, 1, curious);
      } else {
        const u = clamp(this.age / this.duration, 0, 1);
        const progress = .75 * u + .25 * smooth(u);
        this.route.getPointAt(progress, this.root.position);
        this.route.getTangentAt(progress, this.tangent);
        this.actor.targetYaw = Math.atan2(this.tangent.x, this.tangent.z);
        this.actor.play('mew_psychic_glide', .35, .8);
        // Lean only into actual bends, never add a periodic bob or stroke.
        this.route.getTangentAt(Math.min(1, progress + .035), this.lookTangent);
        const turn = Math.atan2(
          this.tangent.z * this.lookTangent.x - this.tangent.x * this.lookTangent.z,
          this.tangent.x * this.lookTangent.x + this.tangent.z * this.lookTangent.z);
        this.root.rotation.z = THREE.MathUtils.damp(this.root.rotation.z, clamp(-turn * .35, -.1, .1), 4, dt);
      }
      if (this.age >= this.duration) this.leave();
    } else if (this.state === 'departing') {
      const duration = this.startled ? .20 : .30;
      const u = clamp(this.age / duration, 0, 1);
      this.root.scale.setScalar(Math.max(.001, this.exitScale * (1 - smooth(u))));
      this.root.position.copy(this.anchor);
      this.root.position.y += .78 * smooth(u);
      this.root.position.y += Math.sin(u * Math.PI) * (this.startled ? .18 : .12);
      if (u >= 1) {
        this.root.visible = false;
        this.root.scale.setScalar(1);
        this.root.rotation.z = 0;
        this.state = 'hidden';
        this.wait = random(34, 64);
        return;
      }
    }
    this.actor.update(dt);
    if (this.head && this.kind === 'inside' && this.state === 'visiting') {
      this.head.rotation.y += Math.sin(this.age * 1.4) * .13;
      this.head.rotation.x += Math.sin(this.age * .85) * .08;
    }
  }
}
