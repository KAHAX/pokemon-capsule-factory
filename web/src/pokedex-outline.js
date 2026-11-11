import * as THREE from 'three';

// Attach the ink to each animated part, so the hinge carries its own contour.
// Screen-space width stays readable both in the dock and the enlarged viewer.
export function addPokedexOutline(model) {
  const ink = new THREE.ShaderMaterial({
    uniforms: {
      viewport: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      width: { value: 1.1 },
    },
    side: THREE.BackSide,
    depthTest: true,
    depthWrite: false,
    toneMapped: true,
    vertexShader: `
      uniform vec2 viewport;
      uniform float width;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 viewNormal = normalize(normalMatrix * normal);
        vec2 direction = (projectionMatrix * vec4(viewNormal, 0.0)).xy * viewport;
        float magnitude = length(direction);
        if (magnitude > 0.0001) {
          clip.xy += direction / magnitude * (2.0 * width / viewport) * clip.w;
        }
        gl_Position = clip;
      }`,
    fragmentShader: `void main() {
      gl_FragColor = vec4(vec3(.06), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const parts = [];
  model.traverse(object => {
    if (!object.isMesh || object.isSkinnedMesh || !object.geometry.attributes.normal) return;
    const key = object.name.toLowerCase().replace(/[^a-z]/g, '');
    if (/^(mainredenclosure|loweroxbloodshell|leftintegratedmoldedcontactframe|rightwingredenclosure|rightwinglowerredshell|rightwingraisedrim|raisedsensorcrown|redhingebarrel|cartridgeblackbody|cartridgegraphiterim|rightcharcoalfaceplate|domedcobaltscanner|yellowactionkey|bluekey|silverdisplaysurround|datascreenbevel|rearcoverinsetpanel)/.test(key)) parts.push(object);
  });
  for (const part of parts) {
    const outline = new THREE.Mesh(part.geometry, ink);
    outline.name = 'Pokedex / ink contour';
    outline.raycast = () => {};
    outline.castShadow = false;
    outline.receiveShadow = false;
    part.add(outline);
    // The thin wing has hard, planar edges: retain a fine structural contour there.
    if (/rightwingredenclosure/i.test(part.name.replace(/[^a-z]/gi, ''))) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(part.geometry, 45),
        new THREE.LineBasicMaterial({ color: new THREE.Color().setRGB(.06, .06, .06), depthWrite: false, toneMapped: true }));
      edges.name = 'Pokedex / wing edge';
      edges.raycast = () => {};
      part.add(edges);
    }
  }
  return {
    update(viewerBlend) {
      ink.uniforms.viewport.value.set(window.innerWidth, window.innerHeight);
      ink.uniforms.width.value = THREE.MathUtils.lerp(1.1, 1.8, viewerBlend);
    },
  };
}

// This exported closed mesh has inward winding (negative signed volume).
// Repair the actual surface, rather than hiding it with an overlapping cover.
export function repairPokedexDpad(model) {
  model.traverse(object => {
    if (!object.isMesh || object.name.toLowerCase().replace(/[^a-z]/g, '') !== 'whitedirectionalcross') return;
    const geometry = object.geometry.clone();
    const positions = geometry.attributes.position;
    const indices = geometry.index;
    if (!indices) return;
    let volume = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < indices.count; i += 3) {
      a.fromBufferAttribute(positions, indices.getX(i));
      b.fromBufferAttribute(positions, indices.getX(i + 1));
      c.fromBufferAttribute(positions, indices.getX(i + 2));
      volume += a.dot(b.cross(c)) / 6;
    }
    if (volume >= 0) { geometry.dispose(); return; }
    for (let i = 0; i < indices.count; i += 3) {
      const second = indices.getX(i + 1);
      indices.setX(i + 1, indices.getX(i + 2));
      indices.setX(i + 2, second);
    }
    indices.needsUpdate = true;
    const normals = geometry.attributes.normal;
    for (let i = 0; i < normals.count; i++) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
    normals.needsUpdate = true;
    object.geometry = geometry;
    object.material = object.material.clone();
    object.material.side = THREE.FrontSide;
    object.material.needsUpdate = true;
  });
}
