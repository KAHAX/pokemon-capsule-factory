// A separate route: the preserved desktop entry keeps its existing behaviour.
export const mobileEdition = /^\/mobile(?:\/|$)/.test(location.pathname);
export const mobilePerformance = mobileEdition || matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches;

// Adjust only raster resolution, with hysteresis to avoid visible oscillation.
// Actual elapsed time drives animations; this never slows game/physics time.
export class MobileResolutionBudget {
  constructor() { this.ratio=mobileEdition ? .8 : .9; this.age=0; this.time=0; this.frames=0; this.goodTime=0; }
  sample(dt) {
    this.age+=dt;
    if(this.age<6 || !Number.isFinite(dt) || dt<=0 || dt>.5)return false;
    this.time+=dt;this.frames++;
    if(this.time<3)return false;
    const average=this.time/this.frames;let next=this.ratio;
    if(average>.043) {next=Math.max(mobileEdition ? .6 : .65,this.ratio-.1);this.goodTime=0;}
    else if(average<.035) {this.goodTime+=this.time;if(this.goodTime>=9){next=Math.min(mobileEdition ? .95 : 1,this.ratio+.05);this.goodTime=0;}}
    else this.goodTime=0;
    this.time=0;this.frames=0;
    next=Math.round(next*100)/100;
    if(next===this.ratio)return false;
    this.ratio=next;return true;
  }
}
