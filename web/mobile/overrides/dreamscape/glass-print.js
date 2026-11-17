import * as THREE from 'three';
import { mobileEdition } from '../mobile-performance.js';
import { bindTubePrintCoordinates, createTubeLettering } from './tube-lettering.js';

// Printed, lightly frosted glass for the capsule globe and the feed tube:
// white screen-printed graphics, halftone dot gradients at the top and bottom
// that dissolve toward the middle, and a soft satin frost you can still see through.

const GLOBE = { center: new THREE.Vector3(0, 6.2, 0), radius: 2.85, bottom: 4.13, top: 9.05 };
// Hero camera looks at the globe from azimuth atan2(z, x) ≈ 58°.
// u runs left-to-right as seen from outside, i.e. against atan2(z, x).
const FRONT_U = .5 - Math.atan2(18.2, 11.4) / (Math.PI * 2);

async function loadFont() {
  try {
    const face = new FontFace('Dreamscape Paytone', 'url(/assets/paytone-one.ttf)');
    await face.load();
    document.fonts.add(face);
    return '"Dreamscape Paytone", "Arial Black", sans-serif';
  } catch {
    return '"Arial Black", "Helvetica Neue", sans-serif';
  }
}

function drawPrint(font) {
  const W = 4096, H = 1152;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineCap = 'round'; g.lineJoin = 'round';
  // u wraps around the globe; v = 0 at the neck, 1 at the crown (canvas y is flipped).
  const at = (du, v) => [((FRONT_U + du) % 1 + 1) % 1 * W, (1 - v) * H];

  const text = (str, du, v, size, opts = {}) => {
    const [x, y] = at(du, v);
    g.save();
    g.translate(x, y);
    g.rotate(opts.rotate || 0);
    g.font = `${opts.weight || ''} ${size}px ${opts.font || font}`;
    g.textAlign = opts.align || 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = opts.alpha ?? 1;
    if (opts.spacing) g.letterSpacing = `${opts.spacing}px`;
    g.fillText(str, 0, 0);
    g.restore();
  };
  const plus = (du, v, r, w = 7, alpha = 1) => {
    const [x, y] = at(du, v);
    g.save(); g.globalAlpha = alpha; g.lineWidth = w;
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
    g.restore();
  };
  const cross = (du, v, r, w = 6, alpha = 1) => {
    const [x, y] = at(du, v);
    g.save(); g.globalAlpha = alpha; g.lineWidth = w;
    g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    g.restore();
  };
  const ball = (du, v, r) => {
    const [x, y] = at(du, v);
    g.save(); g.lineWidth = r * .14;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x - r * .34, y); g.moveTo(x + r * .34, y); g.lineTo(x + r, y); g.stroke();
    g.beginPath(); g.arc(x, y, r * .3, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x, y, r * .12, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  const halftoneDisc = (du, v, r, step) => {
    const [cx, cy] = at(du, v);
    g.save();
    for (let y = -r; y <= r; y += step) for (let x = -r; x <= r; x += step) {
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      // Dots shrink toward the upper-right, like a printed gradient.
      const t = THREE.MathUtils.clamp((x - y) / (2.2 * r) + .5, 0, 1);
      const dot = step * .46 * (1 - t) * (1 - d * .35);
      if (dot < 1.2) continue;
      g.beginPath(); g.arc(cx + x, cy + y, dot, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };

  // Hero face: halftone emblem with a Poké Ball mark, large count and caption.
  halftoneDisc(-.075, .52, 230, 22);
  ball(-.075, .52, 108);
  text('55', .085, .58, 250, { spacing: 4 });
  text('POKÉMON INSIDE', .085, .41, 64, { spacing: 10 });
  g.save(); g.globalAlpha = .9; g.lineWidth = 6;
  { const [x0, y0] = at(.035, .345), [x1] = at(.135, .345); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke(); }
  g.restore();
  text('CAPSULE WORKS · No.001', .085, .30, 38, { spacing: 8, alpha: .85 });

  // Scattered marks and a tilted sticker-style tag.
  plus(-.16, .78, 26); plus(.03, .84, 18); plus(.17, .72, 22, 6, .9); plus(-.21, .36, 18, 5, .8);
  cross(-.01, .66, 14, 5, .85); cross(.21, .5, 16, 5, .8); cross(-.13, .22, 12, 5, .7);
  text('TURN', .16, .86, 54, { rotate: -.32, spacing: 6 });
  { const [x, y] = at(.16, .86); g.save(); g.translate(x, y); g.rotate(-.32); g.lineWidth = 5; g.strokeRect(-110, -44, 220, 88); g.restore(); }
  text('↻  DISCOVER · COLLECT', -.12, .16, 40, { spacing: 10, alpha: .9 });

  // Back face (seen only from orbiting): a quieter repeat.
  text('POKÉ CAPSULE', .5, .55, 120, { spacing: 14, alpha: .9 });
  ball(.36, .55, 70); ball(.64, .55, 70);
  plus(.42, .75, 18); plus(.58, .32, 18); cross(.5, .78, 14, 5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

const HALFTONE = /* glsl */`
  // Halftone laid out on the surface but drawn round on screen: each dot is measured
  // in pixels through the inverse surface-to-screen Jacobian, so foreshortening never squashes it.
  float dsHalftone(vec2 p, float cell, float amount) {
    vec2 q = p / cell;
    vec2 off = (fract(q) - .5) * cell;
    mat2 J = mat2(dFdx(p), dFdy(p));
    float det = determinant(J);
    if (abs(det) < 1e-12) return 0.0;
    mat2 inv = inverse(J);
    vec2 offPx = inv * off;
    float pitch = min(length(inv * vec2(cell, 0.0)), length(inv * vec2(0.0, cell)));
    float r = .5 * pitch * clamp(amount, 0.0, 1.0) * .9;
    float d = length(offPx);
    return 1.0 - smoothstep(r - .7, r + .7, d);
  }
  float dsHash1(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
`;

function patchGlobe(material, print) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.dsPrint = { value: print };
    shader.uniforms.dsGlobe = { value: new THREE.Vector4(GLOBE.center.x, GLOBE.center.y, GLOBE.center.z, GLOBE.radius) };
    shader.uniforms.dsGlobeSpan = { value: new THREE.Vector2(GLOBE.bottom, GLOBE.top) };
    shader.vertexShader = 'varying vec3 dsGlassWorld;\n' + shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n dsGlassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `uniform sampler2D dsPrint; uniform vec4 dsGlobe; uniform vec2 dsGlobeSpan;
      varying vec3 dsGlassWorld; float dsFrost, dsInk;\n${HALFTONE}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      {
        vec3 rel = dsGlassWorld - dsGlobe.xyz;
        float v = clamp((dsGlassWorld.y - dsGlobeSpan.x) / (dsGlobeSpan.y - dsGlobeSpan.x), 0.0, 1.0);
        float angle = atan(rel.z, rel.x);
        float ring = max(length(rel.xz), .25);
        // Halftone gradient: dense at the neck and crown, dissolving toward the equator.
        // Round dots rising from the neck and dissolving upward; only a touch at the crown.
        float lower = pow(1.0 - smoothstep(.02, .30, v), 1.35) * .72;
        float upper = pow(smoothstep(.86, 1.0, v), 1.6) * .9;
        float amount = max(lower, upper);
        // Isometric surface coordinates (arc length along the latitude and the meridian),
        // so the dots stay round where the sphere curves in toward the neck.
        float polar = acos(clamp(rel.y / length(rel), -1.0, 1.0));
        vec2 surface = vec2(angle * length(rel.xz), polar * length(rel));
        float dots = dsHalftone(surface, .085, amount) * step(.05, amount);
        vec2 uv = vec2(.5 - angle / 6.2831853, v);
        float print = texture2D(dsPrint, uv).a;
        dsInk = clamp(max(dots * ${mobileEdition ? '.22' : '.82'}, print), 0.0, 1.0);
        dsFrost = ${mobileEdition ? '.045 + .07 * amount' : '.16 + .2 * amount'};
        roughnessFactor = max(roughnessFactor, dsFrost);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      {
        // Satin frost veil, then the opaque white ink printed on the outer surface.
        float facing = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        outgoingLight = mix(outgoingLight, vec3(.62, .70, .82) * .55, .06 + .10 * (1.0 - facing));
        vec3 ink = vec3(.93, .95, 1.0) * (.75 + .35 * facing);
        outgoingLight = mix(outgoingLight, ink, dsInk * .92);
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => previousKey + '/dreamscape-printed-globe-v5';
  material.needsUpdate = true;
}

function patchTube(material, print) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.dsTubePrint = { value: print };
    shader.vertexShader = 'attribute vec4 tubePrintCoord; varying vec4 dsTubeCoord;\n' + shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n dsTubeCoord = tubePrintCoord;');
    shader.fragmentShader = 'uniform sampler2D dsTubePrint; varying vec4 dsTubeCoord; float dsInk;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec2 tubeUV = vec2(1.0-dsTubeCoord.x, .5+atan(dsTubeCoord.z,dsTubeCoord.y)/6.2831853);
        dsInk = texture2D(dsTubePrint,tubeUV).a * step(.5,dsTubeCoord.w);
        roughnessFactor = max(roughnessFactor, .2);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float facing = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        outgoingLight = mix(outgoingLight, vec3(.62, .70, .82) * .55, .08 + .12 * (1.0 - facing));
        outgoingLight = mix(outgoingLight, vec3(.93, .95, 1.0) * (.7 + .35 * facing), dsInk * .9);
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => previousKey + '/dreamscape-structure-printed-tube-v3';
  material.needsUpdate = true;
}

export async function applyPrintedGlass(scene) {
  const [font, route] = await Promise.all([loadFont(), fetch('/assets/supply-route.json').then(response => {
    if (!response.ok) throw new Error('Glass pipe centreline unavailable');
    return response.json();
  })]);
  const print = drawPrint(font);
  const tubePrint = createTubeLettering(route);
  const done = new Set();
  scene.traverse(object => {
    if (!object.isMesh) return;
    if ([].concat(object.material).some(material => /Feeder tube glass/i.test(material?.name))) bindTubePrintCoordinates(object, route);
    for (const material of [].concat(object.material)) {
      if (!material || done.has(material) || !(material.transmission > 0)) continue;
      if (/Optical clear borosilicate/i.test(material.name)) { patchGlobe(material, print); done.add(material); }
      else if (/Feeder tube glass/i.test(material.name)) { patchTube(material, tubePrint); done.add(material); }
    }
  });
  return print;
}
