import * as THREE from 'three';
import { isTailVertex } from './card-framing.js';

export function addShinySparkles(root) {
  root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),bounds=new THREE.Box3(),candidates=[];
  const point=new THREE.Vector3(),matrix=new THREE.Matrix4();
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh || /eye|tongue|tail|sippo/i.test(mesh.name))return;
    mesh.skeleton?.update();
    const vertices=mesh.geometry.attributes.position;
    const stride=Math.max(1,Math.floor(vertices.count/650));
    matrix.copy(inverse).multiply(mesh.matrixWorld);
    for(let index=0;index<vertices.count;index+=stride){
      if(isTailVertex(mesh,index))continue;
      mesh.getVertexPosition(index,point);point.applyMatrix4(matrix);
      if(!Number.isFinite(point.lengthSq()))continue;
      bounds.expandByPoint(point);candidates.push({mesh,index,point:point.clone()});
    }
  });
  if(bounds.isEmpty())return ()=>{};
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const unit=Math.max(size.x,size.y,size.z),positions=[],seeds=[],sizes=[],anchors=[],used=new Set();
  const safeSize=size.clone().max(new THREE.Vector3(.001,.001,.001));
  // Choose actual surface vertices across all sides, including the face toward
  // the camera. Their skinning follows the body instead of a distant sphere.
  for(let i=0;i<40;i++){
    const angle=i*2.399963,y=1-2*(i+.5)/40,ring=Math.sqrt(1-y*y);
    const direction=new THREE.Vector3(Math.cos(angle)*ring,y,Math.sin(angle)*ring);
    let best=null,score=-Infinity;
    for(const candidate of candidates){
      if(used.has(candidate))continue;
      point.copy(candidate.point).sub(center).divide(safeSize);
      const radius=point.length(),value=point.normalize().dot(direction)-.08*Math.abs(radius-.5);
      if(value>score){score=value;best=candidate;}
    }
    if(!best)break;
    used.add(best);anchors.push(best);positions.push(...best.point.toArray());seeds.push(i*.731);
    // Sample once per star: different sizes without frame-to-frame jitter.
    sizes.push(.65+1.25*Math.pow(Math.random(),1.5));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
  geometry.setAttribute('starSize',new THREE.Float32BufferAttribute(sizes,1));
  const uniforms={time:{value:0},pixelScale:{value:800},bodySize:{value:unit}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
    blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
    blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
    vertexShader:`attribute float seed,starSize;uniform float time,pixelScale,bodySize;varying float intensity;varying float hue;
      void main(){
        float phase=fract(time*(.48+.34*fract(seed*.513))+seed);
        intensity=pow(max(0.,sin(phase*3.14159265)),8.);
        hue=fract(seed*.37);
        vec3 p=position;
        p.y+=(phase-.5)*bodySize*.008;
        p.x+=sin(time*.6+seed)*bodySize*.004;
        vec4 v=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*v;
        float scale=length(modelMatrix[0].xyz);
        gl_PointSize=clamp(pixelScale*projectionMatrix[1][1]*bodySize*scale*.042*starSize*(.8+.2*intensity)/max(.1,-v.z),5.,42.);
      }`,
    fragmentShader:`varying float intensity;varying float hue;
      void main(){
        vec2 q=(gl_PointCoord-.5)*2.;
        vec2 p=abs(mat2(.70710678,-.70710678,.70710678,.70710678)*q);
        float cross=pow(max(0.,1.-pow(p.x,.55)-pow(p.y,.55)),1.2);
        float core=exp(-dot(p,p)*65.)*.55;
        float alpha=(cross+core)*intensity;
        if(alpha<.006)discard;
        vec3 color=mix(vec3(1.,.74,.3),vec3(.58,.83,1.),hue);
        color=mix(color,vec3(1.,.97,.88),clamp(core,0.,1.));
        gl_FragColor=vec4(color*alpha*9.,0.);
      }`});
  const stars=new THREE.Points(geometry,material);
  stars.name='Shiny / floating star glints';stars.frustumCulled=false;
  const bufferSize=new THREE.Vector2();
  stars.onBeforeRender=renderer=>{uniforms.pixelScale.value=renderer.getDrawingBufferSize(bufferSize).y;};
  root.add(stars);
  const positionAttribute=geometry.attributes.position;
  const matrices=new Map(),posedCenter=new THREE.Vector3(),outward=new THREE.Vector3();
  anchors.forEach(anchor=>{if(!matrices.has(anchor.mesh))matrices.set(anchor.mesh,new THREE.Matrix4());});
  return time=>{
    uniforms.time.value=time;
    root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
    inverse.copy(root.matrixWorld).invert();posedCenter.set(0,0,0);
    for(const [mesh,transform] of matrices){mesh.skeleton?.update();transform.copy(inverse).multiply(mesh.matrixWorld);}
    for(const anchor of anchors){
      anchor.mesh.getVertexPosition(anchor.index,anchor.point);
      anchor.point.applyMatrix4(matrices.get(anchor.mesh));posedCenter.add(anchor.point);
    }
    posedCenter.multiplyScalar(1/anchors.length);
    anchors.forEach((anchor,i)=>{
      outward.copy(anchor.point).sub(posedCenter).normalize().multiplyScalar(unit*(.035+.008*Math.sin(time*.7+i)));
      point.copy(anchor.point).add(outward);positionAttribute.setXYZ(i,point.x,point.y,point.z);
    });
    positionAttribute.needsUpdate=true;
  };
}
