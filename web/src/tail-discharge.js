const rand = (a,b) => a + Math.random()*(b-a);
const TAU = Math.PI*2;

// Independent, short-lived discharge channels. Nothing rotates as a group:
// positions, forks, thickness and restrike times are chosen anew per channel.
export class TailDischarge {
  constructor(positions, styles) {
    this.positions=positions; this.styles=styles;
    this.bolts=Array.from({length:9},()=>({
      age:100, life:0, count:0, segments:new Float32Array(34*6),
      widths:new Float32Array(34), weights:new Float32Array(34),
      axial:new Float32Array(17), angles:new Float32Array(17), radius:new Float32Array(17),
      path:new Float32Array(17*3),
    }));
    this.reset();
  }
  reset() {
    for(const bolt of this.bolts) bolt.age=100;
    this.active=false; this.next=0; this.burstLeft=0; this.count=0; this.flash=0;
  }
  spawn() {
    const b=this.bolts.find(b=>b.age>=b.life);
    if(!b)return;
    b.age=0;b.life=rand(.09,.23);b.brightness=rand(.7,1.45);b.width=rand(.62,1.25);
    b.restrike=rand(.36,.65);b.notch=rand(.08,.19);b.count=0;
    const start=rand(0,TAU),turn=rand(.5,1.8)*(Math.random()<.5?-1:1);
    b.axial[0]=rand(-.18,.12);b.axial[16]=b.axial[0]+rand(-.16,.18);
    b.angles[0]=start;b.angles[16]=start+turn;
    b.radius[0]=rand(.14,.17);b.radius[16]=rand(.14,.18);
    // Midpoint displacement creates large direction breaks and finer kinks,
    // rather than a smooth sinusoid with noise sprinkled over it.
    for(let stride=16;stride>=2;stride/=2){
      for(let left=0;left<16;left+=stride){
        const right=left+stride,mid=(left+right)/2,scale=(stride/16)**.72;
        b.axial[mid]=(b.axial[left]+b.axial[right])/2+rand(-.065,.065)*scale;
        b.angles[mid]=(b.angles[left]+b.angles[right])/2+rand(-.58,.58)*scale;
        b.radius[mid]=Math.max(.14,(b.radius[left]+b.radius[right])/2+rand(-.008,.038)*scale);
      }
    }
    for(let j=0;j<=16;j++){
      b.path[j*3]=b.axial[j];
      b.path[j*3+1]=Math.cos(b.angles[j])*b.radius[j];
      b.path[j*3+2]=Math.sin(b.angles[j])*b.radius[j];
    }
    const segment=(ax,ay,az,bx,by,bz,width,weight)=>{
      const k=b.count*6;b.segments[k]=ax;b.segments[k+1]=ay;b.segments[k+2]=az;
      b.segments[k+3]=bx;b.segments[k+4]=by;b.segments[k+5]=bz;
      b.widths[b.count]=width;b.weights[b.count]=weight;b.count++;
    };
    for(let j=1;j<=16;j++){
      const a=(j-1)*3,c=j*3;
      segment(b.path[a],b.path[a+1],b.path[a+2],b.path[c],b.path[c+1],b.path[c+2],rand(.82,1.12),rand(.78,1));
    }
    const forks=Math.floor(rand(0,4));
    for(let fork=0;fork<forks;fork++){
      const at=Math.floor(rand(3,14)),idx=at*3;
      const x=b.path[idx],y=b.path[idx+1],z=b.path[idx+2];
      const theta=b.angles[at]+rand(-.65,.65),length=rand(.065,.22),lean=rand(-.12,.12);
      let px=x,py=y,pz=z;
      for(let j=1;j<=6;j++){
        const u=j/6;
        const nx=x+lean*u+rand(-.018,.018)*u;
        const ny=y+Math.cos(theta)*length*u+rand(-.018,.018)*u;
        const nz=z+Math.sin(theta)*length*u+rand(-.018,.018)*u;
        segment(px,py,pz,nx,ny,nz,.66*(1-u*.7),.75*(1-u*.6));
        px=nx;py=ny;pz=nz;
      }
    }
  }
  update(dt,energy,origin,axis,right,up,size) {
    if(!this.active){
      this.active=true;this.burstLeft=rand(.35,.9);this.next=rand(.025,.09);
      for(let i=0;i<3;i++)this.spawn();
    }
    this.burstLeft-=dt;this.next-=dt;
    if(this.next<=0){
      if(this.burstLeft<=0){
        // Short, uneven pauses between clusters, not a periodic heartbeat.
        this.next=rand(.08,.24);this.burstLeft=rand(.35,.95)+this.next;
      }else{
        this.spawn();if(Math.random()<.35*energy)this.spawn();
        this.next=rand(.026,.105)/(Math.max(.4,energy));
      }
    }
    let n=0,peak=0;
    for(const b of this.bolts){
      b.age+=dt;if(b.age>=b.life)continue;
      const u=b.age/b.life;
      const attack=Math.min(1,u/.06),fade=(1-u)**.5;
      const dropout=u>b.restrike&&u<b.restrike+b.notch;
      const pulse=dropout?.025:attack*fade*(u>b.restrike?1.2:1);
      const power=pulse*b.brightness*energy;peak=Math.max(peak,power);
      for(let j=0;j<b.count;j++){
        const base=j*6,dst=n*6;
        for(let endpoint=0;endpoint<2;endpoint++){
          const k=base+endpoint*3,d=dst+endpoint*3;
          const x=b.segments[k]*size,y=b.segments[k+1]*size,z=b.segments[k+2]*size;
          this.positions[d]=origin.x+axis.x*x+right.x*y+up.x*z;
          this.positions[d+1]=origin.y+axis.y*x+right.y*y+up.y*z;
          this.positions[d+2]=origin.z+axis.z*x+right.z*y+up.z*z;
        }
        this.styles[n*2]=power*b.weights[j];this.styles[n*2+1]=b.width*b.widths[j];n++;
      }
    }
    this.count=n;this.flash=Math.min(1,peak);
  }
}
