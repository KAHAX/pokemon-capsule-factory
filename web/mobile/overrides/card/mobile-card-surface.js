import * as THREE from 'three';

// One composited WebGL surface rotates with the card. The phone compositor no
// longer has to tilt a WebGL canvas, live text and multiple blend/filter layers.
// Only the static frame is uploaded; the moving portrait stays on the GPU.
export class MobileCardSurface {
  constructor(owner, surface, card) {
    this.owner=owner;this.surface=surface;this.card=card;this.renderer=owner.renderer;
    const raster=(image,width,height)=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(image,0,0,width,height);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;return texture;
    };
    const f=surface;
    this.frame=raster(f.frame,f.width,f.height);
    this.overlay=raster(f.overlay,f.w+4,f.h+4);
    this.portrait=new THREE.WebGLRenderTarget(Math.max(1,Math.round(f.w*.8)),Math.max(1,Math.round(f.h*.8)),{depthBuffer:false});
    this.material=new THREE.ShaderMaterial({
      depthTest:false,depthWrite:false,toneMapped:true,
      uniforms:{frame:{value:this.frame},portrait:{value:this.portrait.texture},overlay:{value:this.overlay},
        rect:{value:new THREE.Vector4(f.x/f.width,1-(f.y+f.h)/f.height,f.w/f.width,f.h/f.height)},
        overlayRect:{value:new THREE.Vector4((f.x-2)/f.width,1-(f.y+f.h+2)/f.height,(f.w+4)/f.width,(f.h+4)/f.height)},
        portraitSize:{value:new THREE.Vector2(f.w,f.h)},glare:{value:new THREE.Vector2(.5,.35)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`varying vec2 vUv;
        uniform sampler2D frame,portrait,overlay;
        uniform vec4 rect,overlayRect;uniform vec2 portraitSize,glare;
        void main(){
          vec4 color=texture2D(frame,vUv);
          vec2 q=(vUv-rect.xy)/rect.zw;
          if(all(greaterThanEqual(q,vec2(0.)))&&all(lessThanEqual(q,vec2(1.)))){
            vec4 art=texture2D(portrait,q);
            #ifdef TONE_MAPPING
              art.rgb=toneMapping(art.rgb);
            #endif
            vec2 d=abs(q-.5)*portraitSize-(portraitSize*.5-4.);
            float rounded=1.-smoothstep(3.3,4.3,length(max(d,vec2(0.))));
            color=mix(color,vec4(art.rgb,1.),rounded);
          }
          vec2 oq=(vUv-overlayRect.xy)/overlayRect.zw;
          if(all(greaterThanEqual(oq,vec2(0.)))&&all(lessThanEqual(oq,vec2(1.)))){
            vec4 top=texture2D(overlay,oq);color.rgb=mix(color.rgb,top.rgb,top.a);
          }
          float sheen=exp(-dot(vUv-glare,vUv-glare)*20.)*.045;
          gl_FragColor=vec4(color.rgb+sheen,color.a);
          #include <colorspace_fragment>
        }`,
    });
    this.scene=new THREE.Scene();this.camera=new THREE.Camera();
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.scene.add(this.quad);
    card.style.width=f.width+'px';card.style.height=f.height+'px';
    this.renderer.domElement.classList.add('mobile-card-surface');card.appendChild(this.renderer.domElement);
    card.classList.add('mobile-card-composed');this.resize();
    this.onResize=()=>{this.resize();owner.fitModel?.();owner.onMobileSurfaceResize?.();};window.addEventListener('resize',this.onResize);
  }
  resize(){
    const f=this.surface;
    this.fit=Math.min(1,(innerWidth-36)/f.width,Math.max(160,innerHeight-110)/f.height);
    this.renderer.setSize(f.width,f.height,false);
    this.owner.camera.aspect=f.w/f.h;this.owner.camera.updateProjectionMatrix();
  }
  render(scene,camera,options){
    const r=this.renderer,previous=r.getRenderTarget();
    try{
      r.setRenderTarget(this.portrait);
      this.owner.studioEffect.render(scene,camera,{...options,size:{width:this.portrait.width,height:this.portrait.height}});
      r.setRenderTarget(previous);
      this.material.uniforms.glare.value.set(.5+this.owner.current.x*.25,.65-this.owner.current.y*.2);
      r.render(this.scene,this.camera);
    }finally{r.setRenderTarget(previous);}
  }
  dispose(){window.removeEventListener('resize',this.onResize);this.frame.dispose();this.overlay.dispose();this.portrait.dispose();this.material.dispose();this.quad.geometry.dispose();}
}
