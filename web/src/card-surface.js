// Rasterize the existing card DOM once; the live WebGL portrait is composited each frame.
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width*2}" height="${height*2}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>@font-face{font-family:Paytone;src:url(${font})}</style>${xml}</div></foreignObject></svg>`;
  const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await image.decode(); return image;
}
export async function prepareCardSurface(card) {
  await document.fonts.ready;
  const node = card.cardElement, viewport = node.querySelector('.card-viewport');
  const width = node.offsetWidth, height = node.offsetHeight;
  const x = viewport.offsetLeft + viewport.clientLeft, y = viewport.offsetTop + viewport.clientTop;
  const w = viewport.clientWidth, h = viewport.clientHeight;
  const [frame, overlay] = await Promise.all([snapshot(node,width,height),snapshot(viewport,viewport.offsetWidth,viewport.offsetHeight,{overlay:true})]);
  return { frame, overlay, width, height, x, y, w, h };
}
