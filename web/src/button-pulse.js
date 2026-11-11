import * as THREE from 'three';

export const BUTTON_PULSE_DURATION = 1.16;

const OPENING_PULSES = [
  { start: 0, rise: .11, fall: .17, strength: .50 },
  { start: .30, rise: .13, fall: .19, strength: .75 },
  { start: .65, rise: .21, fall: .30, strength: 1.0 },
];

export function openingPulseAt(time) {
  if (time < 0 || time >= BUTTON_PULSE_DURATION) return 0;
  // Brightening accelerates from dark; dimming starts fast and slows to dark.
  // Cubic ease-in / ease-out keeps the light continuous at each peak.
  for (const pulse of OPENING_PULSES) {
    const phase = time - pulse.start;
    if (phase < 0 || phase >= pulse.rise + pulse.fall) continue;
    const envelope = phase < pulse.rise
      ? Math.pow(phase / pulse.rise, 3)
      : Math.pow(1 - (phase - pulse.rise) / pulse.fall, 3);
    return pulse.strength * envelope;
  }
  return 0;
}

export class ButtonPulse {
  constructor(ball, shiny = false) {
    this.power = { value: 0 };
    this.emissionPass = { value: 0 };
    this.tint = { value: new THREE.Color(shiny ? '#ffd15c' : '#fff0cf') };
    this.saved = [];
    this.materials = [];
    ball.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      let changed = false;
      const patch = material => {
        if (!/Porcelain lower shell/.test(material.name)) return material;
        changed = true;
        const clone = material.clone();
        clone.userData.emissionPass = this.emissionPass;
        clone.customProgramCacheKey = () => 'observation-button-pulse-v1';
        clone.onBeforeCompile = shader => {
          shader.uniforms.buttonPulse = this.power;
          shader.uniforms.buttonTint = this.tint;
          shader.uniforms.buttonEmissionOnly = this.emissionPass;
          shader.vertexShader = 'varying vec3 buttonLocalPosition;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nbuttonLocalPosition = position;');
          shader.fragmentShader = `uniform float buttonPulse, buttonEmissionOnly;
            uniform vec3 buttonTint; varying vec3 buttonLocalPosition;\n` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
            #include <emissivemap_fragment>
            float buttonFace = smoothstep(1.075, 1.095, buttonLocalPosition.z)
              * (1.0 - smoothstep(.139, .146, length(buttonLocalPosition.xy)));
            vec3 buttonRadiance = buttonTint * (9.0 * buttonFace * buttonPulse);
            totalEmissiveRadiance += buttonRadiance;
          `);
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            if (buttonEmissionOnly > .5) outgoingLight = buttonRadiance;
            #include <opaque_fragment>
          `);
        };
        this.materials.push(clone);
        return clone;
      };
      const patched = Array.isArray(original) ? original.map(patch) : patch(original);
      if (changed) { this.saved.push([mesh, original]); mesh.material = patched; }
    });
  }

  update(time) { this.power.value = openingPulseAt(time); }

  dispose() {
    this.power.value = 0;
    for (const [mesh, original] of this.saved) mesh.material = original;
    for (const material of this.materials) material.dispose();
    this.saved.length = 0;
    this.materials.length = 0;
  }
}
