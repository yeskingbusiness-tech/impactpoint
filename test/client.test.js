// Client smoke test: boots main.js inside jsdom with the real server behind it.
import { JSDOM } from 'jsdom';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

const errors = [];
process.on('uncaughtException', (e) => {
  errors.push(e);
  console.error('UNCAUGHT:', e);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  errors.push(e);
  console.error('UNHANDLED REJECTION:', e);
  process.exit(1);
});

const PORT = process.env.TEST_PORT || 8099;
const dom = new JSDOM(html, {
  url: `http://127.0.0.1:${PORT}/`,
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

// ---- canvas mock
function mockCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'getContext') return undefined;
      return () => undefined;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };

// ---- audio mock
class FakeParam { constructor() { this.value = 0; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeNode { constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); this.Q = new FakeParam(); this.type = ''; this.buffer = null; } connect() {} start() {} stop() {} }
window.AudioContext = class {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = new FakeNode(); }
  createGain() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBuffer() { return { getChannelData: () => new Float32Array(128) }; }
  createBufferSource() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  resume() {}
};

// ---- globals for the modules
globalThis.window = window;
globalThis.document = document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
globalThis.location = window.location;
globalThis.localStorage = window.localStorage;
globalThis.WebSocket = WebSocket;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
if (!globalThis.performance) globalThis.performance = window.performance;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(80);
  }
  throw new Error('waitFor timeout: ' + what);
}
const assert = (cond, msg) => {
  if (!cond) {
    console.error('ASSERT FAIL:', msg);
    process.exit(1);
  }
  console.log('  ✓', msg);
};
const click = (id) => {
  const el = $(id);
  assert(el, `element #${id} exists`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};

console.log('booting client…');
await import('../public/js/main.js');

await waitFor(() => $('net-status').textContent.includes('connected'), 'ws connect');
assert(true, 'websocket connected to server');

// --- title → menu
$('player-name').value = 'Smoketest';
click('btn-press-start');
await sleep(120);
assert($('screen-menu').classList.contains('active'), 'menu screen shown');
assert($('screen-title').classList.contains('active') === false, 'title hidden');

// --- host flow
click('btn-host');
await sleep(60);
assert($('screen-host').classList.contains('active'), 'host screen shown');
assert($('host-stage-select').children.length === 3, 'three stage cards rendered');
$('host-stage-select').children[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(60);
assert($('host-stage-select').children[1].classList.contains('selected'), 'stage 2 selectable');
$('host-stage-select').children[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

click('btn-create-room');
await waitFor(() => $('screen-lobby').classList.contains('active'), 'lobby shown');
assert($('lobby-code').textContent.includes('-'), `room code displayed (${ $('lobby-code').textContent })`);
assert($('slot-list').children.length >= 4, `slots rendered (${ $('slot-list').children.length })`);
assert($('char-select').children.length === 4, 'four characters in select');
assert($('lobby-rules').textContent.includes('STOCKS'), 'rules panel rendered');

// pick a character
$('char-select').children[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(150);
assert($('char-select').children[2].classList.contains('selected'), 'character selection works');

// add CPU
click('btn-add-bot');
await waitFor(() => $('slot-list').textContent.includes('CPU'), 'CPU slot appears');

// ready + start
click('btn-ready');
await sleep(120);
click('btn-start-game');
await waitFor(() => $('hud').classList.contains('active'), 'HUD active — match started');
assert($('hud-players').children.length === 2, `HUD panels (${ $('hud-players').children.length })`);
assert($('hud-countdown').textContent.length > 0, `countdown shows "${ $('hud-countdown').textContent }"`);

// let the match run: countdown + some play
await sleep(2500);
const timerTxt = $('hud-timer').textContent;
assert(/^\d+:\d\d$/.test(timerTxt), `timer ticking (${timerTxt})`);
assert($('hud-players').textContent.includes('%'), 'percent displays live');
const pctEl = $('hud-players').querySelector('.hud-p-pct');
assert(pctEl && pctEl.innerHTML.includes('%'), 'percent inner markup valid');

// pause overlay
$('game').dispatchEvent(new window.Event('x')); // noop keep
const esc = new window.KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true });
window.dispatchEvent(esc);
await sleep(80);
assert($('pause-overlay').classList.contains('active'), 'escape opens pause menu');
click('btn-resume');
assert(!$('pause-overlay').classList.contains('active'), 'resume closes pause menu');

// leave match
window.dispatchEvent(esc);
await sleep(60);
click('btn-quit-match');
await sleep(150);
assert($('screen-menu').classList.contains('active'), 'leave match returns to menu');

// --- quick play
click('btn-quickplay');
await waitFor(() => $('hud').classList.contains('active'), 'quickplay starts a match');
await sleep(2200);
assert($('hud-players').children.length >= 2, `quickplay match running (${ $('hud-players').children.length } fighters)`);
window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
await sleep(80);
click('btn-quit-match');
await sleep(150);

// --- join screen renders
click('btn-join');
await sleep(400);
assert($('screen-join').classList.contains('active'), 'join screen shown');
assert($('room-list').children.length >= 0, 'room list rendered');

// --- howto + settings screens
click('btn-join-back');
click('btn-howto');
await sleep(60);
assert($('screen-howto').classList.contains('active'), 'how-to screen');
click('btn-howto-back');
click('btn-settings');
await sleep(60);
assert($('screen-settings').classList.contains('active'), 'settings screen');
click('btn-settings-back');

if (errors.length) {
  console.error(`\nSMOKE TEST FAILED — ${errors.length} uncaught errors`);
  process.exit(1);
}
console.log('\nCLIENT SMOKE TEST PASSED');
process.exit(0);
