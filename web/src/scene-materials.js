import * as THREE from 'three';

import { softenSuspensionThreads } from './suspension-threads.js';

// Refine only scene surfaces; authored lights and interaction materials keep their behavior.
export function refineSceneMaterials(scene, renderer) {
  const treated = new Set();
  const threadAttachments = [];
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const treatedGlass = new Set();
  scene.traverse(object => {
    if (object.isMesh) {
      const threads = softenSuspensionThreads(object);
      if (threads) threadAttachments.push([object, threads]);
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      if (surfaces.some(m => m?.transmission > .5)) object.castShadow = false;
      for (const material of surfaces) {
        if (material && !treated.has(material)) {
          treated.add(material);
          if (/FLEECE \/ honey apricot dyed plush/i.test(material.name)) {
            material.fog = true;
            // World-space fade follows the existing seamless cylindrical carpet.
            // Keep the nearby floor warm and let both distance and height darken the backdrop.
            material.onBeforeCompile = shader => {
              shader.vertexShader = 'varying vec3 vCarpetWorld;\n' + shader.vertexShader;
              shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
                '#include <begin_vertex>\nvCarpetWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
              shader.fragmentShader = `varying vec3 vCarpetWorld;
                float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
              ` + shader.fragmentShader;
              shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
                float distanceFade = smoothstep(9.0, 46.0, length(vCarpetWorld.xz));
                float heightFade = smoothstep(0.5, 17.0, vCarpetWorld.y);
                float backdropFade = 1.0 - (1.0 - distanceFade) * (1.0 - heightFade);
                vec3 skyDirection = normalize(vCarpetWorld - vec3(0.0, 2.0, 0.0));
                vec2 skyUV = vec2(atan(skyDirection.x, skyDirection.z) / 6.2831853 + 0.5,
                  asin(clamp(skyDirection.y, -1.0, 1.0)) / 3.14159265 + 0.5);
                float clouds = 0.5 + 0.18 * sin(skyUV.x * 24.0 + skyUV.y * 15.0)
                  + 0.12 * sin(skyUV.x * 43.0 - skyUV.y * 21.0);
                vec3 nightBlue = mix(vec3(.011, .016, .026), vec3(.027, .033, .047), clouds);
                vec2 starGrid = skyUV * vec2(150.0, 100.0);
                vec2 cell = floor(starGrid);
                float seed = skyHash(cell);
                vec2 center = vec2(skyHash(cell + 4.1), skyHash(cell + 7.7)) * .6 + .2;
                float starDistance = length(fract(starGrid) - center);
                float radius = mix(.035, .085, skyHash(cell + 13.0));
                float star = (1.0 - smoothstep(0.0, radius, starDistance))
                  + .12 * exp(-starDistance * starDistance / .012);
                star *= step(.93, seed) * mix(.22, .85, skyHash(cell + 19.0));
                float skyMask = smoothstep(1.5, 9.0, vCarpetWorld.y) * backdropFade;
                outgoingLight = mix(outgoingLight, nightBlue, backdropFade * .99);
                outgoingLight += mix(vec3(.67,.77,.95), vec3(.98,.88,.7), skyHash(cell+3.0)) * star * skyMask;
                #include <opaque_fragment>
              `);
            };
            material.customProgramCacheKey = () => 'warm-floor-muted-starry-cyclorama-v3';
            material.needsUpdate = true;
          }
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
            if (material[key]) material[key].anisotropy = anisotropy;
          }
          if (material.isMeshStandardMaterial) {
            material.envMapIntensity = material.metalness > .5 ? .8 : .6;
            // Carpet should reflect illumination, not glow and wash out contact shadows.
            if (/background|ground|apricot|fleece|floor|vanilla|butter/i.test(material.name) && material.emissiveMap) {
              material.emissiveIntensity = Math.min(material.emissiveIntensity, .015);
            }
          }
        }
        if (!material?.isMeshPhysicalMaterial || !/Optical clear borosilicate|Feeder tube glass/i.test(material.name) || treatedGlass.has(material)) continue;
        treatedGlass.add(material);
        material.color.set('#ffffff');
        material.transmission = 1;
        material.roughness = .012;
        material.ior = 1.34;
        material.thickness = .035;
        material.attenuationColor.set('#ffffff');
        material.attenuationDistance = Infinity;
        material.envMapIntensity = .65;
        material.clearcoat = 0;
        material.side = THREE.FrontSide;
        // A view-dependent tint on the existing glass: clear face, soft darker rim.
        // No extra shell geometry, so the transparent surface keeps its depth/sorting.
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            float glassFacing = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
            float glassEdge = pow(1.0 - glassFacing, 3.4);
            outgoingLight *= mix(vec3(1.0), vec3(0.58, 0.63, 0.68), glassEdge);
            #include <opaque_fragment>
          `);
        };
        material.customProgramCacheKey = () => 'clear-studio-glass-edge-v2';
        material.needsUpdate = true;
      }
    }
    if (object.isMesh && object.name.toLowerCase().replace(/[^a-z]/g, '').includes('raisedfrontquestionplate')) {
      // Red enamel over metal; isolate it from the shared aluminium trim.
      const redFace = source => {
        const material = source.clone();
        material.name = 'Question box / red enamel metal faceplate';
        material.color.set('#c63830');
        material.metalness = .35;
        material.roughness = .28;
        material.envMapIntensity = 1.0;
        material.emissive.set(0x000000);
        material.emissiveIntensity = 0;
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(redFace) : redFace(object.material);
    }
    if (!object.isMesh || !object.name.toLowerCase().replace(/[^a-z]/g, '').includes('frontivoryquestion')) return;
    const cloneQuestionMaterial = source => {
      const material = source.clone();
      // Preserve the charge shader and its live uniform when refining enamel.
      material.onBeforeCompile = source.onBeforeCompile;
      material.customProgramCacheKey = source.customProgramCacheKey;
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneQuestionMaterial) : cloneQuestionMaterial(object.material);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!/Fire \| 04 奶白问号 · Ivory enamel/.test(material.name)) continue;
      material.color.set('#fff0ce');
      material.emissive.set('#ffe0a0');
      material.emissiveIntensity = 4.5;
      material.metalness = .02;
      material.roughness = .3;
    }
  });
  for (const [object, threads] of threadAttachments) object.add(threads);
}


