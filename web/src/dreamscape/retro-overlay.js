// Full-screen old-TV veil for the ball close-up and the Pokédex: fine round dot matrix,
// scanlines, a slow rolling bright band, faint flicker and a curved-glass vignette.
const CSS = `
#retro-crt { position: fixed; inset: 0; pointer-events: none; z-index: 40; opacity: 0;
  transition: opacity .7s ease; mix-blend-mode: multiply; background: #fff; }
#retro-crt.on { opacity: 1; animation: retro-flicker 4.7s steps(60) infinite; }
#retro-crt::before { content: ''; position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(20,24,48,0) 0 .8px, rgba(20,24,48,.2) 1.4px) 0 0 / 3px 3px; }
#retro-crt::after { content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 80% 74% at 50% 50%, rgba(10,12,30,0) 52%, rgba(10,12,30,.42) 100%),
    repeating-linear-gradient(0deg, rgba(14,18,40,.16) 0 1px, rgba(14,18,40,0) 1px 3px); }
#retro-crt-band { position: fixed; inset: 0; pointer-events: none; z-index: 41; opacity: 0;
  transition: opacity .7s ease; mix-blend-mode: screen; overflow: hidden; }
#retro-crt-band.on { opacity: 1; }
#retro-crt-band::before { content: ''; position: absolute; left: 0; right: 0; height: 22vh; top: -25vh;
  background: linear-gradient(180deg, transparent, rgba(150,200,255,.045) 45%, rgba(190,230,255,.07) 50%, rgba(150,200,255,.045) 55%, transparent);
  animation: retro-roll 7.5s linear infinite; }
#retro-crt-band::after { content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(255,60,90,.025), transparent 6%, transparent 94%, rgba(60,160,255,.025)); }
@keyframes retro-roll { to { transform: translateY(150vh); } }
@keyframes retro-flicker { 0%, 100% { opacity: 1; } 47% { opacity: .93; } 48% { opacity: 1; } 81% { opacity: .96; } }
@media (prefers-reduced-motion: reduce) { #retro-crt.on, #retro-crt-band::before { animation: none; } }
`;

export function installRetroOverlay() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const veil = document.createElement('div');
  veil.id = 'retro-crt';
  const band = document.createElement('div');
  band.id = 'retro-crt-band';
  document.body.append(veil, band);
  let active = false;
  return {
    set(on) {
      if (on === active) return;
      active = on;
      veil.classList.toggle('on', on);
      band.classList.toggle('on', on);
    },
  };
}
