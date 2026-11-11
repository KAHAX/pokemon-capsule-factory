import * as THREE from 'three';

// Translate the whole display in the camera plane, independent of its pitch/yaw.
export class BallPanControls {
  constructor(camera, getGroup) {
    this.camera=camera; this.getGroup=getGroup;
    this.offset=new THREE.Vector2(); this.target=new THREE.Vector2();
    this.world=new THREE.Vector3(); this.view=new THREE.Vector3();
    this.right=new THREE.Vector3(); this.up=new THREE.Vector3();
  }
  pointerDown(event) {
    if(event.button!==2 || !this.getGroup())return false;
    event.preventDefault();
    this.dragging=true;this.pointerId=event.pointerId;this.element=event.currentTarget;
    this.lastX=event.clientX;this.lastY=event.clientY;
    this.element.setPointerCapture?.(event.pointerId);
    return true;
  }
  pointerMove(event) {
    if(!this.dragging || event.pointerId!==this.pointerId)return;
    event.preventDefault();
    const rect=this.element.getBoundingClientRect();
    this.target.x=THREE.MathUtils.clamp(this.target.x+(event.clientX-this.lastX)/Math.max(rect.width,1),-.6,.6);
    this.target.y=THREE.MathUtils.clamp(this.target.y-(event.clientY-this.lastY)/Math.max(rect.height,1),-.6,.6);
    this.lastX=event.clientX;this.lastY=event.clientY;
  }
  pointerUp(event) {
    if(event.pointerId===this.pointerId)this.release();
  }
  release() {
    if(this.element?.hasPointerCapture?.(this.pointerId))this.element.releasePointerCapture(this.pointerId);
    this.dragging=false;this.pointerId=null;this.element=null;
  }
  stop() { this.release();this.target.copy(this.offset); }
  reset() { this.release();this.offset.set(0,0);this.target.set(0,0); }
  update(dt,enabled) {
    const group=this.getGroup();
    if(!enabled || !group){this.stop();return;}
    const blend=1-Math.exp(-Math.min(dt,.05)*24);
    const dx=(this.target.x-this.offset.x)*blend,dy=(this.target.y-this.offset.y)*blend;
    if(Math.abs(dx)+Math.abs(dy)<1e-7)return;
    group.getWorldPosition(this.world);
    this.view.copy(this.world).applyMatrix4(this.camera.matrixWorldInverse);
    const height=2*Math.max(.1,-this.view.z)*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)*.5)/this.camera.zoom;
    this.right.setFromMatrixColumn(this.camera.matrixWorld,0);
    this.up.setFromMatrixColumn(this.camera.matrixWorld,1);
    this.world.addScaledVector(this.right,dx*height*this.camera.aspect).addScaledVector(this.up,dy*height);
    group.position.copy(group.parent ? group.parent.worldToLocal(this.world) : this.world);
    this.offset.x+=dx;this.offset.y+=dy;
  }
}
