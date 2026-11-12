import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobileBeautyPass, createMobileFocusPass, useMobileGlass } from '../src/mobile-rendering.js';

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const beauty = new MobileBeautyPass(scene, camera);
const focus = createMobileFocusPass(beauty, camera);
assert.equal(focus.uniforms.tDepth.value, beauty.target.depthTexture, 'sample the actual framebuffer depth attachment');
for (const [width,height] of [[312,675.2],[675.2,312],[507.45,234.5]]) {
  beauty.setSize(width,height);
  assert.equal(beauty.target.width,Math.floor(width));
  assert.equal(beauty.target.height,Math.floor(height));
  assert.equal(focus.uniforms.tDepth.value,beauty.target.depthTexture);
}
const geometry = new THREE.SphereGeometry(1,32,24);
const material = new THREE.MeshPhysicalMaterial({transmission:1,roughness:.1});
const glass = new THREE.Mesh(geometry,material);scene.add(glass);
useMobileGlass(scene);
assert.equal(glass.geometry,geometry,'mobile glass preserves the original mesh');
assert.equal(material.transmission,0);assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);
const shader={fragmentShader:'#include <opaque_fragment>'};material.onBeforeCompile(shader,{});
assert(!shader.fragmentShader.includes('dsInk'),'glass without printed ink must not reference an absent uniform');
assert(shader.fragmentShader.includes('diffuseColor.a=mobileAlpha'));
focus.dispose();beauty.dispose();geometry.dispose();material.dispose();
console.log('PASS: mobile depth attachment identity, integer portrait/landscape targets, intact glass geometry and unprinted glass shader');
