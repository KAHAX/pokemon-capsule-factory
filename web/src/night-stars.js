import * as THREE from 'three';

// One inexpensive draw call: soft, deterministic stars behind all factory structures.
export function addNightStars(scene) {
  let seed = 1174;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const positions = [], sizes = [], colors = [];
  for (let i = 0; i < 650; i++) {
    const azimuth = random() * Math.PI * 2;
    const elevation = .12 + random() * .9;
    const radius = 82 + random() * 8;
    positions.push(Math.cos(azimuth) * Math.cos(elevation) * radius,
      3 + Math.sin(elevation) * radius, Math.sin(azimuth) * Math.cos(elevation) * radius);
    sizes.push(.65 + random() * .8);
    const brightness = .28 + random() * .4;
    const color = new THREE.Color(random() > .85 ? '#d8c6a7' : '#b9c7df').multiplyScalar(brightness);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('starSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexColors: true,
    vertexShader: `attribute float starSize; varying vec3 starColor;
      void main() { vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(starSize * 400.0 / -view.z, 1.5, 7.0);
        starColor = color; }`,
    fragmentShader: `varying vec3 starColor;
      void main() { float d = length(gl_PointCoord - .5) * 2.0;
        float a = exp(-d*d*8.0) * (1.0-smoothstep(.6,1.0,d));
        gl_FragColor = vec4(starColor, a); }`,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Muted distant night stars';
  stars.frustumCulled = false;
  scene.add(stars);
}
