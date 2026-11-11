import * as THREE from 'three';

export const ICONS = [
  { name: '小火龙', color: '#efad88' },
  { name: '皮卡丘', color: '#efd675' },
  { name: '杰尼龟', color: '#8ed4dc' },
  { name: '妙蛙种子', color: '#a5d39b' },
];

const atlas = new Image();
let atlasReady = false;
atlas.onload = () => { atlasReady = true; };
atlas.src = '/assets/pokemon-silhouettes.jpg';
const iconImages = ICONS.map((_, index) => {
  const image = new Image();
  image.src = `/assets/screen-icon-${index}.png`;
  return image;
});
const cropCanvas = document.createElement('canvas');
cropCanvas.width = 150;
cropCanvas.height = 150;
const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });

function drawSilhouette(ctx, index) {
  const updated = iconImages[index];
  if (updated?.complete && updated.naturalWidth > 0) {
    ctx.drawImage(updated, 64, 25, 256, 230);
    return;
  }
  if (!atlasReady) return;
  cropContext.clearRect(0, 0, 150, 150);
  cropContext.drawImage(atlas, 67 + index * 163, 211, 150, 150, 0, 0, 150, 150);
  const image = cropContext.getImageData(0, 0, 150, 150);
  for (let i = 0; i < image.data.length; i += 4) {
    const delta = Math.abs(image.data[i] - 255) + Math.abs(image.data[i + 1] - 238) + Math.abs(image.data[i + 2] - 195);
    image.data[i + 3] = delta < 38 ? 0 : delta > 95 ? 255 : (delta - 38) / 57 * 255;
  }
  cropContext.putImageData(image, 0, 0);
  ctx.save();
  ctx.shadowColor = ICONS[index].color;
  ctx.shadowBlur = 12;
  ctx.drawImage(cropCanvas, 89, 40, 206, 206);
  ctx.restore();
}

export function makeIconTexture(index, final = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(192, 135, 20, 192, 150, 230);
  gradient.addColorStop(0, final ? '#233f48' : '#172f38');
  gradient.addColorStop(1, '#0c1d25');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 384, 300);
  ctx.strokeStyle = 'rgba(176,235,217,.07)';
  ctx.lineWidth = 1;
  for (let x = 24; x < 384; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 300); ctx.stroke(); }
  for (let y = 12; y < 300; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(384, y); ctx.stroke(); }
  drawSilhouette(ctx, index);
  ctx.fillStyle = final ? '#b6e4dc' : '#6d9b9c';
  ctx.fillRect(151, 260, 82, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
