import * as THREE from 'three';
import { instantiateBall } from './assets.js';
import { CaptureBall } from './capture-ball.js';
import { createStudioEnvironment } from './studio-environment.js';
import { uprightBallQuaternion } from './ball-controls.js';

// A small, short-lived PBR preview sharing the factory's ball download.
export class LoadingBall {
  constructor(container, assetPromise) {
    this.container = container;
    this.disposed = false;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(160, 160);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .85;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(35, 1, .1, 25);
    this.camera.position.set(2.3, 1.5, 6.6);
    this.camera.lookAt(0, 0, 0);
    this.scene.environment = createStudioEnvironment(this.renderer);
    this.scene.add(new THREE.HemisphereLight('#fff3de', '#716167', 1.4));
    for (const [color, power, position] of [
      ['#fff0d9', 2.5, [-3, 4, 5]], ['#c4e5ff', 1.5, [4, 1, -2]],
    ]) {
      const light = new THREE.DirectionalLight(color, power);
      light.position.fromArray(position); this.scene.add(light);
    }
    this.pause = .15;
    this.clock = new THREE.Clock();
    this.onVisibility = () => {
      this.clock.getDelta();
      this.renderer.setAnimationLoop(document.hidden ? null : () => this.update());
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderer.setAnimationLoop(() => this.update());
    assetPromise.then(asset => {
      if (this.disposed) return;
      this.ball = instantiateBall(asset, .75);
      this.ball.position.set(0, 0, 0);
      this.ball.quaternion.copy(uprightBallQuaternion(this.camera, -.42, -.42));
      this.ball.traverse(object => {
        if (!object.isMesh) return;
        object.geometry = object.geometry.clone();
        const polish = source => {
          const material = source.clone();
          material.envMapIntensity = .7;
          return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(polish) : polish(object.material);
      });
      this.capture = new CaptureBall(this.ball, this.camera);
      const surfaces = [];
      this.ball.traverse(mesh => { if (mesh.isMesh && !mesh.material?.isShaderMaterial) surfaces.push(mesh); });
      // Keep CaptureBall's masked red emission; replace only the surface lighting
      // with three cel bands and a compact illustrated highlight.
      for (const mesh of surfaces) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const previous = material.onBeforeCompile;
          material.onBeforeCompile = shader => {
            previous?.call(material, shader);
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
              vec3 celNormal = normalize(normal);
              vec3 celLight = normalize(vec3(-.55, .75, 1.0));
              float celDot = dot(celNormal, celLight);
              float celBand = .36 + .37 * smoothstep(.08, .11, celDot)
                + .38 * smoothstep(.58, .61, celDot);
              vec3 celHalf = normalize(celLight + normalize(vViewPosition));
              float celHighlight = smoothstep(.975, .985, dot(celNormal, celHalf));
              outgoingLight = diffuseColor.rgb * celBand * 1.45
                + vec3(.55, .51, .44) * celHighlight + totalEmissiveRadiance;
              #include <opaque_fragment>
            `);
          };
          const previousKey = material.customProgramCacheKey.bind(material);
          const baseKey = previousKey();
          material.customProgramCacheKey = () => baseKey + '/loading-cel-v1';
          material.needsUpdate = true;
        }
      }
      this.ink = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: true, toneMapped: false,
        vertexShader: `
          void main(){
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            vec3 n = normalize(normalMatrix * normal);
            vec4 clip = projectionMatrix * view;
            vec2 direction = (projectionMatrix * vec4(n, 0.0)).xy;
            float len = length(direction);
            if(len > .0001) clip.xy += direction / len * (2.0 * 1.15 / 160.0) * clip.w;
            gl_Position = clip;
          }`,
        fragmentShader: 'void main(){gl_FragColor=vec4(.055,.045,.05,1.0);}',
      });
      for (const mesh of surfaces) {
        const outline = new THREE.Mesh(mesh.geometry, this.ink);
        outline.name = 'Loading ball ink outline';
        outline.raycast = () => {};
        mesh.add(outline);
      }
      this.scene.add(this.ball);
      container.classList.add('ready');
    }).catch(error => { if (!this.disposed) console.warn('Loading ball preview:', error); });
  }

  update() {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), .05);
    if (this.capture) {
      if (!this.capture.playing) {
        this.pause -= dt;
        if (this.pause <= 0) { this.capture.play(); this.pause = .7; }
      }
      this.capture.update(dt);
      // Project the actual lower contour, so the contact shadow follows the
      // rocking ball instead of remaining a detached ellipse underneath it.
      const center = this.ball.position.clone();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const bottom = center.addScaledVector(up, -.75).project(this.camera);
      this.container.style.setProperty('--ball-shadow-x', `${(bottom.x * .5 + .5) * 160}px`);
      this.container.style.setProperty('--ball-shadow-y', `${(-bottom.y * .5 + .5) * 160 - 4}px`);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.setAnimationLoop(null);
    this.scene.environment?.dispose();
    this.scene.traverse(object => {
      object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

