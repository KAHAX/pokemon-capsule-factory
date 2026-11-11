import * as THREE from 'three';

// Grid proportions adapted from Bruno Simon's folio-2025 (MIT).
// See /credits/laser-intro.txt for attribution and the photographic sky source.
export async function createGalaxyStage(scene, center, islandRadius, reveal) {
  const texture = await new THREE.TextureLoader().loadAsync('/assets/milky-way-4k.jpg');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  scene.traverse(object => {
    const materials = [].concat(object.material || []);
    if (materials.some(m => /FLEECE \/ honey apricot dyed plush/i.test(m.name))
      || object.name === 'Muted distant night stars') object.visible = false;
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 64, 32), new THREE.ShaderMaterial({
    uniforms: { skyMap: { value: texture } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec2 skyUv;
      void main(){ skyUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D skyMap; varying vec2 skyUv;
      void main(){
        vec3 c=texture2D(skyMap,skyUv).rgb;
        // Keep real star colours and dark dust lanes; a restrained cool grade ties it to the grid.
        c=pow(c,vec3(1.08))*vec3(.66,.81,1.10)*.48;
        gl_FragColor=vec4(c+vec3(.003,.004,.009),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'ESO Milky Way / 360-degree photographic sky';
  sky.userData.laserExempt = true;
  // Galactic centre at the zenith, with the arch crossing overhead from side to side.
  sky.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0));
  sky.rotateX(2.13);
  sky.onBeforeRender=(_renderer,_scene,camera)=>{
    camera.getWorldPosition(sky.position);
    sky.updateMatrixWorld();
  };
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);
  // The floor fades out before the sky, avoiding a hard horizon or a visible wall.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(360,360), new THREE.ShaderMaterial({
    uniforms: {
      center: { value: center }, island: { value: islandRadius }, radius: reveal.radius,
      unit: { value: islandRadius / 3.5 }, warmth: reveal.warmth,
    },
    transparent: true, depthWrite: false, fog: false,
    extensions: { derivatives: true },
    vertexShader: `varying vec3 worldPoint;
      void main(){worldPoint=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldPoint,1.0);}`,
    fragmentShader: `uniform vec2 center; uniform float island,radius,unit,warmth; varying vec3 worldPoint;
      float grid(vec2 p,float spacing,float thickness,float crossSize){
        vec2 q=p/spacing;
        vec2 derivative=max(fwidth(q),vec2(.00001));
        vec2 width=clamp(vec2(thickness),derivative,vec2(1.0));
        vec2 aa=derivative*1.5;
        vec2 mask=step(abs(fract(q)-.5),vec2((1.0-crossSize)*.5));
        float crossMask=1.0-mix(mask.x,1.0,mask.y);
        vec2 d=1.0-abs(fract(q)*2.0-1.0);
        vec2 g=1.0-smoothstep(width-aa,width+aa,d);
        g*=clamp(vec2(thickness)/width,0.0,1.0);
        g=mix(g,vec2(thickness),clamp(derivative*2.0-1.0,0.0,1.0))*crossMask;
        return mix(g.x,1.0,g.y);
      }
      void main(){
        float r=length(worldPoint.xz-center);
        vec3 dark=vec3(.011,.009,.018);
        float crosses=grid(worldPoint.xz,unit,.02,.2);
        float lines=grid(worldPoint.xz,unit*10.0,.002,1.0);
        float distant=1.0-smoothstep(35.0,115.0,r);
        vec3 color=mix(dark,vec3(.266,.091,.90),crosses*distant*.86);
        color=mix(color,vec3(.136,.087,.143),lines*distant*.85);
        float inside=1.0-smoothstep(min(island,radius)-.02,min(island,radius)+.02,r);
        color=mix(color,vec3(.43,.28,.14)*(.92+.08*cos(r*.2)),inside*warmth);
        float alpha=1.0-smoothstep(48.0,140.0,r);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  floor.name='Infinite cross array and major grid';
  floor.rotation.x=-Math.PI/2;
  floor.position.set(center.x,-.71,center.y);
  floor.renderOrder=-90;
  floor.userData.laserExempt=true;
  scene.add(floor);
  // A sky sphere is intentionally absent from depth of field and outlines.
  sky.layers.enable(0);
  return { sky, floor, texture };
}
