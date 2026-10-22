// ImpactPoint Arena — client bootstrap, net glue, game loop, snapshot interpolation.

import { Net } from './net.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { CHARACTERS, STAGES, STAGE_ORDER, RULE_DEFAULTS, CHAR_ORDER } from '../../shared/constants.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

const net = new Net();
const input = new Input();
const ui = new UI();
const renderer = new Renderer($('game'));

const state = {
  inMatch: false,
  roomId: null,
  meId: null,
  isHost: false,
  paused: false,
  returnScreen: 'menu',
  hostDraft: { stage: 'battlefield', stocks: 3, timeMinutes: 8, maxPlayers: 4 },
  myChar: localStorage.getItem('ip_char') || 'blaze',
  lastSentInput: '',
  lastSendAt: 0,
  lastCountdownLabel: null,
};

let snaps = [];
const animPhase = new Map();

// ---------------------------------------------------------------- settings
function loadSettings() {
  const s = JSON.parse(localStorage.getItem('ip_settings') || '{}');
  if (s.master != null) {
    $('vol-master').value = s.master;
    $('vol-sfx').value = s.sfx ?? 80;
    $('vol-mus').value = s.mus ?? 35;
    $('opt-shake').checked = s.shake !== false;
    $('opt-names').checked = s.names !== false;
  }
  applySettings();
}
function applySettings() {
  const master = +$('vol-master').value / 100;
  const sfx = +$('vol-sfx').value / 100;
  const mus = +$('vol-mus').value / 100;
  audio.setMaster(master);
  audio.setSfx(sfx);
  audio.setMusic(mus);
  renderer.shakeEnabled = $('opt-shake').checked;
  renderer.showNames = $('opt-names').checked;
  $('vol-val').textContent = Math.round(master * 100) + '%';
  $('sfx-val').textContent = Math.round(sfx * 100) + '%';
  $('mus-val').textContent = Math.round(mus * 100) + '%';
  localStorage.setItem('ip_settings', JSON.stringify({
    master: +$('vol-master').value, sfx: +$('vol-sfx').value, mus: +$('vol-mus').value,
    shake: $('opt-shake').checked, names: $('opt-names').checked,
  }));
}
for (const id of ['vol-master', 'vol-sfx', 'vol-mus', 'opt-shake', 'opt-names']) {
  $(id).addEventListener('input', applySettings);
  $(id).addEventListener('change', applySettings);
}

// ---------------------------------------------------------------- toasts / screens
function showScreen(name) {
  ui.show(name);
  if (name !== 'game') state.paused = false;
  $('pause-overlay').classList.remove('active');
}

// ---------------------------------------------------------------- lobby render
function renderLobbyScreen(room) {
  state.isHost = room.players.some((p) => p.id === state.meId && p.isHost);
  state.roomId = room.id;
  lobbyStage = room.settings.stage;
  ui.renderLobby(room, state.meId, {
    onChar: (id) => {
      state.myChar = id;
      localStorage.setItem('ip_char', id);
      // char-only update; server keeps current ready flag
      net.send({ t: 'ready', charId: id });
    },
    onReady: () => {
      const me = room.players.find((p) => p.id === state.meId);
      net.send({ t: 'ready', ready: !(me && me.ready), charId: state.myChar });
      audio.menu();
    },
    onAddBot: () => { net.send({ t: 'addbot' }); audio.menu(); },
    onKick: (id) => { net.send({ t: 'kick', id }); audio.back(); },
    onStart: () => { net.send({ t: 'start' }); audio.confirm(); },
    onSettings: (s) => { net.send({ t: 'settings', settings: s }); audio.menu(); },
    onLeave: () => leaveToMenu(),
  });
}

function leaveToMenu() {
  net.send({ t: 'leave' });
  state.inMatch = false;
  state.roomId = null;
  snaps = [];
  showScreen('menu');
  audio.back();
}

// ---------------------------------------------------------------- net handlers
net.on('open', () => {
  ui.setNetStatus('ok');
  $('conn-lost').classList.remove('active');
});
net.on('close', () => {
  ui.setNetStatus('bad');
  if (state.inMatch) $('conn-lost').classList.add('active');
});
net.on('welcome', (m) => {
  state.meId = m.id;
  ui.setNetStatus('ok');
});
net.on('rooms', (m) => {
  if (ui.current === 'join') {
    ui.renderRoomList(m.rooms || [], (r) => {
      audio.confirm();
      net.send({ t: 'join', roomId: r.id, charId: state.myChar });
    });
  }
});
net.on('lobby', (m) => {
  const room = m.room;
  state.roomId = room.id;
  state.inMatch = room.state === 'playing';
  if (ui.current !== 'game' && ui.current !== 'results') {
    showScreen('lobby');
    renderLobbyScreen(room);
  } else if (ui.current === 'results' && room.state === 'lobby') {
    showScreen('lobby');
    renderLobbyScreen(room);
  } else if (ui.current === 'lobby') {
    renderLobbyScreen(room);
  }
});
net.on('start', (m) => {
  state.inMatch = true;
  snaps = [];
  animPhase.clear();
  state.lastCountdownLabel = null;
  lobbyStage = m.config.stage;
  ui.buildHudPanels(m.players.map((p) => ({
    id: p.id, n: p.name, c: p.charId, ci: p.colorIdx,
  })));
  $('hud-stage').textContent = (STAGES[m.config.stage] || STAGES.battlefield).name;
  $('hud-timer').textContent = `${m.config.timeMinutes}:00`;
  showScreen('game');
  ui.setCountdown('READY?');
  audio.confirm();
});
net.on('snap', (m) => {
  snaps.push({ s: m, at: performance.now() });
  if (snaps.length > 24) snaps.shift();
  for (const ev of m.ev || []) handleEvent(ev);
  // countdown audio
  if (m.cd > 0) {
    const label = countdownLabel(m.cd);
    if (label !== state.lastCountdownLabel) {
      state.lastCountdownLabel = label;
      if (label === 'GO!') { audio.confirm(); ui.banner('GO!', 900); }
      else audio.countdown(true);
      ui.setCountdown(label);
    }
  } else if (state.lastCountdownLabel !== null) {
    ui.setCountdown(null);
    state.lastCountdownLabel = null;
  }
  if (!m.done) {
    ui.updateHud(m.fighters, m.tl, (STAGES[lobbyStage] || STAGES.battlefield).name);
  }
});
net.on('results', (m) => {
  state.inMatch = false;
  const isHost = state.isHost;
  ui.renderResults(m.ranked || [], state.meId, {}, isHost);
  showScreen('results');
  audio.gameover();
  if (!isHost) ui.toast('Waiting for the host — rematch or leave the arena.', 'info', 6000);
});
net.on('chat', (m) => {
  ui.appendChat(m.from, m.text);
});
net.on('info', (m) => ui.toast(m.msg, 'good'));
net.on('error', (m) => ui.toast(m.msg, 'error'));
net.on('pong', () => {});
net.on('roomclosed', () => {
  ui.toast('Arena closed.', 'error');
  leaveToMenu();
});

let lobbyStage = RULE_DEFAULTS.stage;

function countdownLabel(cd) {
  if (cd > 180) return '3';
  if (cd > 120) return '2';
  if (cd > 60) return '1';
  return 'GO!';
}

// ---------------------------------------------------------------- events → fx/sfx
function handleEvent(ev) {
  renderer.handleEvent(ev);
  switch (ev.t) {
    case 'jump': ev.d ? audio.doubleJump() : audio.jump(); break;
    case 'land': audio.land(ev.hard); break;
    case 'hit': audio.hit(ev.heavy); break;
    case 'block': audio.block(); break;
    case 'shieldbreak': audio.shieldBreak(); break;
    case 'dodge': audio.dodge(); break;
    case 'ko': audio.ko(); break;
    case 'respawn': audio.spawn(); break;
    case 'swing': if (ev.heavy) audio.smashSwing(); break;
    case 'proj': audio.proj(); break;
    case 'projdie': audio.projDie(); break;
    case 'go': audio.confirm(); break;
    default: break;
  }
}

// ---------------------------------------------------------------- snapshot blend
function buildDrawState() {
  const now = performance.now();
  const target = now - 95;
  let a = null, b = null;
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i].at <= target) {
      a = snaps[i];
      b = snaps[Math.min(i + 1, snaps.length - 1)];
      break;
    }
  }
  if (!a) {
    if (!snaps.length) return null;
    a = snaps[0];
    b = snaps[0];
  }
  const span = Math.max(1, b.at - a.at);
  const t = a === b ? 1 : clamp((target - a.at) / span, 0, 1);

  const fighters = [];
  const byIdB = new Map(b.s.fighters.map((f) => [f.id, f]));
  for (const fa of a.s.fighters) {
    const fb = byIdB.get(fa.id) || fa;
    const draw = {
      id: fa.id,
      n: fa.n,
      c: fa.c,
      ci: fa.ci,
      x: lerp(fa.x, fb.x, t),
      y: lerp(fa.y, fb.y, t),
      vx: lerp(fa.vx, fb.vx, t),
      vy: lerp(fa.vy, fb.vy, t),
      fa: fb.fa,
      st: fb.hl ? fa.st : fb.st,
      sh: fb.sh,
      iv: fb.iv,
      hs: fb.hs,
      el: fb.el,
      rs: fb.rs,
      am: fb.am,
      af: fb.af,
      g: fb.g,
      hl: fb.hl,
    };
    // running animation phase
    const prev = animPhase.get(fa.id) || 0;
    const runAmt = draw.st === 'run' ? Math.abs(draw.vx) * 0.085 : 0;
    animPhase.set(fa.id, prev + runAmt);
    draw.animPhase = animPhase.get(fa.id);
    fighters.push(draw);
  }

  const projectiles = b.s.proj.map((p) => {
    const pa = a.s.proj.find((q) => q.id === p.id) || p;
    return {
      id: p.id, st: p.st,
      x: lerp(pa.x, p.x, t), y: lerp(pa.y, p.y, t),
      vx: p.vx, vy: p.vy, r: p.r,
    };
  });

  return {
    fighters,
    projectiles,
    stage: lobbyStage,
    cd: b.s.cd,
    done: b.s.done,
  };
}

// ---------------------------------------------------------------- main loop
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (state.inMatch && snaps.length) {
    const ds = buildDrawState();
    if (ds) renderer.drawGame(ds, dt);
    else renderer.drawMenu(dt);
  } else {
    renderer.drawMenu(dt);
  }

  // send input
  if (state.inMatch && net.connected) {
    const raw = input.sample();
    const key = JSON.stringify(raw);
    const nowMs = performance.now();
    if (key !== state.lastSentInput || nowMs - state.lastSendAt > 60) {
      net.send({ t: 'input', input: raw });
      state.lastSentInput = key;
      state.lastSendAt = nowMs;
    }
  }

  // pause toggle
  if (state.inMatch && input.consumePause()) {
    state.paused = !state.paused;
    $('pause-overlay').classList.toggle('active', state.paused);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- button wiring
function bind(id, fn) {
  const el = $(id);
  if (el) el.addEventListener('click', () => { audio.init(); fn(); });
}

// title
$('player-name').value = localStorage.getItem('ip_name') || '';
bind('btn-press-start', () => {
  const name = ($('player-name').value || 'Player').trim().slice(0, 16) || 'Player';
  localStorage.setItem('ip_name', name);
  net.setName(name);
  audio.init();
  audio.confirm();
  showScreen('menu');
});
$('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-press-start').click();
});

// menu
bind('btn-quickplay', () => {
  audio.confirm();
  net.send({ t: 'quickplay', charId: state.myChar });
  ui.toast('Finding a match…', 'info', 2500);
});
function refreshHostStageSelect() {
  ui.buildStageSelect('host-stage-select', state.hostDraft.stage, (id) => {
    state.hostDraft.stage = id;
    audio.menu();
    refreshHostStageSelect();
  });
}
bind('btn-host', () => {
  audio.menu();
  showScreen('host');
  refreshHostStageSelect();
});
bind('btn-join', () => {
  audio.menu();
  showScreen('join');
  net.send({ t: 'browse' });
  ui.renderRoomList([], () => {});
});
bind('btn-howto', () => {
  audio.menu();
  state.returnScreen = ui.current;
  showScreen('howto');
});
bind('btn-settings', () => {
  audio.menu();
  state.returnScreen = ui.current;
  showScreen('settings');
});
bind('btn-change-name', () => {
  audio.back();
  showScreen('title');
  $('player-name').focus();
});

// host screen
$('host-stocks').addEventListener('input', () => {
  state.hostDraft.stocks = +$('host-stocks').value;
  $('host-stocks-val').textContent = state.hostDraft.stocks;
});
$('host-time').addEventListener('input', () => {
  state.hostDraft.timeMinutes = +$('host-time').value;
  $('host-time-val').textContent = state.hostDraft.timeMinutes + ' min';
});
$('host-max').addEventListener('input', () => {
  state.hostDraft.maxPlayers = +$('host-max').value;
  $('host-max-val').textContent = state.hostDraft.maxPlayers;
});
bind('btn-host-back', () => { audio.back(); showScreen('menu'); });
bind('btn-create-room', () => {
  audio.confirm();
  const name = $('room-name').value.trim() || undefined;
  net.send({
    t: 'host',
    name,
    charId: state.myChar,
    stage: state.hostDraft.stage,
    stocks: state.hostDraft.stocks,
    timeMinutes: state.hostDraft.timeMinutes,
    maxPlayers: state.hostDraft.maxPlayers,
  });
  lobbyStage = state.hostDraft.stage;
});

// join screen
bind('btn-join-back', () => { audio.back(); showScreen('menu'); });
bind('btn-refresh-rooms', () => { audio.menu(); net.send({ t: 'browse' }); });
bind('btn-quickplay-2', () => {
  audio.confirm();
  net.send({ t: 'quickplay', charId: state.myChar });
});
bind('btn-join-code', () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (!code) return;
  audio.confirm();
  net.send({ t: 'join', roomId: code, charId: state.myChar });
});
$('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-join-code').click();
});

// howto / settings
bind('btn-howto-back', () => { audio.back(); showScreen(state.returnScreen || 'menu'); });
bind('btn-settings-back', () => { audio.back(); showScreen(state.returnScreen || 'menu'); });

// lobby
bind('btn-leave-lobby', leaveToMenu);
bind('btn-ready', () => {
  // toggle based on current lobby render — query DOM label
  const ready = $('btn-ready').textContent === 'READY UP';
  net.send({ t: 'ready', ready, charId: state.myChar });
  audio.menu();
});
bind('btn-start-game', () => { net.send({ t: 'start' }); audio.confirm(); });
bind('btn-add-bot', () => { net.send({ t: 'addbot' }); audio.menu(); });
bind('btn-chat-send', sendChat);
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
function sendChat() {
  const el = $('chat-input');
  const text = el.value.trim();
  if (!text) return;
  net.send({ t: 'chat', text });
  el.value = '';
  el.focus();
}

// pause
bind('btn-resume', () => {
  state.paused = false;
  $('pause-overlay').classList.remove('active');
});
bind('btn-pause-howto', () => {
  state.returnScreen = 'game';
  showScreen('howto');
  state.inMatch = true; // keep match state while peeking at controls
  $('hud').classList.add('active');
});
bind('btn-quit-match', () => leaveToMenu());

// results
bind('btn-results-leave', () => {
  net.send({ t: 'leave' });
  state.inMatch = false;
  snaps = [];
  showScreen('menu');
  audio.back();
});
bind('btn-rematch', () => {
  net.send({ t: 'rematch' });
  audio.confirm();
  ui.toast('Rematch starting…', 'good', 2500);
});

// reconnect
bind('btn-reconnect', () => {
  $('conn-lost').classList.remove('active');
  net.connect();
});

// keep room list fresh while browsing
setInterval(() => {
  if (ui.current === 'join' && net.connected) net.send({ t: 'browse' });
}, 3500);

// boot
loadSettings();
net.name = localStorage.getItem('ip_name') || 'Player';
net.connect();
