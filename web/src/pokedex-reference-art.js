// Original user-supplied artwork. Remove only connected exterior backgrounds;
// white lettering and the pale interiors of the illustrations stay intact.
function cut(image, box, background, threshold=65) {
  const c=document.createElement('canvas');c.width=box[2];c.height=box[3];
  const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,...box,0,0,c.width,c.height);
  if(background) {
    const d=g.getImageData(0,0,c.width,c.height),p=d.data,w=c.width,h=c.height;
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
    const add=i=>{if(seen[i])return;seen[i]=1;const k=i*4;
      if(Math.hypot(p[k]-background[0],p[k+1]-background[1],p[k+2]-background[2])<threshold)queue[tail++]=i;};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++];p[i*4+3]=0;const x=i%w,y=Math.floor(i/w);
      if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
    g.putImageData(d,0,0);
  }
  return c;
}

function badge(image,x,y) {
  const c=document.createElement('canvas');c.width=244;c.height=94;const g=c.getContext('2d');
  g.beginPath();g.roundRect(2,2,240,90,45);g.clip();g.drawImage(image,x,y,244,94,0,0,244,94);return c;
}

export async function loadPokedexReferenceArt() {
  const load=name=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=`/assets/pokedex/reference/${name}.jpg`;});
  const [logo,types,rotom,icons]=await Promise.all(['pixel-logo','types','rotom','icons'].map(load));
  return {
    logo:cut(logo,[46,44,737,290],[255,255,255],95),
    electric:badge(types,40,179),psychic:badge(types,636,640),steel:badge(types,338,792),
    rotom:cut(rotom,[48,241,1107,633],[251,245,225],85),
    pikachu:cut(icons,[468,287,106,96],[79,135,222],80),
    bolt:cut(icons,[393,274,62,109],[79,135,222],80),
    ball:cut(icons,[164,180,99,99],[79,135,222],80),
    master:cut(icons,[271,182,98,98],[79,135,222],80),
  };
}

export function composePokedexReferences(canvas, art) {
  const old=document.createElement('canvas');old.width=old.height=2048;old.getContext('2d').drawImage(canvas,0,0);
  const g=canvas.getContext('2d');g.clearRect(0,0,2048,2048);
  const tile=(i,draw)=>{g.save();g.translate(i%2*1024,Math.floor(i/2)*1024);g.beginPath();g.rect(0,0,1024,1024);g.clip();draw();g.restore();};
  const put=(im,x,y,w,h,angle=0)=>{g.save();g.translate(x+w/2,y+h/2);g.rotate(angle);g.drawImage(im,-w/2,-h/2,w,h);g.restore();};
  const print=(s,x,y,size=15)=>{g.fillStyle='#e8ddba';g.font=`600 ${size}px monospace`;g.textAlign='left';g.fillText(s,x,y);};
  tile(0,()=>{
    // Full left face: keep the screen and all controls uncovered.
    g.drawImage(old,0,0,1024,1024,77,931,102,78);
    put(art.electric,270,934,230,66,-.025);
    put(art.bolt,25,619,46,84,-.08);
  });
  tile(1,()=>{
    // Removable cartridge label, intentionally a printed paper label.
    g.drawImage(old,1024,0,1024,1024,0,0,1024,1024);
    g.fillStyle='#d8cfac';g.fillRect(110,275,802,300);
    put(art.rotom,145,290,480,275);put(art.master,708,325,166,166);
  });
  tile(2,()=>{
    g.save();g.globalAlpha=.13;g.drawImage(old,0,1244,1024,804,0,220,1024,804);g.restore();
    put(art.logo,150,12,630,181);
    // Feature labels in the free strip below the keypad.
    put(art.electric,88,681,190,55);
    put(art.psychic,373,681,190,55);
    put(art.bolt,888,677,35,52);
  });
  tile(3,()=>{
    // Back cover: keep only the small service label.
    g.drawImage(old,1024,1024,1024,1024,402,825,219,164);
  });
}
