// Rasterize the existing card DOM once; the live WebGL portrait is composited each frame.
import { mobileEdition } from './mobile-performance.js';
let fontData;
async function fontURL() {
  return fontData ||= fetch('/assets/paytone-one.ttf').then(r => r.blob()).then(blob => new Promise(resolve => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob);
  }));
}
async function snapshot(element, width, height, { overlay = false } = {}) {
  const clone = element.cloneNode(true);
  const originals = [element, ...element.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((source, index) => {
    const target = copies[index], computed = getComputedStyle(source);
    for (const prop of computed) target.style.setProperty(prop, computed.getPropertyValue(prop));
    target.style.animation = 'none'; target.style.transition = 'none';
    if (source.tagName.toLowerCase() === 'use') {
      const symbol = document.getElementById(source.getAttribute('href')?.slice(1));
      if (symbol) { target.parentElement.setAttribute('viewBox', symbol.getAttribute('viewBox')); target.outerHTML = symbol.innerHTML; }
    }
  });
  clone.querySelectorAll('canvas').forEach(n => n.remove());
  clone.style.cssText += `;position:relative;left:0;top:0;margin:0;width:${width}px;height:${height}px;transform:none;opacity:1;visibility:visible;box-shadow:none;`;
  if (overlay) { clone.style.background = 'transparent'; clone.style.border = 'none'; }
  const font = await fontURL();
  const xml = new XMLSerializer().serializeToString(clone);
  const scale = mobileEdition ? 1 : 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width*scale}" height="${height*scale}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>@font-face{font-family:Paytone;src:url(${font})}</style>${xml}</div></foreignObject></svg>`;
  const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await image.decode(); return image;
}
export async function prepareCardSurface(card) {
  await document.fonts.ready;
  const node = card.cardElement, viewport = node.querySelector('.card-viewport');
  const width = node.offsetWidth, height = node.offsetHeight;
  const x = viewport.offsetLeft + viewport.clientLeft, y = viewport.offsetTop + viewport.clientTop;
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (mobileEdition) {
    try {
      const [frame, overlay] = await Promise.all([
        snapshot(node,width,height),
        snapshot(viewport,viewport.offsetWidth,viewport.offsetHeight,{overlay:true}),
      ]);
      const probe = document.createElement('canvas');
      probe.width = probe.height = 16;
      const ctx = probe.getContext('2d');
      ctx.drawImage(frame,0,0,16,16);
      const pixels = ctx.getImageData(0,0,16,16).data;
      let opaque = 0;
      for (let i=3; i<pixels.length; i+=4) if (pixels[i]>100) opaque++;
      if (opaque>64) return { frame,overlay,width,height,x,y,w,h };
    } catch {
      // Some WebViews reject SVG DOM snapshots. Use the canvas frame below.
    }
    // Paint the static ink directly. SVG foreignObject can decode successfully
    // yet rasterize transparent on phone browsers, especially off screen.
    const frame = document.createElement('canvas');
    frame.width = width; frame.height = height;
    const ctx = frame.getContext('2d');
    const theme = card.character.theme;
    ctx.fillStyle = theme.primary; ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#f1ead7'; ctx.fillRect(4,4,width-8,height-8);
    ctx.fillStyle = theme.dark; ctx.fillRect(x-2,y-2,w+4,h+4);
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(card.character.name, x, Math.max(18,y*.66),w*.66);
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';ctx.fillText('HP '+card.character.hp,x+w,Math.max(18,y*.66));ctx.textAlign='left';
    ctx.font = 'bold 15px sans-serif';ctx.fillText(card.character.attack,x,y+h+24,w*.77);
    ctx.font = '12px sans-serif';ctx.fillText(card.character.attackText,x,y+h+47,w);
    ctx.fillStyle = theme.dark;ctx.fillRect(x,height-29,w,18);
    ctx.fillStyle = '#fff';ctx.font = '10px sans-serif';
    ctx.fillText(card.character.number+'   '+(card.entry.shiny?'SHINY':'POKÉMON')+'  ·  COLLECTION',x+5,height-16,w-10);
    const overlay = document.createElement('canvas');overlay.width=overlay.height=1;
    return {frame,overlay,width,height,x,y,w,h};
  }
  const [frame, overlay] = await Promise.all([snapshot(node,width,height),snapshot(viewport,viewport.offsetWidth,viewport.offsetHeight,{overlay:true})]);
  return { frame, overlay, width, height, x, y, w, h };
}

