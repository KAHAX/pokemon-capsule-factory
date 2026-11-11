// A short-lived screen-space energy trail. No permanent canvas or RAF loop.
export function playCardRecall(path, shiny = false, duration = .95) {
  const canvas = document.createElement('canvas');
  canvas.className = 'card-recall-particles';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:150';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const palette = shiny ? ['#fff4b1', '#ffc76b', '#b8efff', '#e4bdff'] : ['#ccf9ff', '#72d8ff', '#ffdf9e'];
  const smooth = t => t * t * (3 - 2 * t);
  const particles = Array.from({ length: 120 }, (_, i) => ({
    birth: .08 + i / 120 * duration * .66,
    life: .25 + Math.random() * .32, angle: Math.random() * Math.PI * 2,
    radius: 12 + Math.random() * 48, size: 1 + Math.random() * 2.6, color: palette[i % palette.length],
  }));
  let progress = 0, arrivedAt = null, cancelled = false;
  let lastUpdate = performance.now();
  function draw(now) {
    if (cancelled || now - lastUpdate > 5000) { canvas.remove(); return; }
    const time = duration * progress + (arrivedAt === null ? 0 : (now - arrivedAt) / 1000);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const t = (time - p.birth) / p.life;
      if (t < 0 || t > 1) continue;
      const flight = smooth(Math.min(1, p.birth / duration));
      const sx = path.x + (path.targetX - path.x) * flight;
      const sy = path.y + (path.targetY - path.y) * flight;
      const u = t * t, a = p.angle + t * 6;
      const spread = Math.sin(Math.PI * t) * p.radius;
      const x = sx + (path.targetX - sx) * u + Math.cos(a) * spread;
      const y = sy + (path.targetY - sy) * u + Math.sin(a) * spread;
      ctx.globalAlpha = Math.sin(Math.PI * t) * .9;
      ctx.strokeStyle = ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 10;
      ctx.lineWidth = p.size * .7;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x - (path.targetX - sx) * .025, y - (path.targetY - sy) * .025); ctx.stroke();
      ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
    }
    // A collapsing halo signals absorption, followed by a brief four-point glint.
    const arrival = (time - duration * .58) / .65;
    if (arrival > 0 && arrival < 1) {
      const x = path.targetX, y = path.targetY;
      const alpha = Math.sin(Math.PI * arrival);
      ctx.globalAlpha = alpha * .85; ctx.shadowBlur = 18;
      ctx.strokeStyle = ctx.shadowColor = palette[0]; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(x, y, 5 + 43 * (1 - arrival), 3 + 23 * (1 - arrival), -.5, 0, Math.PI * 2); ctx.stroke();
      const r = Math.sin(Math.PI * arrival) * 20;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r * 2));
      glow.addColorStop(0, '#fffce4'); glow.addColorStop(.2, palette[1]); glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow; ctx.fillRect(x-r*2,y-r*2,r*4,r*4);
      ctx.fillStyle = '#fffef2'; ctx.beginPath();
      ctx.moveTo(x,y-r);ctx.lineTo(x+3,y-3);ctx.lineTo(x+r,y);ctx.lineTo(x+3,y+3);
      ctx.lineTo(x,y+r);ctx.lineTo(x-3,y+3);ctx.lineTo(x-r,y);ctx.lineTo(x-3,y-3);ctx.closePath();ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (time < duration + .65) requestAnimationFrame(draw); else canvas.remove();
  }
  requestAnimationFrame(draw);
  return {
    setProgress(value) {
      progress = Math.min(1, Math.max(0, value)); lastUpdate = performance.now();
      if (progress === 1 && arrivedAt === null) arrivedAt = lastUpdate;
    },
    stopIfIncomplete() { if (progress < 1) { cancelled = true; canvas.remove(); } },
  };
}
