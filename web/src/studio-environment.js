import * as THREE from 'three';

// Broad studio reflections are generated once, not rendered every frame.
export function createStudioEnvironment(renderer, { hero = false } = {}) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color().setRGB(...(hero ? [.095, .105, .12] : [.32, .29, .25]));
  const panels = hero ? [
    { position: [-10, 12, 8], size: [3.5, 9], power: 6, color: '#fff5e8' },
    { position: [10, 7, 4], size: [2, 7], power: 3.5, color: '#e8f1ff' },
    { position: [0, 12, -8], size: [6, 3], power: 6, color: '#ffe8c8' },
  ] : [
    { position: [-10, 10, 8], size: [7, 10], power: 11, color: '#fff3df' },
    { position: [10, 6, 3], size: [3, 8], power: 6, color: '#f5f8ff' },
    { position: [0, 12, -8], size: [8, 4], power: 8, color: '#ffe6c3' },
  ];
  if (hero) {
    // Night-garden reflections: deep indigo sky, teal horizon glow, dark wet ground.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 zenith = vec3(.035, .045, .14), horizon = vec3(.10, .26, .34), ground = vec3(.012, .014, .022);
          vec3 c = mix(horizon, zenith, smoothstep(.02, .75, h));
          c = mix(c, ground, 1.0 - smoothstep(-.25, .0, h));
          float band = (h - .25) / .12;
          c += vec3(.30, .16, .42) * exp(-band * band) * .35;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    studio.add(dome);
  }
  for (const panel of panels) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(panel.color).multiplyScalar(panel.power),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...panel.size), material);
    mesh.position.fromArray(panel.position);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const result = pmrem.fromScene(studio, .035);
  studio.traverse(object => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  pmrem.dispose();
  return result.texture;
}
