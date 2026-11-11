import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Cinematic finishing in linear HDR (before tone mapping): split-toning, lens fringing,
// a soft dream halation on highlights, an inky vignette and fine animated grain.
export function createGradePass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      dsTime: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      strength: { value: 1 },
      crt: { value: .55 },
      pixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float dsTime, strength, crt, pixelRatio;
      uniform vec2 resolution;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 c = vUv - .5;
        float r2 = dot(c, c);
        vec2 fringe = c * r2 * .016 * strength + vec2(.0006, 0.0) * crt;
        vec3 col;
        col.r = texture2D(tDiffuse, vUv - fringe).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv + fringe).b;

        float l = dot(col, vec3(.2126, .7152, .0722));
        // Teal-indigo shadows, warm cream highlights.
        vec3 shadowTint = vec3(.80, .93, 1.22);
        vec3 lightTint = vec3(1.08, 1.0, .90);
        vec3 graded = col * mix(shadowTint, lightTint, smoothstep(.015, .55, l));
        graded += vec3(.0015, .0030, .0075);
        // Gentle saturation lift in the mids keeps the toy colours rich.
        float gl = dot(graded, vec3(.2126, .7152, .0722));
        graded = mix(vec3(gl), graded, 1.12);
        col = mix(col, max(graded, 0.0), strength);

        vec2 vc = c * vec2(resolution.x / resolution.y, 1.0);
        float vig = smoothstep(1.05, .25, length(vc * vec2(.92, 1.15)));
        col *= mix(.38, 1.0, mix(1.0, vig, strength));

        // Old-screen texture: fine scanlines, a phosphor dot matrix and a slow rolling band.
        vec2 fc = gl_FragCoord.xy / max(pixelRatio, 1.0);
        float scan = .5 + .5 * cos(fc.y * 6.2831853 / 3.0);
        vec2 cell = fract(fc / vec2(3.0, 3.0)) - .5;
        cell.x += step(.0, sin(fc.y * 3.14159 / 3.0)) * .0;
        float dotm = 1.0 - smoothstep(.30, .52, length(cell));
        float roll = exp(-pow((fract(vUv.y * .7 - dsTime * .045) - .5) * 9.0, 2.0));
        col *= mix(1.0, (.78 + .22 * scan) * (.86 + .14 * dotm) * (1.0 + .05 * roll), crt);
        float grain = hash(vUv * resolution + fract(dsTime * 7.31) * 413.0) - .5;
        col += grain * (.010 + .012 * crt) * strength * (.35 + sqrt(max(l, 0.0)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const setSize = pass.setSize.bind(pass);
  pass.setSize = (width, height) => {
    setSize(width, height);
    pass.uniforms.resolution.value.set(width, height);
  };
  pass.name = 'Dreamscape grade';
  return pass;
}
