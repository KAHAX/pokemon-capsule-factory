import * as THREE from 'three';
import { loadPokedexReferenceArt, composePokedexReferences } from './pokedex-reference-art.js';

// Crisp device-specific print artwork, kept separate from the AI material atlas.
export async function createPokedexDetailArt() {
  const references=await loadPokedexReferenceArt();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
  const g=canvas.getContext('2d');
  let seed=25151;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const panel=(i,draw)=>{g.save();g.translate(i%2*1024,Math.floor(i/2)*1024);g.beginPath();g.rect(0,0,1024,1024);g.clip();draw();g.restore();};
  const text=(s,x,y,size,color='#e8eee4',align='center')=>{g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';g.font=`700 ${size}px monospace`;g.fillText(s,x,y);};
  const line=(points,color='#c9ded9',width=4)=>{g.strokeStyle=color;g.lineWidth=width;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();};
  const circle=(x,y,r,fill,stroke,width=6)=>{g.beginPath();g.arc(x,y,r,0,Math.PI*2);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}};
  const ball=(x,y,r)=>{
    circle(x,y,r,'#ede5cb','#273744',r*.1);
    g.fillStyle='#bd353a';g.beginPath();g.arc(x,y,r*.91,Math.PI,Math.PI*2);g.fill();
    line([[x-r*.92,y],[x+r*.92,y]],'#273744',r*.11);
    circle(x,y,r*.27,'#ede5cb','#273744',r*.1);circle(x,y,r*.13,null,'#89948d',r*.025);
  };
  const aging=(x,y,w,h)=>{
    g.save();g.globalAlpha=.2;
    for(let i=0;i<170;i++){
      const px=x+random()*w,py=y+(random()<.5?random()*.05:.95+random()*.05)*h;
      line([[px,py],[px+random()*19+2,py+random()*3]],random()<.5?'#263746':'#fff5d9',random()*2+1);
    }g.restore();
  };
  const barcode=(x,y,w,h)=>{let px=x;while(px<x+w){g.fillStyle='#2a3942';const width=random()*5+2;g.fillRect(px,y,width,h);px+=width+random()*5+2;}};
  panel(0,()=>{
    circle(512,512,430,'#e7ddbb','#253748',16);circle(512,512,399,null,'#ad3941',9);
    circle(512,478,240,'#213746');ball(512,478,165);
    text('FIELD UNIT',512,175,64,'#273746');text('KANTO • 025',512,786,63,'#273746');
    for(const x of [184,840]){line([[x-24,487],[x+24,487]],'#2c656e',8);line([[x,463],[x,511]],'#2c656e',8);}
    text('RESEARCH DIVISION',512,879,25,'#545b55');aging(122,133,780,760);
  });
  panel(1,()=>{
    g.fillStyle='#d8cfac';g.beginPath();g.roundRect(70,90,884,844,45);g.fill();
    g.strokeStyle='#253747';g.lineWidth=12;g.stroke();
    g.fillStyle='#253747';g.fillRect(91,115,842,115);text('POKÉDEX / DATA',512,173,55);
    ball(284,419,132);text('PK-025',657,388,82,'#273747');text('KANTO RECORD',653,480,30,'#374b52');
    line([[121,597],[901,597]],'#a63b42',10);
    text('PORTABLE RESEARCH SYSTEM',512,655,36,'#273747');barcode(169,730,678,91);
    text('025 • 151 / FIELD ARCHIVE',512,875,30,'#273747');aging(84,104,856,814);
  });
  panel(2,()=>{
    g.globalAlpha=.8;circle(512,380,227,null,'#afc8ca',5);circle(512,380,167,null,'#afc8ca',3);
    line([[285,380],[739,380]]);circle(512,380,58,null,'#dbe6d9',6);
    g.setLineDash([10,15]);circle(512,380,267,null,'#afc8ca',3);g.setLineDash([]);
    for(const [x,y,end] of [[245,380,90],[779,380,934],[512,113,512]]){
      line([[x,y],[end,y],[end,78]],'#afc8ca',3);circle(end,78,10,null,'#c6e3de',4);
    }
    for(let i=0;i<4;i++){
      const y=720+i*55;line([[98,y],[240+i*28,y],[290+i*28,y-42],[790,y-42],[856,y-84]],'#adc9c5',4);
      circle(98,y,9,null,'#d6e9dc',4);circle(856,y-84,9,null,'#d6e9dc',4);
    }
    text('OPTICAL ARRAY',512,54,30);text('SCAN / SYNC / STORE',512,962,31);
    text('CH.01',142,590,23);text('CH.02',868,590,23);
  });
  panel(3,()=>{
    g.fillStyle='#e6dfc6';g.beginPath();g.roundRect(73,105,878,814,38);g.fill();
    g.strokeStyle='#203747';g.lineWidth=13;g.stroke();
    g.fillStyle='#af373f';g.fillRect(94,128,836,128);text('POKÉDEX',512,190,83);
    ball(512,469,162);text('KANTO FIELD RESEARCH',512,689,42,'#243b48');
    text('PORTABLE DATABASE • 025-151',512,752,27,'#34424a');
    barcode(211,796,602,55);aging(87,119,850,786);
  });
  composePokedexReferences(canvas,references);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
