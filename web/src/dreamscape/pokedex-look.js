import * as THREE from 'three';

// Night-studio look for the Pokédex: cool/magenta rim lighting, dot-matrix CRT LCDs,
// breathing indicator lamps and soft optical glows.
const glowTexture = (() => {
  let texture;
  return () => {
    if (texture) return texture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.18, 'rgba(255,255,255,.55)');
    gradient.addColorStop(.5, 'rgba(255,255,255,.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
})();

function crtLcd(material, time) {
  const map = material.map;
  const res = new THREE.Vector2(map?.image?.width || 160, map?.image?.height || 144);
  material.emissiveMap = material.emissiveMap || map;
  material.emissive.set('#ffffff');
  material.emissiveIntensity = 1.15;
  material.color.multiplyScalar(.28);
  material.roughness = .12;
  if ('clearcoat' in material) { material.clearcoat = 1; material.clearcoatRoughness = .08; }
  material.onBeforeCompile = shader => {
    shader.uniforms.uCrtTime = time;
    shader.uniforms.uCrtRes = { value: res };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCrtTime;\nuniform vec2 uCrtRes;')
      .replace('#include <emissivemap_fragment>', `
#ifdef USE_EMISSIVEMAP
  vec2 crtUv = vEmissiveMapUv;
  vec2 crtC = crtUv - .5;
  crtUv = .5 + crtC * (1. + .035 * dot(crtC, crtC));
  crtUv.x += sin(crtUv.y * 90. + uCrtTime * 9.) * .0009;
  vec2 crtCell = crtUv * uCrtRes;
  vec2 crtSnap = (floor(crtCell) + .5) / uCrtRes;
  vec3 crtCol = texture2D(emissiveMap, crtSnap).rgb;
  crtCol.r = mix(crtCol.r, texture2D(emissiveMap, crtSnap + vec2(1. / uCrtRes.x, 0.)).r, .35);
  float crtDot = smoothstep(.56, .22, length(fract(crtCell) - .5));
  float crtScan = .86 + .14 * sin(crtUv.y * uCrtRes.y * 6.2832);
  float crtRoll = .9 + .1 * smoothstep(.0, .12, abs(fract(crtUv.y * .7 - uCrtTime * .11) - .5));
  float crtFlicker = .97 + .03 * sin(uCrtTime * 61.);
  float crtEdge = smoothstep(.0, .04, crtUv.x) * smoothstep(1., .96, crtUv.x) * smoothstep(.0, .04, crtUv.y) * smoothstep(1., .96, crtUv.y);
  totalEmissiveRadiance *= crtCol * mix(.28, 1.35, crtDot) * crtScan * crtRoll * crtFlicker * crtEdge;
  totalEmissiveRadiance += vec3(.02, .05, .04) * crtEdge;
#endif`);
  };
  material.customProgramCacheKey = () => 'dreamscape-pokedex-crt-lcd-v1';
  material.needsUpdate = true;
}

export function enhancePokedex(pack) {
  const time = { value: 0 };
  const { scene, model, renderer } = pack;
  renderer.toneMappingExposure = .92;

  // Lighting: keep the warm key, recolour the rest towards the dreamscape palette.
  for (const light of scene.children.filter(object => object.isLight)) {
    if (light.isHemisphereLight) { light.color.set('#c9d8ff'); light.groundColor.set('#1d1233'); light.intensity = .5; }
    else if (light.position.x > 0 && light.position.z > 0) { light.color.set('#8cc4ff'); light.intensity = 1.05; }
    else if (light.position.z < 0) { light.color.set('#ff7fd8'); light.intensity = 1.9; }
    else { light.color.set('#fff0de'); light.intensity = 2.2; }
  }
  const cyanRim = new THREE.DirectionalLight('#5fe8ff', 2.1);
  cyanRim.position.set(6, 1.5, -4);
  const under = new THREE.DirectionalLight('#6a5bff', .7);
  under.position.set(0, -5, 4);
  scene.add(cyanRim, under);

  const lamps = [];
  const materials = new Set();
  model.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const material of materials) {
    const name = material.name || '';
    if (/^LCD \|/.test(name) && material.map) crtLcd(material, time);
    else if (/Vermilion|Raised red|Rear cover/.test(name) && 'sheen' in material) {
      material.sheen = .35; material.sheenRoughness = .4; material.sheenColor = new THREE.Color('#ff9c8a');
    } else if (/Auxiliary LCD/.test(name)) {
      material.emissive.set('#5dff8a'); lamps.push({ material, base: .55, amp: .25, speed: 1.3, phase: 0 });
    } else if (/Indicator green/.test(name)) lamps.push({ material, base: 1.4, amp: .9, speed: 2.4, phase: 1 });
    else if (/Indicator amber/.test(name)) lamps.push({ material, base: 1.2, amp: 1.2, speed: 5.5, phase: 2, blink: true });
    else if (/Lens cyan glint/.test(name)) { material.emissive.set('#3fd8ff'); lamps.push({ material, base: 1.2, amp: .5, speed: 1.7, phase: 3 }); }
  }

  // Soft optical halos (the Pokédex canvas has no bloom pass).
  const halos = [];
  const addHalo = (key, color, size, strength) => {
    let target = null;
    model.traverse(object => { if (!target && object.isMesh && object.name.replace(/[^a-z]/gi, '').toLowerCase() === key) target = object; });
    if (!target) return;
    target.geometry.computeBoundingSphere();
    const sphere = target.geometry.boundingSphere;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: strength,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(sphere.center);
    sprite.scale.setScalar(sphere.radius * size);
    sprite.renderOrder = 10;
    target.add(sprite);
    halos.push({ sprite, strength, phase: halos.length * 1.7 });
  };
  addHalo('domedcobaltscanner', '#3aa8ff', 4.2, .55);
  addHalo('displaystatuslamp', '#7dff6a', 5, .5);
  addHalo('screenamberled', '#ffb13a', 5, .45);
  addHalo('yellowactionkey', '#ffd34e', 3, .22);

  return {
    update(dt) {
      time.value += dt;
      const t = time.value;
      for (const lamp of lamps) {
        let wave = .5 + .5 * Math.sin(t * lamp.speed + lamp.phase);
        if (lamp.blink) wave = wave > .55 ? 1 : .08;
        lamp.material.emissiveIntensity = lamp.base + lamp.amp * (wave - .5) * 2;
      }
      for (const halo of halos) halo.sprite.material.opacity = halo.strength * (.78 + .22 * Math.sin(t * 2.1 + halo.phase));
    },
  };
}
