import { defaults, getDisplaySettings, setDisplaySettings } from './debug-settings.js';
import './debug-panel.css';

export function installDebugPanel() {
  const panel = document.createElement('section');
  panel.id = 'capsule-debug'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '扭蛋调试控制台');
  panel.innerHTML = `<header><div><small>CAPSULE STUDIO</small><h2>调试控制台</h2></div><button type="button" aria-label="关闭调试控制台">×</button></header>
    <p>F11 打开 / 关闭 · 设置自动保存</p>
    <label for="debug-gold">扭蛋出金概率 <output id="gold-value"></output></label>
    <input id="debug-gold" type="range" min="0" max="100" step="1" data-setting="goldChance">
    <p>下次转动把手生效。出金时三个电子屏均为皮卡丘，并抽取闪光宝可梦。</p>
    <label for="debug-depth">卡牌视差深度 <output id="depth-value"></output></label>
    <input id="debug-depth" type="range" min="0" max="2" step="0.05" data-setting="parallaxDepth">
    <label for="debug-size">卡牌模型大小 <output id="size-value"></output></label>
    <input id="debug-size" type="range" min="0.5" max="1.35" step="0.01" data-setting="modelScale">
    <p>卡牌参数即时生效。0 倍视差关闭空间偏移；较大的模型可能超出画框。</p>
    <div class="debug-render-heading">场景画风 <small>SCENE STYLE</small></div>
    <label class="debug-toggle" for="debug-toon"><span>三渲二 · 漫画明暗</span><input id="debug-toon" type="checkbox" role="switch" data-setting="sceneToon"></label>
    <label class="debug-toggle" for="debug-outline"><span>深灰色描边</span><input id="debug-outline" type="checkbox" role="switch" data-setting="sceneOutline"></label>
    <p>独立开关，即时生效；两项关闭恢复原场景渲染。</p>
    <button type="button" id="debug-reset">恢复默认参数</button>`;
  document.body.appendChild(panel);
  const sync = () => {
    const values = getDisplaySettings();
    panel.querySelectorAll('[data-setting]').forEach(input => { if (input.type === 'checkbox') input.checked = values[input.dataset.setting]; else input.value = values[input.dataset.setting]; });
    panel.querySelector('#gold-value').textContent = `${values.goldChance}%`;
    panel.querySelector('#depth-value').textContent = `${values.parallaxDepth.toFixed(2)} 倍`;
    panel.querySelector('#size-value').textContent = `${Math.round(values.modelScale * 100)}%`;
  };
  let previousFocus;
  const show = (visible) => {
    if (visible) { previousFocus = document.activeElement; window.dispatchEvent(new CustomEvent('capsule-panel-open', { detail: 'display' })); }
    panel.hidden = !visible;
    if (visible) panel.querySelector('input').focus();
    else previousFocus?.focus?.({ preventScroll: true });
  };
  window.addEventListener('keydown', event => {
    if (event.key === 'F11') { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) show(panel.hidden); }
    else if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); show(false); }
  }, true);
  window.addEventListener('capsule-panel-open', event => { if (event.detail !== 'display') panel.hidden = true; });
  // Keep the machine's hotkeys and pointer handlers out of the panel.
  for (const name of ['keydown', 'pointerdown', 'pointerup', 'click', 'wheel']) panel.addEventListener(name, event => event.stopPropagation());
  panel.querySelector('header button').addEventListener('click', () => show(false));
  panel.querySelector('#debug-reset').addEventListener('click', () => setDisplaySettings(defaults));
  panel.querySelectorAll('input').forEach(input => input.addEventListener('input', () => setDisplaySettings({ [input.dataset.setting]: input.type === 'checkbox' ? input.checked : Number(input.value) })));
  window.addEventListener('capsule-settings-change', sync); sync();
}
