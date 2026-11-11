import * as THREE from 'three';

export class CaptureBall {
  constructor(ball, camera, name = 'Bag front capture ball') {
    this.ball = ball;
    this.camera = camera;
    this.restPosition = ball.position.clone();
    this.restQuaternion = ball.quaternion.clone();
    this.axis = new THREE.Vector3();
    this.rollDirection = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.glow = { value: 0 };
    this.playing = false;
    this.elapsed = 0;
    ball.name = name;
    const buttonMeshes = [];
    ball.traverse(object => {
      if (!object.isMesh) return;
      const patch = original => {
        if (original.name !== 'Porcelain lower shell') return original;
        buttonMeshes.push(object);
        const material = original.clone();
        // The button face is merged with the lower shell. Mask its local vertices,
        // so other balls and the white hemisphere keep their original material.
        material.onBeforeCompile = shader => {
          shader.uniforms.captureGlow = this.glow;
          shader.vertexShader = 'varying vec3 capturePosition;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\ncapturePosition = position;');
          shader.fragmentShader = 'uniform float captureGlow; varying vec3 capturePosition;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            float captureButton = smoothstep(1.075, 1.095, capturePosition.z)
              * (1.0 - smoothstep(.139, .146, length(capturePosition.xy)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9, .008, .012), captureButton * captureGlow);
          `);
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
            #include <emissivemap_fragment>
            totalEmissiveRadiance += vec3(32.0, .06, .09) * captureButton * captureGlow;
          `);
        };
        material.customProgramCacheKey = () => 'capture-button-red-v2';
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(patch) : patch(object.material);
    });
    // Soft optical bloom on the button plane; no hard edge or solid shell.
    for (const mesh of new Set(buttonMeshes)) {
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(.95, .95), new THREE.ShaderMaterial({
        uniforms: { captureGlow: this.glow },
        vertexShader: `varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float captureGlow; varying vec2 vUv;
          void main() {
            float r = length(vUv - .5) * 2.0;
            float halo = exp(-5.5 * r * r) * (1.0 - smoothstep(.65, 1.0, r));
            gl_FragColor = vec4(2.4, .012, .025, halo * captureGlow * .85);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      }));
      halo.name = 'Capture button soft red halo';
      halo.position.z = 1.115;
      halo.raycast = () => {};
      mesh.add(halo);
    }
  }

  raycast(raycaster) {
    this.ball.updateWorldMatrix(true, true);
    const hit = raycaster.intersectObject(this.ball, true)[0];
    return hit ? { action: 'capture-ball', target: this, distance: hit.distance } : null;
  }

  play() {
    if (this.playing) return false;
    this.elapsed = 0;
    this.playing = true;
    this.axis.subVectors(this.camera.position, this.restPosition).setY(0).normalize();
    this.rollDirection.crossVectors(this.axis, new THREE.Vector3(0, 1, 0));
    return true;
  }

  update(dt) {
    if (!this.playing) return;
    this.elapsed += Math.max(0, dt);
    if (this.elapsed >= 2.7) {
      this.playing = false;
      this.ball.position.copy(this.restPosition);
      this.ball.quaternion.copy(this.restQuaternion);
      this.glow.value = 0;
      return;
    }
    const cycle = Math.floor(this.elapsed / .9);
    const phase = Math.min((this.elapsed % .9) / .7, 1);
    const envelope = Math.sin(Math.PI * phase) ** .8;
    const angle = .38 * (1 - cycle * .13) * Math.sin(2 * Math.PI * phase) * Math.sin(Math.PI * phase);
    this.rotation.setFromAxisAngle(this.axis, angle);
    this.ball.quaternion.copy(this.restQuaternion).premultiply(this.rotation);
    // Small rolling displacement maintains ground contact instead of floating.
    this.ball.position.copy(this.restPosition).addScaledVector(this.rollDirection, .405 * angle);
    this.glow.value = envelope;
  }
}

