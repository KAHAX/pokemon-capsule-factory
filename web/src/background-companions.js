import { prepareCompanionRendering } from './companion-rendering.js';
import * as THREE from 'three';
import { createAssetLoader } from './asset-loader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

import { prepareRaikou, RaikouCompanion } from './raikou-companion.js';
import { prepareReshiram, ReshiramCompanion, ZEKROM_LAYOUT } from './reshiram-companion.js';
import { SkyRayquaza, WanderingCompanion } from './wildlife-companions.js';
import { MewVisitor } from './mew-visitor.js';

const TAU = Math.PI * 2;
const smooth = t => t * t * (3 - 2 * t);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Author the routes outside the animation rig. Remove locomotion's forward drift,
// retaining the original vertical bounce, joints, ears and facial animation.
function inPlaceClip(clip) {
  const copy = clip.clone();
  if (/run01|walk01/.test(copy.name)) {
    for (const track of copy.tracks) {
      if (!/^origin\.position$/i.test(track.name)) continue;
      for (let i = 3; i < track.values.length; i += 3) {
        track.values[i] = track.values[0];
        track.values[i + 2] = track.values[2];
      }
    }
  }
  return copy;
}

export class CompanionActor {
  constructor(asset, name, size, floating = false, first = 'defaultwait01') {
    this.root = new THREE.Group();
    this.root.name = name;
    this.rig = cloneSkeleton(asset.scene);
    this.placement = new THREE.Group();
    this.placement.add(this.rig);
    this.root.add(this.placement);
    this.clips = asset.animations.map(inPlaceClip);
    this.mixer = new THREE.AnimationMixer(this.rig);
    this.retiring = [];
    this.play(first, 0);
    this.mixer.update(0);
    this.rig.updateMatrixWorld(true);
    this.rig.traverse(mesh => {
      if (mesh.isSkinnedMesh) { mesh.skeleton.update(); mesh.computeBoundingBox(); }
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    });
    const box = new THREE.Box3().setFromObject(this.rig, true);
    const center = box.getCenter(v());
    const extent = box.getSize(v());
    const scale = size / (floating ? Math.max(extent.x, extent.y, extent.z) : extent.y);
    this.placement.scale.setScalar(scale);
    this.rig.position.add(v(-center.x, floating ? -center.y : -box.min.y, -center.z));
    this.size = size;
    this.targetYaw = 0;
    this.updateEnvelope = prepareCompanionRendering(this.root, { outlines: !/雷希拉姆|捷克罗姆|烈空坐/.test(name) });
  }

  play(key, fade = .3, speed = 1, once = false) {
    if (this.key === key) { this.action?.setEffectiveTimeScale(speed); return; }
    const clip = this.clips.find(c => c.name.includes(key));
    if (!clip) throw new Error(`${this.root.name}: missing ${key}`);
    this.key = key;
    const next = this.mixer.clipAction(clip);
    this.retiring = this.retiring.filter(entry => entry.action !== next);
    const old = this.action;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(speed);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (old && old !== next && fade > 0) {
      next.crossFadeFrom(old, fade, false);
      this.retiring.push({ action: old, until: this.mixer.time + fade });
    } else old?.stop();
    this.action = next;
  }

  update(dt) {
    this.mixer.update(dt);
    this.updateEnvelope();
    this.retiring = this.retiring.filter(entry => {
      if (this.mixer.time < entry.until) return true;
      entry.action.stop(); return false;
    });
    const delta = Math.atan2(Math.sin(this.targetYaw - this.root.rotation.y), Math.cos(this.targetYaw - this.root.rotation.y));
    this.root.rotation.y += delta * (1 - Math.exp(-dt * 7));
  }
}

function circuitPanel(parent, position, normal, scale) {
  const group = new THREE.Group();
  group.name = 'Live service circuit / attached to existing cabinet';
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(v(0, 0, 1), normal);
  group.scale.setScalar(scale);
  const brass = new THREE.MeshStandardMaterial({ color: '#cfaa56', metalness: .7, roughness: .33 });
  const board = new THREE.MeshStandardMaterial({ color: '#164c49', metalness: .15, roughness: .55 });
  const black = new THREE.MeshStandardMaterial({ color: '#252f32', roughness: .65 });
  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); group.add(mesh); return mesh;
  }
  box(.56, .7, .07, brass, 0, 0, 0);
  box(.48, .62, .025, board, 0, 0, .048);
  box(.19, .22, .035, black, 0, 0, .075);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    box(.11, .014, .01, brass, side * .14, -.09 + i * .06, .08);
  }
  for (const x of [-.21, .21]) for (const y of [-.27, .27]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .025, 8), brass);
    screw.rotation.x = Math.PI / 2; screw.position.set(x, y, .075); group.add(screw);
  }
  parent.add(group);
  return position.clone().addScaledVector(normal, .1 * scale);
}

class RepairSparks {
  constructor(parent, contact) {
    this.contact = contact;
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(240 * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.LineBasicMaterial({ color: new THREE.Color(5, 2.6, .6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.name = 'Intermittent circuit repair sparks';
    this.lines.frustumCulled = false;
    parent.add(this.lines);
    this.light = new THREE.PointLight('#ffd789', 0, 2.5, 2);
    this.light.position.copy(contact).add(v(0, .08, .06));
    parent.add(this.light);
    this.start = v(); this.a = v(); this.b = v();
  }
  update(t, strength, hand) {
    this.lines.visible = strength > .01;
    this.light.intensity = strength * 4;
    if (strength <= .01) return;
    hand.getWorldPosition(this.start);
    const jitter = Math.floor(t * 24);
    const noise = n => Math.sin(n * 127.1 + jitter * 91.7);
    let count = 0;
    const segment = (a, b) => {
      a.toArray(this.positions, count * 3); count++;
      b.toArray(this.positions, count * 3); count++;
    };
    for (let branch = 0; branch < 2; branch++) {
      this.a.copy(this.start);
      for (let i = 1; i <= 9; i++) {
        const u = i / 9, spread = Math.sin(u * Math.PI) * .09;
        this.b.lerpVectors(this.start, this.contact, u);
        this.b.x += spread * noise(i + branch * 12);
        this.b.y += spread * noise(i * 3 + branch * 32);
        this.b.z += spread * noise(i * 7 + branch * 51);
        segment(this.a, this.b); this.a.copy(this.b);
      }
    }
    for (let i = 0; i < 14; i++) {
      const life = (t * (1.3 + (i % 3) * .2) + i * .071) % 1;
      this.a.set(Math.cos(i * 2.4) * life * .38, Math.sin(i * 1.7) * life * .4 - life * life * .3, Math.sin(i * 3.8) * life * .25).add(this.contact);
      this.b.copy(this.a).add(v(noise(i) * .045, -.035, noise(i + 4) * .035));
      segment(this.a, this.b);
    }
    this.geometry.setDrawRange(0, count);
    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = strength;
  }
}

export class BackgroundCompanions {
  constructor(scene, { machine, camera } = {}) {
    this.scene = scene;
    this.machine = machine;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'Background Pokemon / repair, flight and play';
    scene.add(this.group);
    this.time = 0;
    this.ready = false;
    this.workers = [];
    this.pals = [];
  }

  async load({ onProgress = () => {} } = {}) {
    const assetLoader = createAssetLoader();
    let completed = 0;
    const loader = { loadAsync: async url => {
      const asset = await assetLoader.loadAsync(url);
      onProgress(++completed, 12);
      return asset;
    } };
    this.loadErrors = [];
    const ids = ['081', '311', '312', '587', '243'];
    const loaded = await Promise.all(ids.map(id => loader.loadAsync(`/assets/companions/${id}.glb`)));
    const assets = Object.fromEntries(ids.map((id, i) => [id, loaded[i]]));
    for (const asset of loaded) asset.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material.isMeshStandardMaterial) material.envMapIntensity = .65;
        for (const property of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
          if (material[property]) material[property].anisotropy = 4;
        }
      }
    });
    // Separate repair stations; the additional technicians work on existing terminals.
    const stations = [
      // One support bay toward the machine keeps the entire animated rig and
      // repair arc clear of the route sign (its right edge is x = -7.96).
      { position: [-6.1, 3.1, -1.05], circuit: [-7.3, 2.15, -2.24], normal: [0, 0, 1], size: 1.45, panel: 1, yaw: .2, hand: 'left_hand', offset: 0 },
      { position: [-20.1, 3.15, -1.05], circuit: [-19.2, 2.15, -2.24], normal: [0, 0, 1], size: 1.85, panel: 1, yaw: -.22, hand: 'right_hand', offset: 4.1 },
      { position: [-25.3, 3.15, -1.05], circuit: [-24, 2.15, -2.24], normal: [0, 0, 1], size: 1.85, panel: 1, yaw: -.3, hand: 'right_hand', offset: 7.3 },
      { position: [7.25, 3.3, -1.85], circuit: [5.14, 2.3, -3.18], normal: [1, 0, 0], size: 1.45, panel: 0, yaw: -.45, hand: 'right_hand', offset: 2.2 },
    ];
    for (const [i, config] of stations.entries()) {
      const actor = new CompanionActor(assets['081'], `小磁怪 ${i + 1} / circuit technician`, config.size, true);
      actor.root.position.fromArray(config.position);
      actor.root.rotation.y = actor.targetYaw = config.yaw;
      this.group.add(actor.root);
      const contact = config.panel
        ? circuitPanel(this.group, v(...config.circuit), v(...config.normal), config.panel)
        : v(...config.circuit);
      const hand = actor.rig.getObjectByName(config.hand);
      if (!hand) throw new Error(`Missing repair magnet: ${config.hand}`);
      this.workers.push({ actor, config, hand, sparks: new RepairSparks(this.group, contact) });
    }
    this.flyer = new CompanionActor(assets['587'], '电飞鼠 / looping glide', 1.65, true, 'fi21_run01');
    this.group.add(this.flyer.root);
    // Measure the original standing pose, so feet rest on the ball's actual top
    // surface rather than positioning a floating model's center on the surface.
    this.flyer.play('kw01_wait01', 0);
    this.flyer.update(0);
    this.flyer.root.updateMatrixWorld(true);
    const standingBox = new THREE.Box3().setFromObject(this.flyer.root, true);
    this.perch = v(-4.7, 15.32 - standingBox.min.y + .012, -3.65);
    this.flightCurve = new THREE.CatmullRomCurve3([
      this.perch.clone(), this.perch.clone().add(v(4, 2, 1)),
      v(-22, 15.4, -21), v(-12, 12.2, -13), v(3, 11.8, -10),
      v(5, 12.7, -14), v(-10, 13.3, -19), v(-24, 16.9, -25),
      this.perch.clone().add(v(3, 1.4, -.3)), this.perch.clone(),
    ], false, 'centripetal');
    this.flightCurve.arcLengthDivisions = 300;
    this.flightCurve.updateArcLengths();
    this.flightTangent = v();
    this.nextTangent = v();
    for (const [i, id] of ['311', '312'].entries()) {
      const actor = new CompanionActor(assets[id], i ? '负电拍拍 / playmate' : '正电拍拍 / playmate', 1.45 * 1.5);
      this.pals.push(actor); this.group.add(actor.root);
    }
    const raikouActor = new CompanionActor(prepareRaikou(assets['243']), '雷公 / rear clearing patrol', 5.85);
    this.group.add(raikouActor.root);
    this.raikou = new RaikouCompanion(raikouActor, this.scene.getObjectByName('Background / luminous energy charging pillar'));
    this.ready = true;
    this.update(0);
    // Stage the heavier actors behind the loading screen to bound decode memory.
    const [reshiramAsset, skillClips] = await Promise.all([
      loader.loadAsync('/assets/companions/643.glb'),
      fetch('/assets/companions/reshiram-skill-clips.json').then(response => {
        if (!response.ok) throw new Error('Reshiram skill clips unavailable');
        return response.json();
      }),
    ]);
    reshiramAsset.animations.push(...skillClips.map(clip => THREE.AnimationClip.parse(clip)));
    reshiramAsset.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material.isMeshStandardMaterial) material.envMapIntensity = .65;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
          if (material[key]) material[key].anisotropy = 4;
        }
      }
    });
    const legendSize = raikouActor.size * 3 * .75;
    const reshiramActor = new CompanionActor(prepareReshiram(reshiramAsset), '雷希拉姆 / distant clearing and high flight', legendSize);
    this.group.add(reshiramActor.root);
    this.reshiram = new ReshiramCompanion(reshiramActor);
    this.reshiram.update(0);
    await this.loadWildlife(loader, legendSize);
    if (this.loadErrors.length) throw new Error(`场景宝可梦加载失败：${this.loadErrors.join('、')}`);
    this.fullyLoaded = true;
  }

  // Load independently, then report failures before revealing an incomplete scene.
  async loadWildlife(loader, legendSize) {
    const tune = asset => {
      asset.scene.traverse(mesh => {
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material.isMeshStandardMaterial) material.envMapIntensity = .65;
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (material[key]) material[key].anisotropy = 4;
        }
      });
      return asset;
    };
    const load = (id, name) => loader.loadAsync(`/assets/pokemon-v5/${id}.glb`).then(tune).catch(error => {
      console.warn(`${name} (${id}.glb) is not in the capsule machine yet — run scripts/sync-collection.mjs.`, error?.message || error);
      this.loadErrors.push(name);
      return null;
    });
    this.wanderers = [];
    // Zekrom: same body size as Reshiram, its own left-hand clearing and sky arc,
    // starting half a cycle later so the two dragons fly at different times.
    const pending = [];
    pending.push(load('644', '捷克罗姆').then(asset => {
      if (!asset) return;
      const actor = new CompanionActor(prepareReshiram(asset), '捷克罗姆 / left clearing and high flight', legendSize);
      this.group.add(actor.root);
      this.zekrom = new ReshiramCompanion(actor, ZEKROM_LAYOUT, { startTime: (this.reshiram?.cycle || 90) * .5 });
      this.zekrom.update(0);
    }));
    // Small ground Pokémon in open patches around the stage.
    const ground = [
      { id: '025', name: '皮卡丘 / roaming the right meadow', species: 'pikachu', size: 2.2, center: [11.2, -.69, -3.6], radius: 1.9, walkSpeed: 1.1, runSpeed: 3.1, startYaw: -1.9, delay: 0 },
      { id: '135', name: '雷伊布 / roaming the left meadow', species: 'jolteon', size: 2.9, center: [-20, -.69, .8], radius: 2.2, walkSpeed: 1.3, runSpeed: 3.8, startYaw: 1.2, delay: 1.5 },
      { id: '104', name: '卡拉卡拉 / pottering near the cart', species: 'cubone', size: 2.1, center: [-16.5, -.69, 5.2], radius: 1.5, walkSpeed: .9, runSpeed: 2.4, startYaw: .6, delay: 3 },
    ];
    for (const config of ground) pending.push(load(config.id, config.name).then(asset => {
      if (!asset) return;
      const first = config.species === 'cubone' ? 'kw01_wait01' : '00000_defaultwait01';
      const actor = new CompanionActor(asset, config.name, config.size, false, first);
      this.group.add(actor.root);
      this.wanderers.push(new WanderingCompanion(actor, { ...config, peers: () => this.wanderers }));
    }));
    // Rayquaza: high in the galaxy, always in flight.
    pending.push(load('384', '烈空坐').then(asset => {
      if (!asset) return;
      const actor = new CompanionActor(asset, '烈空坐 / high-sky patrol', 50, true, '20030_walk01');
      // Only this background actor receives the night treatment; collection models
      // retain their original materials. No body emission or foreground cel lighting.
      const nightMaterials = new Map();
      actor.root.traverse(mesh => {
        if (!mesh.isMesh || mesh.userData.companionOutline) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const shade = source => {
          if (nightMaterials.has(source)) return nightMaterials.get(source);
          const material = source.clone();
          material.fog = false;
          material.userData.noToon = true;
          material.envMapIntensity = .08;
          if (material.emissive) material.emissive.set(0x000000);
          material.emissiveIntensity = 0;
          const compile = material.onBeforeCompile;
          const key = material.customProgramCacheKey();
          material.onBeforeCompile = function(shader, renderer) {
            compile.call(this, shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
              'outgoingLight *= vec3(0.16, 0.21, 0.29);\n#include <opaque_fragment>');
          };
          material.customProgramCacheKey = () => key + '/distant-rayquaza-night-v1';
          nightMaterials.set(source, material);
          return material;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(shade) : shade(mesh.material);
      });
      this.group.add(actor.root);
      this.rayquaza = new SkyRayquaza(actor);
    }));
    pending.push(loader.loadAsync('/assets/companions/151.glb').then(tune).then(asset => {
      const actor = new CompanionActor(asset, '梦幻 / unexpected psychic visitor', 2.2 * .75, false, '20000_defaultwait01');
      this.group.add(actor.root);
      this.mew = new MewVisitor(actor, { scene: this.scene, parent: this.group, machine: this.machine, camera: this.camera });
    }).catch(error => {
      this.loadErrors.push('梦幻');
      console.warn('Mew visitor could not load:', error);
    }));
    await Promise.all(pending);
  }

  update(dt) {
    if (!this.ready) return;
    dt = Math.min(Math.max(dt, 0), .1);
    this.time += dt;
    const t = this.time;
    this.raikou?.update(dt);
    this.reshiram?.update(dt);
    this.zekrom?.update(dt);
    this.rayquaza?.update(dt);
    this.mew?.update(dt);
    for (const wanderer of this.wanderers || []) wanderer.update(dt);
    for (const { actor, config, hand, sparks } of this.workers) {
      const phase = (t + config.offset) % 12;
      const repair = phase >= 1.4 && phase < 6.8;
      const key = phase < 1.4 ? 'rangeattack02_start' : repair ? 'rangeattack02_loop'
        : phase < 8.5 ? 'rangeattack02_end' : 'defaultwait01';
      actor.play(key, .25, 1, key.endsWith('start') || key.endsWith('end'));
      actor.root.position.fromArray(config.position);
      actor.root.position.y += Math.sin(t * 1.8 + config.offset) * .065;
      actor.root.position.z += Math.sin(t * .65 + config.offset) * .055;
      actor.targetYaw = config.yaw + Math.sin(t * .55 + config.offset) * .1;
      actor.update(dt);
      actor.root.updateMatrixWorld(true);
      const edge = repair ? Math.min(1, (phase - 1.4) / .35, (6.8 - phase) / .4) : 0;
      const burst = .35 + .65 * Math.pow(Math.max(0, Math.sin((t + config.offset) * 18)), 2);
      sparks.update(t + config.offset, edge * burst, hand);
    }

    // Fourteen seconds of faster flight, then ten seconds resting on the distant
    // decorative ball. Smooth arc-length travel decelerates for a real landing.
    const flightPhase = t % 24;
    let bank = 0;
    if (flightPhase < 14) {
      const u = flightPhase / 14, progress = smooth(u);
      this.flightCurve.getPointAt(progress, this.flyer.root.position);
      this.flightCurve.getTangentAt(progress, this.flightTangent);
      this.flightCurve.getTangentAt(Math.min(1, progress + .015), this.nextTangent);
      const landing = smooth(THREE.MathUtils.clamp((u - .9) / .1, 0, 1));
      const heading = Math.atan2(this.flightTangent.x, this.flightTangent.z);
      const faceRest = Math.atan2(Math.sin(.35 - heading), Math.cos(.35 - heading));
      this.flyer.targetYaw = heading + faceRest * landing;
      const turn = this.flightTangent.x * this.nextTangent.z - this.flightTangent.z * this.nextTangent.x;
      bank = THREE.MathUtils.clamp(turn * 4, -.4, .4) * (1 - landing);
      this.flyer.play(u > .9 ? 'kw01_wait01' : 'fi21_run01', .65, u > .9 ? 1 : 1.35);
    } else {
      this.flyer.root.position.copy(this.perch);
      this.flyer.targetYaw = .35 + .08 * Math.sin((flightPhase - 14) * .65);
      this.flyer.play('kw01_wait01', .65);
    }
    this.flyer.root.rotation.z = THREE.MathUtils.damp(this.flyer.root.rotation.z, bank, 7, dt);
    this.flyer.update(dt);

    const phase = t % 18;
    const chase = phase < 7.5;
    const u = chase ? phase / 7.5 : 1;
    const theta = TAU * smooth(u);
    for (const [i, actor] of this.pals.entries()) {
      const angle = theta + i * Math.PI;
      actor.root.position.set(5.3 + 1.7 * Math.cos(angle), -.69, -12 + 1.5 * Math.sin(angle));
      if (chase) {
        const speed = .5 + .4 * Math.sin(Math.PI * u);
        actor.play('run01', .32, speed);
        actor.targetYaw = Math.atan2(-1.7 * Math.sin(angle), 1.5 * Math.cos(angle));
      } else {
        actor.targetYaw = i ? Math.PI / 2 : -Math.PI / 2;
        if (phase < 8.2) actor.play('defaultwait01');
        else if (phase < 11.6) actor.play(i ? 'defaultidle01' : 'glad01', .3, 1, true);
        else if (phase < 15) actor.play(i ? 'glad01' : 'defaultidle02', .3, 1, true);
        else actor.play(i ? 'notice01' : 'defaultwait01', .3, 1, i === 1);
      }
      actor.update(dt);
    }
  }
}

