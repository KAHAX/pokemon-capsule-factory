import * as THREE from 'three';

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export class StudioRenderEffect {
  constructor(renderer) {
    this.renderer = renderer;
    this.beauty = new THREE.WebGLRenderTarget(1, 1);
    this.model = new THREE.WebGLRenderTarget(1, 1);
    this.blurA = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.size = new THREE.Vector2();
    this.clearColor = new THREE.Color();

    this.blur = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { image: { value: null }, stepSize: { value: new THREE.Vector2() } },
      vertexShader: quadVertex,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D image;
        uniform vec2 stepSize;
        void main() {
          vec3 color = vec3(0.0);
          float total = 0.0;
          for (int i = -15; i <= 15; i++) {
            float x = float(i);
            float weight = exp(-x * x / 72.0);
            color += texture2D(image, vUv + stepSize * x).rgb * weight;
            total += weight;
          }
          gl_FragColor = vec4(color / total, 1.0);
        }
      `,
    });
    this.composite = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        beauty: { value: this.beauty.texture },
        model: { value: this.model.texture },
        halo: { value: this.blurB.texture },
        haloStrength: { value: 0.22 },
        rainbowOutline: { value: 0 },
        outlineTime: { value: 0 },
        pixelSize: { value: new THREE.Vector2() },
        pixelRatio: { value: 1 },
      },
      vertexShader: quadVertex,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D beauty, model, halo;
        uniform float haloStrength, rainbowOutline, outlineTime, pixelRatio;
        uniform vec2 pixelSize;
        void main() {
          vec4 base = texture2D(beauty, vUv);
          vec3 glow = texture2D(halo, vUv).rgb * haloStrength;
          float outer = 0.0;
          float inner = 1.0;
          for (int i = 0; i < 16; i++) {
            float angle = float(i) * 6.28318530718 / 16.0;
            vec2 stepUV = vec2(cos(angle), sin(angle)) * pixelSize * pixelRatio;
            outer = max(outer, texture2D(model, vUv + stepUV * 3.0).a);
            inner = min(inner, texture2D(model, vUv + stepUV).a);
          }
          float ink = clamp(outer - inner, 0.0, 1.0);
          vec3 inkColor = vec3(0.06);
          if (rainbowOutline > 0.5) {
            float phase = vUv.x * 2.0 + vUv.y * 1.5 - outlineTime / 8.0;
            inkColor = vec3(0.04) + 0.85 * (0.5 + 0.5 * cos(6.28318530718 * (phase + vec3(0.0, 0.333333, 0.666667))));
          }
          vec3 color = base.rgb + glow;
          color = mix(color, inkColor, ink);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blur);
    this.scene.add(this.quad);
  }

  render(scene, camera, { rainbow = false, time = 0, size = null } = {}) {
    const renderer = this.renderer;
    renderer.getDrawingBufferSize(this.size);
    const width = size?.width || this.size.x;
    const height = size?.height || this.size.y;
    if (this.beauty.width !== width || this.beauty.height !== height) {
      this.beauty.setSize(width, height);
      this.model.setSize(width, height);
      this.blurA.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
      this.blurB.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    }
    this.composite.uniforms.rainbowOutline.value = rainbow ? 1 : 0;
    this.composite.uniforms.outlineTime.value = time;
    this.composite.uniforms.haloStrength.value = rainbow ? 0.24 : 0.22;
    this.composite.uniforms.pixelSize.value.set(1 / width, 1 / height);
    this.composite.uniforms.pixelRatio.value = renderer.getPixelRatio();

    const previousTarget = renderer.getRenderTarget();
    const background = scene.background;
    renderer.getClearColor(this.clearColor);
    const clearAlpha = renderer.getClearAlpha();

    renderer.setRenderTarget(this.beauty);
    renderer.clear();
    renderer.render(scene, camera);

    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.model);
    renderer.clear();
    renderer.render(scene, camera);
    scene.background = background;

    this.quad.material = this.blur;
    this.blur.uniforms.image.value = this.model.texture;
    this.blur.uniforms.stepSize.value.set(2 / width, 0);
    renderer.setRenderTarget(this.blurA);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.blur.uniforms.image.value = this.blurA.texture;
    this.blur.uniforms.stepSize.value.set(0, 2 / height);
    renderer.setRenderTarget(this.blurB);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    this.quad.material = this.composite;
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.beauty.dispose();
    this.model.dispose();
    this.blurA.dispose();
    this.blurB.dispose();
    this.quad.geometry.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}
