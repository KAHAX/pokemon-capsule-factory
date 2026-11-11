import * as THREE from 'three';

// Unwrap by the pipe's actual centreline, including both elbows. The continuous
// radial pair is interpolated instead of an angle, so the back seam cannot smear
// a front-facing label across a triangle. Ink is restricted to the outer wall.
export function bindTubePrintCoordinates(mesh, route) {
  const points = route.samples.filter(p => p.clearance != null);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2];
    const length2 = dx * dx + dy * dy + dz * dz;
    if (length2 > 1e-10) segments.push({ a, b, dx, dy, dz, length2 });
  }
  const forward = new THREE.Vector3(...points.find(p => p.section === 'reserve').t).normalize();
  const front = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const coords = new Float32Array(positions.count * 4);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), radial = new THREE.Vector3();
  const tangent = new THREE.Vector3(), across = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const start = points[0].s, span = points[points.length - 1].s - start;
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    let nearest, fraction = 0, minimum = Infinity;
    for (const segment of segments) {
      const { a, dx, dy, dz, length2 } = segment;
      const t = THREE.MathUtils.clamp(((p.x-a.p[0])*dx+(p.y-a.p[1])*dy+(p.z-a.p[2])*dz)/length2,0,1);
      const x = p.x-a.p[0]-dx*t, y=p.y-a.p[1]-dy*t, z=p.z-a.p[2]-dz*t;
      const distance = x*x+y*y+z*z;
      if (distance < minimum) { minimum = distance; nearest = segment; fraction = t; }
    }
    const { a, b, dx, dy, dz } = nearest;
    tangent.set(dx,dy,dz).normalize();
    across.crossVectors(tangent,front).normalize();
    radial.set(p.x-a.p[0]-dx*fraction,p.y-a.p[1]-dy*fraction,p.z-a.p[2]-dz*fraction);
    n.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
    coords[i*4] = (THREE.MathUtils.lerp(a.s,b.s,fraction)-start)/span;
    coords[i*4+1] = radial.dot(front);
    coords[i*4+2] = radial.dot(across);
    coords[i*4+3] = n.dot(radial) > .1 ? 1 : 0;
  }
  geometry.setAttribute('tubePrintCoord',new THREE.BufferAttribute(coords,4));
  return { start, span };
}

export function createTubeLettering(route) {
  const start = route.samples.find(p=>p.clearance!=null).s;
  const span = route.samples[route.samples.length - 1].s-start;
  const canvas = document.createElement('canvas');
  canvas.width=4096; canvas.height=768;
  const g=canvas.getContext('2d');
  g.fillStyle=g.strokeStyle='#ffffff';
  g.textAlign='center';g.textBaseline='middle';g.lineCap='square';
  const at=(s,angle,draw)=>{
    g.save();g.translate((1-(s-start)/span)*canvas.width,(.5-angle/(Math.PI*2))*canvas.height);draw();g.restore();
  };
  const text=(s,angle,value,size,alpha=1,rotation=0)=>at(s,angle,()=>{
    g.rotate(rotation);g.globalAlpha=alpha;g.font=`bold ${size}px "Consolas", "Courier New", monospace`;g.fillText(value,0,0);
  });
  const arrow=(s,angle)=>at(s,angle,()=>{
    g.lineWidth=5;g.beginPath();g.moveTo(24,0);g.lineTo(-24,0);g.moveTo(-8,-12);g.lineTo(-24,0);g.lineTo(-8,12);g.stroke();
  });
  const cross=(s,angle)=>at(s,angle,()=>{
    g.lineWidth=4;g.beginPath();g.moveTo(-9,0);g.lineTo(9,0);g.moveTo(0,-9);g.lineTo(0,9);g.stroke();
  });
  // Horizontal reserve: plenty of clear glass between the small stencil groups.
  text(40.85,.22,'FEED / 05',47);
  text(40.85,-.15,'CAPSULE LINE',23,.85);
  at(40.85,.51,()=>{g.lineWidth=3;g.beginPath();g.moveTo(-126,10);g.lineTo(-126,-6);g.lineTo(-90,-6);g.moveTo(90,-6);g.lineTo(126,-6);g.lineTo(126,10);g.stroke();});
  text(43.85,.25,'PK-01',36,.95);
  text(43.85,-.1,'RESERVE',22,.8);
  arrow(42.75,.03);arrow(44.7,.03);
  // Turn marks follow the actual bend, instead of flat floating decals.
  text(39.1,.1,'A',34);cross(39.45,-.36);
  text(45.5,.1,'B',32);cross(45.1,-.37);
  // Short, upright lift labels fit between the luminous retaining rings.
  text(35.2,.02,'LIFT',35,1,-Math.PI/2);
  for (const [s,value] of [[33.65,'01'],[36.55,'02'],[37.3,'03']]) {
    text(s,.05,value,37,.95,-Math.PI/2);
    at(s+.21,0,()=>{
      g.lineWidth=3;g.beginPath();g.moveTo(0,-61);g.lineTo(0,61);g.stroke();
      for(let k=-3;k<=3;k++){g.beginPath();g.moveTo(0,k*19);g.lineTo(k===0?17:9,k*19);g.stroke();}
    });
  }
  arrow(34.35,0);arrow(35.95,0);
  text(31.5,.06,'IN',32);arrow(32.05,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=8;
  texture.name='Glass feed tube / white technical screen print';
  return texture;
}
