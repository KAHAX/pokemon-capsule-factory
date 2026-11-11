import { configureNextPokemon, getNextPokemon, selectNextPokemon } from './next-pokemon.js';
import './next-pokemon-panel.css';

export function installNextPokemonPanel(manifest) {
  configureNextPokemon(manifest);
  const panel = document.createElement('section');
  panel.id = 'next-pokemon-panel'; panel.hidden = true;
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','指定下一只宝可梦');
  panel.innerHTML = `<header><div><small>NEXT ENCOUNTER · F12</small><h2>指定下一只宝可梦</h2></div><button type="button" data-close aria-label="关闭宝可梦选择">×</button></header>
    <p>选择后，下次成功转动把手生效，仅一次。已出货或正在进行的扭蛋不受影响。</p>
    <label for="next-pokemon-search">搜索宝可梦</label>
    <input id="next-pokemon-search" type="search" placeholder="编号 / 中文名 / English" autocomplete="off">
    <label for="next-pokemon-filter" class="next-filter-label">版本 <select id="next-pokemon-filter"><option value="all">全部</option><option value="normal">普通</option><option value="shiny">闪光</option></select></label>
    <div class="next-pokemon-status" role="status" aria-live="polite"></div>
    <div class="next-pokemon-list"></div><button type="button" data-clear>取消指定 · 恢复随机</button>`;
  document.body.append(panel);
  const search = panel.querySelector('input');
  const filter = panel.querySelector('select');
  const list = panel.querySelector('.next-pokemon-list');
  const status = panel.querySelector('[role="status"]');
  const ordered = [...manifest].sort((a,b) => a.dex-b.dex || Number(a.shiny)-Number(b.shiny));
  const label = e => `#${String(e.dex).padStart(3,'0')} ${e.name}${e.shiny ? ' · 闪光' : ''}`;
  let previousFocus, lastUsed;
  function refresh() {
    const chosen = getNextPokemon();
    status.textContent = chosen ? `下一次：${label(chosen)}` : lastUsed ? `本轮已锁定：${label(lastUsed)}。后续恢复随机。` : '下一次：随机抽取';
    panel.querySelector('[data-clear]').disabled = !chosen;
    const query = search.value.trim().toLocaleLowerCase().replace(/^#/, '');
    const filtered = ordered.filter(e => {
      const numeric = /^\d+$/.test(query);
      const match = !query || (numeric ? e.dex===Number(query) : `${e.name} ${e.english} ${e.id}`.toLocaleLowerCase().includes(query));
      return match && (filter.value==='all' || (filter.value==='shiny') === Boolean(e.shiny));
    });
    list.replaceChildren();
    for (const entry of filtered) {
      const button = document.createElement('button'); button.type='button';
      button.className='next-pokemon-choice'; button.dataset.pokemonId=entry.id;
      button.setAttribute('aria-pressed',String(chosen?.id===entry.id));
      const name=document.createElement('strong'); name.textContent=label(entry);
      const english=document.createElement('small'); english.textContent=entry.english;
      button.append(name,english);
      if(entry.shiny)button.classList.add('is-shiny');
      button.addEventListener('click',()=>{lastUsed=null;selectNextPokemon(entry.id);});
      list.append(button);
    }
    if(!filtered.length){const empty=document.createElement('p');empty.textContent='没有找到匹配的宝可梦';list.append(empty);}
  }
  function show(visible, restore=true) {
    if(visible){previousFocus=document.activeElement;window.dispatchEvent(new CustomEvent('capsule-panel-open',{detail:'next-pokemon'}));}
    panel.hidden=!visible;
    if(visible){refresh();search.focus();}
    else if(restore && previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  }
  window.addEventListener('keydown',event=>{
    if(event.key==='F12'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)show(panel.hidden);}
    else if(event.key==='Escape' && !panel.hidden){event.preventDefault();event.stopImmediatePropagation();show(false);}
  },true);
  window.addEventListener('capsule-panel-open',event=>{if(event.detail!=='next-pokemon' && !panel.hidden)show(false,false);});
  window.addEventListener('next-pokemon-change',event=>{if(event.detail.used)lastUsed=event.detail.used;refresh();});
  for(const name of ['keydown','keyup','pointerdown','pointerup','click','wheel'])panel.addEventListener(name,event=>event.stopPropagation());
  panel.querySelector('[data-close]').addEventListener('click',()=>show(false));
  panel.querySelector('[data-clear]').addEventListener('click',()=>{lastUsed=null;selectNextPokemon(null);});
  search.addEventListener('input',refresh);filter.addEventListener('change',refresh);refresh();
}
