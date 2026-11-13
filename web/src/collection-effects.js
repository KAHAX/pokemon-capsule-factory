import * as THREE from 'three';
import { addShinySparkles } from './shiny-sparkles.js';

const textureCache = new Map();
const textureLoader = new THREE.TextureLoader();

function loadEffectTexture(filename, nearest = false) {
  if (!textureCache.has(filename)) {
    textureCache.set(filename, textureLoader.loadAsync(`/assets/pokemon-v5/${filename}`).then((texture) => {
      texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
      return texture;
    }));
  }
  return textureCache.get(filename);
}

export function cloneStyledMaterial(material) {
  const clone = material.clone();
  clone.userData = material.userData;
  clone.onBeforeCompile = material.onBeforeCompile;
  clone.customProgramCacheKey = material.customProgramCacheKey;
  ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'].forEach((key) => {
    if (clone[key]) clone[key].anisotropy = 8;
  });
  return clone;
}

const SHINY_SHADER = `
uniform float v5Time, v5Phase, v5Density, v5Strength, v5StarEnergy, v5Coverage, v5EmissionOnly;
uniform sampler2D v5Random, v5Noise;
varying vec3 v5Coord;
varying vec3 v5WorldNormal;
varying vec3 v5ViewNormal,v5ViewPosition;
float v5Smooth(float a,float b,float x){float t=clamp((x-a)/(b-a),0.0,1.0);return t*t*(3.0-2.0*t);}
vec3 v5Palette(float t){
  vec3 a=vec3(.65,.25,.43),b=vec3(.32,.24,.67),c=vec3(.17,.55,.64),d=vec3(.66,.55,.26);
  if(t<.33)return mix(a,b,v5Smooth(0.0,.33,t));
  if(t<.66)return mix(b,c,v5Smooth(.33,.66,t));
  if(t<.84)return mix(c,d,v5Smooth(.66,.84,t));
  return mix(d,a,v5Smooth(.84,1.0,t));
}
float v5NoiseAt(vec3 p){
  vec3 q=clamp((p+1.0)/3.0,0.0,1.0)*63.0;
  float z=floor(q.z),z1=min(z+1.0,63.0);
  vec2 uv0=vec2((z*64.0+q.x+.5)/4096.0,(q.y+.5)/64.0);
  vec2 uv1=vec2((z1*64.0+q.x+.5)/4096.0,(q.y+.5)/64.0);
  return mix(texture2D(v5Noise,uv0).r,texture2D(v5Noise,uv1).r,fract(q.z));
}
void v5Surface(inout vec3 base,out vec3 glow){
  float phase=fract(v5Time/8.0)+v5Phase;
  float moving=1.7*v5Coord.z+.65*v5Coord.x+.24*v5NoiseAt(v5Coord)-v5Time*.22-v5Phase;
  vec3 color=v5Palette(fract(moving));
  float protect=clamp((dot(base,vec3(.2126,.7152,.0722))-.012)/(.07-.012),0.0,1.0);
  vec2 q=v5Coord.xz*v5Density-phase*vec2(8.0,12.0);
  vec2 tile=mod(floor(q),vec2(8.0,12.0));
  vec3 rnd=texture2D(v5Random,(tile+vec2(.5))/vec2(16.0,12.0)).rgb;
  vec3 rnd2=texture2D(v5Random,(tile+vec2(8.5,.5))/vec2(16.0,12.0)).rgb;
  vec2 p=fract(q)-(.27+.46*rnd.xy);
  float angle=rnd2.x*1.5-.35;
  p=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*p/(.095+.13*rnd.z);
  float theta=atan(p.y,p.x),halfSector=3.14159265359/5.0;
  float a=abs(mod(theta-3.14159265359/2.0+halfSector,2.0*halfSector)-halfSector);
  float boundary=.48*sin(halfSector)/(.48*sin(halfSector-a)+sin(a));
  float outline=1.0-v5Smooth(.035,.075,abs(length(p)-boundary));
  float front=v5Smooth(.22,.62,abs(normalize(v5WorldNormal).y));
  float mask=outline*front*(1.0-step(.62,rnd2.y))*v5Coverage*protect;
  vec3 star=mix(color,vec3(1.0,.92,.8),.42);
  float facing=clamp(1.-abs(dot(normalize(v5ViewNormal),normalize(v5ViewPosition))),0.,1.);
  float fresnel=pow(v5Smooth(.03,.82,facing),1.1);
  float wave=pow(.5+.5*sin(moving*12.56637061436),2.0);
  vec3 flowColor=.1+.9*(.5+.5*cos(6.2831853*(moving+vec3(0.,.333333,.666667))));
  float flow=clamp(protect*v5Strength*(.025+1.2*fresnel),0.,.88);
  base=mix(mix(base,flowColor,flow),star,mask*.08);
  // A visible travelling ribbon on the curved rim, fading to essentially zero
  // on the front-facing body. Its emission is separate from the star patterns.
  glow=flowColor*protect*v5Strength*(.008+fresnel*(.35+.9*wave))+star*mask*v5StarEnergy*.85;
}
`;

async function prepareShiny(root) {
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  const materials = [...new Set(meshes.flatMap((object) => Array.isArray(object.material) ? object.material : [object.material]))]
    .filter((material) => material.userData.shinyV5);
  if (!materials.length) return () => {};
  const noise = await loadEffectTexture('aurora-noise.png');
  const time = { value: 0 };
  const emissionPass = { value: 0 };
  const anchors = new Map();
  const anchorKey = (name) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();
  root.traverse((object) => anchors.set(anchorKey(object.name), object));
  for (const material of materials) {
    const config = material.userData.shinyV5;
    const phase = config.相位偏移;
    const random = await loadEffectTexture(`stars-${Math.round(phase * 1000)}.png`, true);
    const uniforms = {
      v5Time: time, v5EmissionOnly: emissionPass, v5Phase: { value: phase },
      v5Density: { value: config.星星密度 }, v5Strength: { value: config.彩光强度 },
      v5StarEnergy: { value: config.星星亮度 }, v5Coverage: { value: config.星星覆盖 },
      v5Random: { value: random }, v5Noise: { value: noise },
      v5ToSurface: { value: new THREE.Matrix4() }, v5NormalToSurface: { value: new THREE.Matrix3() },
    };
    material.userData.v5Uniforms = uniforms;
    material.userData.emissionPass = emissionPass;
    material.customProgramCacheKey = () => 'pokemon-shiny-v5-fresnel-3';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `uniform mat4 v5ToSurface; uniform mat3 v5NormalToSurface; varying vec3 v5Coord; varying vec3 v5WorldNormal;varying vec3 v5ViewNormal,v5ViewPosition;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec3 v5YUp=(v5ToSurface*vec4(transformed,1.0)).xyz;
        v5Coord=vec3(v5YUp.x,-v5YUp.z,v5YUp.y);
        vec3 v5N=v5NormalToSurface*objectNormal;
        v5WorldNormal=vec3(v5N.x,-v5N.z,v5N.y);
        #include <project_vertex>
        v5ViewPosition=-mvPosition.xyz;
        v5ViewNormal=transformedNormal;
      `);
      shader.fragmentShader = SHINY_SHADER + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 v5Glow;
        v5Surface(diffuseColor.rgb,v5Glow);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += v5Glow;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        if(v5EmissionOnly>0.5) outgoingLight=totalEmissiveRadiance;
        #include <opaque_fragment>
      `);
    };
  }
  for (const mesh of meshes) {
    const previous = mesh.onBeforeRender;
    mesh.onBeforeRender = function (...args) {
      previous?.apply(this, args);
      const material = args[4];
      const uniforms = material.userData.v5Uniforms;
      if (!uniforms) return;
      const anchor = anchors.get(anchorKey(material.userData.shinyV5.coordinateObject));
      if (!anchor) throw new Error(`Missing shiny coordinate anchor ${material.userData.shinyV5.coordinateObject}`);
      uniforms.v5ToSurface.value.copy(anchor.matrixWorld).invert().multiply(mesh.matrixWorld);
      uniforms.v5NormalToSurface.value.getNormalMatrix(uniforms.v5ToSurface.value);
    };
  }
  return (value) => { time.value = value; };
}

async function prepareFire(root, id) {
  if (!['004', '006'].includes(id)) return () => {};
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (/\| fire \| Web V5$/.test(material.name)) materials.add(material);
    }
  });
  if (!materials.size) return () => {};
  const texture = await textureLoader.loadAsync(`/assets/pokemon-v5/${id}-fire.png`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 8;
  const time = { value: 0 };
  const emissionPass = { value: 0 };
  for (const material of materials) {
    material.emissiveMap = texture;
    material.emissive.setRGB(1, 1, 1);
    material.emissiveIntensity = 16;
    material.color.setRGB(0, 0, 0);
    material.userData.emissionPass = emissionPass;
    material.customProgramCacheKey = () => `fire-v5-${id}`;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.fireTime = time;
      shader.uniforms.fireOnly = emissionPass;
      shader.fragmentShader = 'uniform float fireTime; uniform float fireOnly;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_pars_fragment>', `
        #include <emissivemap_pars_fragment>
        vec3 fireFrame(float frame,vec2 uv){
          vec2 cell=vec2(mod(frame,8.0),floor(frame/8.0));
          return texture2D(emissiveMap,(cell+clamp(uv,0.001,0.999))/8.0).rgb;
        }
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        float frame=mod(fireTime*8.0,64.0);
        totalEmissiveRadiance*=mix(fireFrame(floor(frame),vEmissiveMapUv),fireFrame(mod(floor(frame)+1.0,64.0),vEmissiveMapUv),fract(frame));
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        if(fireOnly>0.5) outgoingLight=totalEmissiveRadiance;
        #include <opaque_fragment>
      `);
    };
  }
  return (value) => { time.value = value; };
}

export async function applyCollectionEffects(root, entry) {
  const updates = [];
  if (entry.shiny) { updates.push(await prepareShiny(root)); updates.push(addShinySparkles(root)); }
  updates.push(await prepareFire(root, entry.id));
  return (time) => updates.forEach((update) => update(time));
}

export class CollectionRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    const options = { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: true };
    this.beauty = new THREE.WebGLRenderTarget(1, 1, options);
    this.emission = new THREE.WebGLRenderTarget(1, 1, options);
    this.beauty.samples = 4;
    this.blurA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurB = this.blurA.clone();
    // A second, much wider halo for the strong observation bloom.
    this.blurC = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurD = this.blurC.clone();
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
    this.blur = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { image: { value: null }, stepSize: { value: new THREE.Vector2() } },
      vertexShader,
      fragmentShader: `varying vec2 vUv;uniform sampler2D image;uniform vec2 stepSize;
        void main(){vec3 c=vec3(0.0);float total=0.0;
        for(int i=-15;i<=15;i++){float x=float(i);float weight=exp(-x*x/72.0);c+=texture2D(image,vUv+stepSize*x).rgb*weight;total+=weight;}
        gl_FragColor=vec4(c/total,1.0);}`,
    });
    this.composite = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        beauty: { value: this.beauty.texture }, halo: { value: this.blurB.texture }, haloWide: { value: this.blurD.texture },
        haloEnabled: { value: 0 }, outlineEnabled: { value: 1 }, rainbowOutline: { value: 0 }, interiorSeam: { value: 0 },
        outlineTime: { value: 0 }, pixelSize: { value: new THREE.Vector2() }, pixelRatio: { value: 1 },
      },
      vertexShader,
      fragmentShader: `varying vec2 vUv;uniform sampler2D beauty,halo,haloWide;
        uniform float haloEnabled,outlineEnabled,rainbowOutline,outlineTime,pixelRatio,interiorSeam;
        uniform vec2 pixelSize;
        void main(){
          vec4 b=texture2D(beauty,vUv);
          vec3 h=haloEnabled>.5?texture2D(halo,vUv).rgb*.85+texture2D(haloWide,vUv).rgb*.75:vec3(0.0);
          float a=max(b.a,clamp(max(h.r,max(h.g,h.b)),0.0,1.0));
          vec3 color=b.rgb+h;
          if(outlineEnabled>0.0){
            float outer=b.a,inner=b.a;
            for(int i=0;i<16;i++){
              float angle=float(i)*6.28318530718/16.0;
              vec2 stepUV=vec2(cos(angle),sin(angle))*pixelSize*pixelRatio;
              outer=max(outer,texture2D(beauty,vUv+stepUV*3.0).a);
              inner=min(inner,texture2D(beauty,vUv+stepUV).a);
            }
            float ink=clamp(outer-inner,0.0,1.0)*outlineEnabled;
            // Effects preserve beauty alpha, so only real geometry defines edges.
            // Bloom must never suppress the ball's independent rainbow outline.
            vec3 inkColor=vec3(.06);
            if(rainbowOutline>.5){
              float phase=vUv.x*2.0+vUv.y*1.5-outlineTime/8.0;
              inkColor=vec3(.04)+.85*(.5+.5*cos(6.28318530718*(phase+vec3(0.0,.333333,.666667))));
            }
            color=mix(color,inkColor,ink);
            a=max(a,ink);
          }
          gl_FragColor=vec4(color,a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blur);
    this.scene.add(this.quad);
    this.blackCache = new WeakMap();
    this.size = new THREE.Vector2();
  }

  render(scene, camera, model, { glow = true, outline = true, outlineStrength = Number(outline), rainbow = false, time = 0 } = {}) {
    let hasEmission = false;
    let interiorSeam = 0;
    if (glow) {
      model?.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some((material) => material.userData.emissionPass)) hasEmission = true;
        for (const material of materials) interiorSeam = Math.max(interiorSeam, material.userData.interiorSeam?.value || 0);
      });
    }
    // Always use the same composite path while glowing, so the look never flips
    // between a direct draw and the halo pipeline from one frame to the next.
    if (!glow && outlineStrength <= 0) {
      this.renderer.render(scene, camera);
      return;
    }
    const renderer = this.renderer;
    renderer.getDrawingBufferSize(this.size);
    const width = this.size.x;
    const height = this.size.y;
    if (this.beauty.width !== width || this.beauty.height !== height) {
      this.beauty.setSize(width, height);
      this.emission.setSize(width, height);
      this.blurA.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
      this.blurB.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
      this.blurC.setSize(Math.ceil(width / 4), Math.ceil(height / 4));
      this.blurD.setSize(Math.ceil(width / 4), Math.ceil(height / 4));
    }
    this.composite.uniforms.haloEnabled.value = hasEmission ? 1 : 0;
    this.composite.uniforms.interiorSeam.value = interiorSeam;
    this.composite.uniforms.outlineEnabled.value = THREE.MathUtils.clamp(outlineStrength, 0, 1);
    this.composite.uniforms.rainbowOutline.value = rainbow ? 1 : 0;
    this.composite.uniforms.outlineTime.value = time;
    this.composite.uniforms.pixelSize.value.set(1 / width, 1 / height);
    this.composite.uniforms.pixelRatio.value = renderer.getPixelRatio();
    const previousTarget = renderer.getRenderTarget();
    const background = scene.background;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const originals = [];
    try {
      renderer.setRenderTarget(this.beauty);
      renderer.clear();
      renderer.render(scene, camera);
      if (hasEmission) {
        scene.background = null;
        renderer.setClearColor(0, 0);
        (model || scene).traverse((object) => {
          if (!object.isMesh || !object.layers.test(camera.layers)) return;
          const original = object.material;
          originals.push([object, original]);
          const toBlack = (material) => {
            if (material.userData.emissionPass) {
              material.userData.emissionPass.value = 1;
              return material;
            }
            if (!this.blackCache.has(material)) {
              this.blackCache.set(material, new THREE.MeshBasicMaterial({
                color: 0, map: material.map, alphaMap: material.alphaMap,
                alphaTest: material.alphaTest, opacity: material.opacity,
                transparent: material.transparent, side: material.side, fog: false,
              }));
            }
            const black = this.blackCache.get(material);
            for (const key of ['stencilWrite', 'stencilRef', 'stencilFunc', 'stencilFuncMask', 'stencilWriteMask', 'stencilFail', 'stencilZFail', 'stencilZPass', 'depthTest', 'depthWrite', 'colorWrite']) black[key] = material[key];
            return black;
          };
          object.material = Array.isArray(original) ? original.map(toBlack) : toBlack(original);
        });
        renderer.setRenderTarget(this.emission);
        renderer.clear();
        renderer.render(scene, camera);
        this.quad.material = this.blur;
        this.blur.uniforms.image.value = this.emission.texture;
        this.blur.uniforms.stepSize.value.set(2 / width, 0);
        renderer.setRenderTarget(this.blurA);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        this.blur.uniforms.image.value = this.blurA.texture;
        this.blur.uniforms.stepSize.value.set(0, 2 / height);
        renderer.setRenderTarget(this.blurB);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        this.blur.uniforms.image.value = this.blurB.texture;
        this.blur.uniforms.stepSize.value.set(7 / width, 0);
        renderer.setRenderTarget(this.blurC);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        this.blur.uniforms.image.value = this.blurC.texture;
        this.blur.uniforms.stepSize.value.set(0, 7 / height);
        renderer.setRenderTarget(this.blurD);
        renderer.clear();
        renderer.render(this.scene, this.camera);
      }
      renderer.setClearColor(clearColor, clearAlpha);
      this.quad.material = this.composite;
      renderer.setRenderTarget(previousTarget);
      renderer.clear();
      renderer.render(this.scene, this.camera);
    } finally {
      for (const [object, original] of originals) {
        object.material = original;
        for (const material of Array.isArray(original) ? original : [original]) {
          if (material.userData.emissionPass) material.userData.emissionPass.value = 0;
        }
      }
      scene.background = background;
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.setRenderTarget(previousTarget);
    }
  }
}
