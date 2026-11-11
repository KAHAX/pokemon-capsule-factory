// Entry for index-hd.html only. The original page and its modules are untouched.
// The game is imported from here *after* the realism hook is installed, so both
// always share the same three.js module instance (even while Vite re-bundles deps).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { installRealism } from './realism.js';
import './hd.css';

const lowPower = window.innerWidth < 800 || /quality=low/.test(location.search);
installRealism({ THREE, EffectComposer, GTAOPass, ShaderPass }, {
  ao: !lowPower,
  dust: lowPower ? 0.6 : 1.0,
  grain: lowPower ? 0.014 : 0.022,
});

// Editorial chrome: viewfinder corners and a quiet caption line.
const app = document.getElementById('app');
if (app) {
  const frame = document.createElement('div');
  frame.className = 'hd-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.innerHTML = '<i></i><i></i><i></i><i></i>';
  const caption = document.createElement('div');
  caption.className = 'hd-caption';
  caption.setAttribute('aria-hidden', 'true');
  caption.innerHTML = '<b>N°01</b><i></i><span>Capsule Works · Midnight Atelier</span><i></i><span>拖拽旋转 · 转动把手</span>';
  app.append(frame, caption);

  // Fade the interface in once the loading screen has gone.
  const reveal = () => app.classList.add('hd-ready');
  if (!document.getElementById('loading')) reveal();
  else new MutationObserver((records, observer) => {
    if (!document.getElementById('loading')) { reveal(); observer.disconnect(); }
  }).observe(app, { childList: true });
}

import('../main.js');
