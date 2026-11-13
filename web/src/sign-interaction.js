// A fixed fault score drives both the light interruption and the electrical
// crackle. Short contacts, a brief brownout, then an uneven restrike and recovery.
export const SIGN_FAULT_CUES = [
  {at:.035,duration:.035,level:.18},
  {at:.105,duration:.065,level:.04},
  {at:.20,duration:.025,level:.35},
  {at:.38,duration:.15,level:.025},
  {at:.56,duration:.025,level:.12},
  {at:.625,duration:.045,level:.06},
  {at:.735,duration:.02,level:.28},
  {at:.90,duration:.075,level:.12},
];
const DURATION=1.3;
export function installSignInteraction(scene) {
  const root=scene.getObjectByName('Main sign / Blender cyberpunk neon');
  const lamps=new Map();
  root?.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(m.emissiveIntensity>0 && /luminous|neon tube|light faces|edge accents/i.test(m.name))lamps.set(m,m.emissiveIntensity);});
  let age=DURATION;
  let audioClock=null,audioStart=0;
  return {
    raycast(raycaster){return root && raycaster.intersectObject(root,true).length ? {action:'sign'} : null;},
    play(fx){if(age<DURATION)return;age=0;audioClock=fx?.ctx?.state==='running'?fx.ctx:null;audioStart=audioClock?.currentTime||0;fx?.signBuzz(SIGN_FAULT_CUES);},
    update(dt){
      if(age>=DURATION)return;
      age+=dt;
      if(audioClock?.state==='running')age=Math.max(age,audioClock.currentTime-audioStart);
      let k=1;
      for(const cue of SIGN_FAULT_CUES){
        const t=age-cue.at;
        if(t>=0 && t<cue.duration){k=cue.level;break;}
        // Neon takes a few milliseconds to recover after contact returns.
        if(t>=cue.duration && t<cue.duration+.045)k=Math.min(k,cue.level+(1-cue.level)*(t-cue.duration)/.045);
      }
      // The lettering loses contact strongly while the separate frame circuit
      // only sags. Keep the metal/backplate intact instead of flashing a panel.
      for(const [m,base] of lamps){
        const sensitivity=/yellow luminous letters/i.test(m.name)?1:/neon tube/i.test(m.name)?.78:.32;
        m.emissiveIntensity=base*(1-(1-k)*sensitivity);
      }
    },
  };
}
