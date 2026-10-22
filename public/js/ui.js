// DOM UI: screens, lobby, room browser, HUD, results, toasts.

import { CHARACTERS, CHAR_ORDER, STAGES, STAGE_ORDER, PLAYER_COLORS } from '../../shared/constants.js';

const $ = (id) => document.getElementById(id);

const CHAR_GLYPH = { blaze: '🔥', volt: '⚡', titan: '🛡️', rift: '🌀' };

export class UI {
  constructor() {
    this.screens = {};
    for (const el of document.querySelectorAll('.screen')) {
      this.screens[el.id.replace('screen-', '')] = el;
    }
    this.current = 'title';
    this.hud = $('hud');
  }

  show(name) {
    for (const key of Object.keys(this.screens)) {
      this.screens[key].classList.toggle('active', key === name);
    }
    this.current = name;
    const inGame = name === 'game';
    this.hud.classList.toggle('active', inGame);
  }

  toast(msg, type = 'info', ttl = 3600) {
    const wrap = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'bad' : type === 'good' ? 'good' : ''}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .4s';
      setTimeout(() => el.remove(), 420);
    }, ttl);
  }

  setNetStatus(state) {
    const el = $('net-status');
    if (!el) return;
    if (state === 'ok') {
      el.textContent = '● connected';
      el.className = 'net-status ok';
    } else if (state === 'bad') {
      el.textContent = '● disconnected';
      el.className = 'net-status bad';
    } else {
      el.textContent = '● connecting…';
      el.className = 'net-status';
    }
  }

  // ---------------------------------------------------------------- host screen
  buildStageSelect(containerId, selected, onPick) {
    const wrap = $(containerId);
    wrap.innerHTML = '';
    for (const id of STAGE_ORDER) {
      const st = STAGES[id];
      const card = document.createElement('div');
      card.className = 'stage-card' + (id === selected ? ' selected' : '');
      card.innerHTML = `
        <div class="stage-thumb" style="${stageThumbCss(id)}">${stagePlatformsHtml(id)}</div>
        <div class="stage-info">
          <div class="stage-name">${st.name.toUpperCase()}</div>
          <div class="stage-desc">${st.desc}</div>
        </div>`;
      card.addEventListener('click', () => onPick(id));
      wrap.appendChild(card);
    }
  }

  // ---------------------------------------------------------------- join screen
  renderRoomList(rooms, onJoin) {
    const wrap = $('room-list');
    wrap.innerHTML = '';
    const status = $('join-status');
    if (!rooms.length) {
      wrap.innerHTML = `<div class="room-empty">No open arenas right now.<br/>Host one, or try Quick Play!</div>`;
      status.textContent = 'No arenas found';
      return;
    }
    status.textContent = `${rooms.length} arena${rooms.length === 1 ? '' : 's'} online`;
    for (const r of rooms) {
      const el = document.createElement('div');
      el.className = 'room-item';
      const stage = STAGES[r.stage] ? STAGES[r.stage].name : r.stage;
      el.innerHTML = `
        <div>
          <div class="r-name">${escapeHtml(r.name)}</div>
          <div class="r-meta">HOST ${escapeHtml(r.host)} · ${r.players}/${r.max} PLAYERS${r.bots ? ` · ${r.bots} CPU` : ''} · ${stage.toUpperCase()} · ${r.stocks} STOCKS · ${r.state === 'playing' ? 'IN GAME' : 'OPEN'}</div>
        </div>
        <div class="r-code">${r.id}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = r.state === 'playing' ? 'SPECTATE?' : 'JOIN';
      btn.addEventListener('click', () => onJoin(r));
      el.appendChild(btn);
      wrap.appendChild(el);
    }
  }

  // ---------------------------------------------------------------- lobby
  renderLobby(room, meId, handlers) {
    $('lobby-name').textContent = room.name.toUpperCase();
    const codeEl = $('lobby-code');
    codeEl.textContent = room.id;
    codeEl.onclick = () => {
      navigator.clipboard?.writeText(room.id).then(
        () => this.toast(`Room code ${room.id} copied — share it with friends!`, 'good'),
        () => this.toast(`Room code: ${room.id}`)
      );
    };
    $('lobby-state').textContent =
      room.state === 'playing' ? 'match in progress' :
      room.state === 'results' ? 'match finished' : 'waiting in the lobby';

    // slots
    const slots = $('slot-list');
    slots.innerHTML = '';
    for (const p of room.players) {
      const ch = CHARACTERS[p.charId] || CHARACTERS.blaze;
      const el = document.createElement('div');
      el.className = 'slot';
      const badge = p.isHost
        ? '<span class="slot-badge host">HOST</span>'
        : p.ready
          ? '<span class="slot-badge">READY</span>'
          : '<span class="slot-badge no">NOT READY</span>';
      el.innerHTML = `
        <div class="slot-avatar" style="background:linear-gradient(160deg, ${ch.color}, ${ch.color2})">${CHAR_GLYPH[ch.id] || '✦'}</div>
        <div>
          <div class="slot-name">${escapeHtml(p.name)}${p.id === meId ? ' (you)' : ''}</div>
          <div class="slot-sub">${ch.name.toUpperCase()}${p.isBot ? ' · CPU' : ''}</div>
        </div>
        ${badge}`;
      if (p.isBot && room.players.find((x) => x.id === meId && x.isHost === true) && room.state === 'lobby') {
        const kick = document.createElement('button');
        kick.className = 'slot-kick';
        kick.title = 'Remove CPU';
        kick.textContent = '✕';
        kick.addEventListener('click', () => handlers.onKick(p.id));
        el.appendChild(kick);
      }
      slots.appendChild(el);
    }
    // empty slots
    for (let i = room.players.length; i < room.settings.maxPlayers; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.style.opacity = '0.45';
      el.innerHTML = `
        <div class="slot-avatar" style="background:rgba(255,255,255,0.06)">＋</div>
        <div><div class="slot-name">OPEN SLOT</div><div class="slot-sub">waiting for fighter…</div></div>`;
      slots.appendChild(el);
    }

    const me = room.players.find((p) => p.id === meId);
    const isHost = me && me.isHost;

    // character select
    this.renderCharSelect(me ? me.charId : 'blaze', (id) => handlers.onChar(id), (id) => this.renderCharDetail(id, me ? me.charId : 'blaze'));

    // rules
    const rules = $('lobby-rules');
    const st = STAGES[room.settings.stage] || STAGES.battlefield;
    rules.innerHTML = `
      <div class="rules-line"><span>STAGE</span><b>${st.name.toUpperCase()}</b></div>
      <div class="rules-line"><span>STOCKS</span><b>${room.settings.stocks}</b></div>
      <div class="rules-line"><span>TIME LIMIT</span><b>${room.settings.timeMinutes} MIN</b></div>
      <div class="rules-line"><span>MAX PLAYERS</span><b>${room.settings.maxPlayers}</b></div>
      <div class="rules-line"><span>MODE</span><b>FREE-FOR-ALL</b></div>`;

    if (isHost && room.state === 'lobby') {
      rules.innerHTML += `
        <div class="rules-line" style="margin-top:6px"><span>CHANGE STAGE</span></div>
        <div class="stage-select" id="lobby-stage-pick" style="grid-template-columns:1fr 1fr 1fr"></div>`;
      this.buildStageSelect('lobby-stage-pick', room.settings.stage, (id) => handlers.onSettings({ stage: id }));
    }

    // buttons
    const readyBtn = $('btn-ready');
    const startBtn = $('btn-start-game');
    const addBotBtn = $('btn-add-bot');
    readyBtn.textContent = me && me.ready ? 'UNREADY' : 'READY UP';
    readyBtn.style.display = room.state === 'lobby' && !isHost ? '' : (room.state === 'lobby' && isHost ? '' : 'none');
    startBtn.style.display = isHost ? '' : 'none';
    startBtn.disabled = room.state !== 'lobby';
    startBtn.textContent = room.state === 'lobby' ? 'START GAME' : 'IN GAME…';
    addBotBtn.style.display = isHost && room.state === 'lobby' ? '' : 'none';

    const allReady = room.players.filter((p) => !p.isBot).every((p) => p.ready || p.isHost);
    $('ready-hint').textContent = isHost
      ? (allReady ? 'All fighters ready — start the match!' : 'You can force-start anytime, or wait for ready-ups.')
      : (me && me.ready ? 'Waiting for the host to start…' : 'Ready up to signal you\'re set to fight.');
  }

  renderCharSelect(selected, onSelect, onHover) {
    const wrap = $('char-select');
    if (wrap.dataset.built !== '1') {
      wrap.innerHTML = '';
      for (const id of CHAR_ORDER) {
        const ch = CHARACTERS[id];
        const card = document.createElement('div');
        card.className = 'char-card';
        card.dataset.char = id;
        card.innerHTML = `
          <div class="char-face" style="background:linear-gradient(160deg, ${ch.color}, ${ch.color2})">${CHAR_GLYPH[id]}</div>
          <div>
            <div class="char-name">${ch.name.toUpperCase()}</div>
            <div class="char-title">${ch.title.toUpperCase()}</div>
          </div>`;
        card.addEventListener('click', () => onSelect(id));
        card.addEventListener('mouseenter', () => onHover && onHover(id));
        wrap.appendChild(card);
      }
      wrap.dataset.built = '1';
    }
    for (const card of wrap.children) {
      card.classList.toggle('selected', card.dataset.char === selected);
    }
    this.renderCharDetail(selected, selected);
  }

  renderCharDetail(id) {
    const ch = CHARACTERS[id] || CHARACTERS.blaze;
    const bars = (n) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    $('char-detail').innerHTML = `
      <div style="color:var(--text);font-weight:800;letter-spacing:.1em;margin-bottom:6px">${ch.name.toUpperCase()} — ${ch.title}</div>
      ${ch.desc}
      <div class="stat-row"><span class="stat-label">POWER</span><span class="stat-bars">${bars(ch.stats.power)}</span></div>
      <div class="stat-row"><span class="stat-label">SPEED</span><span class="stat-bars">${bars(ch.stats.speed)}</span></div>
      <div class="stat-row"><span class="stat-label">WEIGHT</span><span class="stat-bars">${bars(ch.stats.weight)}</span></div>
      <div class="stat-row"><span class="stat-label">RECOVERY</span><span class="stat-bars">${bars(ch.stats.recovery)}</span></div>`;
  }

  appendChat(from, text, cls) {
    const log = $('chat-log');
    const el = document.createElement('div');
    if (cls) {
      el.className = cls;
      el.textContent = text;
    } else {
      el.innerHTML = `<b>${escapeHtml(from)}:</b> ${escapeHtml(text)}`;
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 60) log.removeChild(log.firstChild);
  }

  clearChat() {
    $('chat-log').innerHTML = '';
  }

  // ---------------------------------------------------------------- HUD
  buildHudPanels(fighters) {
    const wrap = $('hud-players');
    wrap.innerHTML = '';
    for (const f of fighters) {
      const ch = CHARACTERS[f.c] || CHARACTERS.blaze;
      const el = document.createElement('div');
      el.className = 'hud-p';
      el.dataset.id = f.id;
      el.innerHTML = `
        <div class="hud-p-top">
          <div class="hud-p-dot" style="background:${PLAYER_COLORS[f.ci % 4]}"></div>
          <div class="hud-p-name">${escapeHtml(f.n)}</div>
          <div class="hud-p-stocks"></div>
        </div>
        <div class="hud-p-pct">0<span>%</span></div>
        <div class="hud-p-bar"><i style="width:0%"></i></div>`;
      wrap.appendChild(el);
    }
  }

  updateHud(fighters, timeLeftFrames, stageName) {
    for (const f of fighters) {
      const el = $(`hud-players`).querySelector(`[data-id="${f.id}"]`);
      if (!el) continue;
      el.classList.toggle('out', !!f.el);
      const pctEl = el.querySelector('.hud-p-pct');
      const pct = Math.round(f.p);
      pctEl.innerHTML = `${pct}<span>%</span>`;
      const color = pctColor(pct);
      pctEl.style.color = color;
      const bar = el.querySelector('.hud-p-bar i');
      bar.style.width = Math.min(100, pct / 1.4) + '%';
      bar.style.background = color;
      const stocksEl = el.querySelector('.hud-p-stocks');
      stocksEl.textContent = f.el ? 'OUT' : '●'.repeat(Math.max(0, Math.min(9, f.s)));
      stocksEl.style.color = f.el ? 'var(--danger)' : '';
    }
    const secs = Math.max(0, Math.ceil(timeLeftFrames / 60));
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    $('hud-timer').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    $('hud-stage').textContent = stageName.toUpperCase();
  }

  setCountdown(text) {
    const el = $('hud-countdown');
    if (!text) {
      el.classList.remove('show');
      return;
    }
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.remove('show');
      void el.offsetWidth; // restart animation
      el.classList.add('show');
    }
  }

  banner(text, ttl = 1400) {
    const el = $('hud-banner');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => el.classList.remove('show'), ttl);
  }

  // ---------------------------------------------------------------- results
  renderResults(ranked, meId, handlers, isHost) {
    const list = $('results-list');
    list.innerHTML = '';
    const meRow = ranked.find((r) => r.id === meId);
    $('results-title').textContent = meRow && meRow.winner ? 'VICTORY!' : 'GAME!';
    ranked.forEach((r, i) => {
      const ch = CHARACTERS[r.charId] || CHARACTERS.blaze;
      const el = document.createElement('div');
      el.className = 'result-row' + (r.winner ? ' winner' : '');
      el.innerHTML = `
        <div class="result-rank">${r.winner ? '👑' : '#' + (i + 1)}</div>
        <div class="slot-avatar" style="background:linear-gradient(160deg, ${ch.color}, ${ch.color2})">${CHAR_GLYPH[ch.id] || '✦'}</div>
        <div>
          <div class="result-name">${escapeHtml(r.name)}${r.id === meId ? ' (you)' : ''}${r.isBot ? ' 🤖' : ''}</div>
          <div class="result-sub">${ch.name.toUpperCase()} · ${r.stocks} STOCK${r.stocks === 1 ? '' : 'S'} LEFT</div>
        </div>
        <div class="result-stats">
          <div class="result-stat"><b>${r.stats?.kos ?? 0}</b><span>KOs</span></div>
          <div class="result-stat"><b>${r.stats?.falls ?? 0}</b><span>FALLS</span></div>
          <div class="result-stat"><b>${Math.round(r.stats?.dmgDealt ?? 0)}%</b><span>DAMAGE</span></div>
          <div class="result-stat"><b>${Math.round(r.percent)}%</b><span>TAKEN</span></div>
        </div>`;
      list.appendChild(el);
    });
    const rematchBtn = $('btn-rematch');
    rematchBtn.style.display = isHost ? '' : 'none';
    rematchBtn.textContent = 'REMATCH';
    rematchBtn.disabled = false;
    $('btn-results-leave').textContent = 'LEAVE ARENA';
    void handlers;
  }
}

function pctColor(pct) {
  if (pct < 50) return '#eef1ff';
  if (pct < 90) return '#ffd166';
  if (pct < 130) return '#ff9a5c';
  return '#ff4d6d';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function stageThumbCss(id) {
  const grads = {
    battlefield: 'linear-gradient(180deg,#2c2470,#7c3d64)',
    final: 'linear-gradient(180deg,#0e1230,#3b1d4f)',
    skyroost: 'linear-gradient(180deg,#1c2a6b,#e0836c)',
  };
  return `background:${grads[id] || grads.battlefield}`;
}

function stagePlatformsHtml(id) {
  const shapes = {
    battlefield: '<i style="left:12%;top:70%;width:76%;height:10px"></i><i style="left:22%;top:42%;width:22%;height:7px"></i><i style="left:56%;top:42%;width:22%;height:7px"></i><i style="left:39%;top:24%;width:22%;height:7px"></i>',
    final: '<i style="left:8%;top:68%;width:84%;height:11px"></i>',
    skyroost: '<i style="left:20%;top:78%;width:60%;height:10px"></i><i style="left:6%;top:38%;width:22%;height:7px"></i><i style="left:72%;top:38%;width:22%;height:7px"></i><i style="left:39%;top:56%;width:22%;height:7px"></i>',
  };
  return shapes[id] || shapes.battlefield;
}
