// Integration test: websocket clients — host, join, lobby, start, play, leave, rematch, cleanup.
import WebSocket from 'ws';

const PORT = process.env.TEST_PORT || 8099;
const URL = `ws://127.0.0.1:${PORT}`;
const log = (who, ...a) => console.log(`[${who}]`, ...a);

function client(name) {
  const ws = new WebSocket(URL);
  const c = {
    name, ws, id: null,
    msgs: [],
    waiters: [],
    send: (m) => ws.send(JSON.stringify(m)),
    // register a waiter BEFORE triggering the event you expect
    next: (type, timeout = 5000) => new Promise((res, rej) => {
      const w = { type, res, rej };
      w.timer = setTimeout(() => rej(new Error(`${name}: timeout waiting for ${type}`)), timeout);
      c.waiters.push(w);
      return w;
    }),
  };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'welcome') c.id = m.id;
    const i = c.waiters.findIndex((w) => w.type === m.t);
    if (i !== -1) {
      const w = c.waiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.res(m);
    } else {
      c.msgs.push(m);
    }
  });
  return new Promise((res) => ws.on('open', () => res(c)));
}

const t0 = Date.now();
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

const A = await client('host');
const B = await client('guest');
const C = await client('guest2');

const welA = A.next('welcome');
const welB = B.next('welcome');
const welC = C.next('welcome');
A.send({ t: 'hello', name: 'Hosty' });
B.send({ t: 'hello', name: 'Guesty' });
C.send({ t: 'hello', name: 'Guest2' });
await welA;
await welB;
await welC;
log('sys', `connected as ${A.id}, ${B.id}, ${C.id}`);

const brA = A.next('rooms');
A.send({ t: 'browse' });
const rooms0 = await brA;
log('sys', `browse empty ok (${rooms0.rooms.length} rooms)`);

// --- host creates ---
const l1 = A.next('lobby');
A.send({ t: 'host', name: 'Test Arena', stage: 'battlefield', stocks: 1, timeMinutes: 1, maxPlayers: 4, charId: 'blaze' });
const lobby1 = await l1;
const roomId = lobby1.room.id;
if (!roomId) fail('no room id');
log('host', `room ${roomId} created`);

// --- guests browse and join ---
const brB = B.next('rooms');
B.send({ t: 'browse' });
const rooms1 = await brB;
if (!rooms1.rooms.find((r) => r.id === roomId)) fail('room not visible in browse');
log('guest', 'room visible in browser');

const lA2 = A.next('lobby');
const lB2 = B.next('lobby');
B.send({ t: 'join', roomId, charId: 'volt' });
const lobby2 = await lB2;
await lA2;
if (lobby2.room.players.length !== 2) fail('expected 2 players');
log('guest', `joined; players: ${lobby2.room.players.map((p) => p.name).join(', ')}`);

const lA2b = A.next('lobby');
const lC2 = C.next('lobby');
C.send({ t: 'join', roomId, charId: 'titan' });
const lobby2b = await lC2;
await lA2b;
if (lobby2b.room.players.length !== 3) fail('expected 3 players');
log('guest2', 'joined by code');

// --- add bot (fills to 4) ---
const lA3 = A.next('lobby');
A.send({ t: 'addbot' });
const lobby3 = await lA3;
if (lobby3.room.players.length !== 4) fail('bot not added');
if (!lobby3.room.players.some((p) => p.isBot)) fail('no bot in roster');
log('host', `bot added: ${lobby3.room.players.map((p) => p.name + (p.isBot ? '(cpu)' : '')).join(', ')}`);

// --- ready + start ---
const lA4 = A.next('lobby');
const lB4 = B.next('lobby');
const lC4 = C.next('lobby');
B.send({ t: 'ready', ready: true, charId: 'volt' });
C.send({ t: 'ready', ready: true, charId: 'titan' });
await lA4;
await lB4;
await lC4;

const sA = A.next('start');
const sB = B.next('start');
const sC = C.next('start');
A.send({ t: 'start' });
const start1 = await sA;
await sB;
await sC;
if (start1.players.length !== 4) fail('expected 4 fighters');
log('sys', `game starting on ${start1.config.stage}, ${start1.players.length} fighters`);

// --- play ---
let snapsA = 0, snapsB = 0;
let done = null;
const evCount = {};
let phaseA = 0, phaseB = 0;
const tickInput = setInterval(() => {
  // sanish play: hold ground, swing often, hop sometimes — avoids instant SDs
  A.send({ t: 'input', input: { mx: phaseA % 26 < 6 ? 1 : 0, my: 0, jump: phaseA % 40 === 3, attack: phaseA % 3 === 0, smash: phaseA % 9 === 4, special: false, shield: false } });
  B.send({ t: 'input', input: { mx: phaseB % 26 < 6 ? -1 : 0, my: 0, jump: phaseB % 40 === 3, attack: phaseB % 3 === 0, smash: phaseB % 9 === 4, special: false, shield: false } });
  phaseA++; phaseB++;
}, 50);

let lastSnap = null;
A.ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.t === 'snap') {
    snapsA++;
    lastSnap = m;
    for (const e of m.ev || []) evCount[e.t] = (evCount[e.t] || 0) + 1;
  }
  if (m.t === 'results') done = m;
});
B.ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.t === 'snap') snapsB++;
});

// chat mid-game
const chatWait = B.next('chat');
A.send({ t: 'chat', text: 'glhf!' });
const chat = await chatWait;
log('guest', `chat received: ${chat.from}: ${chat.text}`);
if (chat.text !== 'glhf!') fail('chat corrupted');

// --- guest2 leaves mid-match: fighter becomes CPU, match survives ---
await new Promise((r) => setTimeout(r, 2500));
const snapsBeforeLeave = snapsA;
C.send({ t: 'leave' });
await new Promise((r) => setTimeout(r, 1200));
if (snapsA <= snapsBeforeLeave) fail('match died when guest2 left mid-game');
if (lastSnap && !lastSnap.fighters.find((f) => f.n === 'Guest2' && f.bot)) fail('leaver fighter not handed to CPU');
log('sys', `mid-match leave survived (snaps ${snapsBeforeLeave} → ${snapsA}, leaver → CPU)`);

// wait for results (stocks=1 or 1-min timeout)
const deadline = Date.now() + 85000;
let lastLog = 0;
while (!done && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 250));
  if (lastSnap && Date.now() - lastLog > 6000) {
    lastLog = Date.now();
    const f = lastSnap.fighters.map((x) => `${x.n}:${x.s}stk/${x.p}%${x.el ? '(out)' : ''}${x.bot ? '(cpu)' : ''}`).join(' ');
    log('sys', `t=${(lastSnap.f / 60).toFixed(0)}s ev=${JSON.stringify(evCount)}`);
    log('sys', `   ${f}`);
  }
}
clearInterval(tickInput);

if (!done) {
  log('sys', `no results — snapsA=${snapsA} snapsB=${snapsB} ev=${JSON.stringify(evCount)}`);
  fail('match did not finish in time');
}
log('sys', `results! snaps host=${snapsA} guest=${snapsB} ev=${JSON.stringify(evCount)}`);
const ranked = done.ranked;
log('sys', `ranking: ${ranked.map((r) => `#${r.rank} ${r.name} (${r.stats.kos}KOs/${r.stats.falls}falls, ${Math.round(r.percent)}%)${r.winner ? ' WINNER' : ''}`).join(' | ')}`);
if (!ranked || ranked.length !== 4) fail('bad ranking');
if (!ranked.some((r) => r.winner)) fail('no winner');
if (snapsA < 30 || snapsB < 30) fail('too few snapshots received');
if ((evCount.hit || 0) < 1) log('sys', 'note: almost no combat this run — netcode path still verified');

// --- guest leaves while in RESULTS state: state must survive so host can rematch ---
const lAAfter = A.next('lobby');
B.send({ t: 'leave' });
const lobbyAfterLeave = await lAAfter;
if (lobbyAfterLeave.room.state !== 'results') fail(`results state lost after leave (got "${lobbyAfterLeave.room.state}")`);
log('sys', 'results state survived a leaver');

// --- rematch from host ---
const sA2 = A.next('start', 8000);
A.send({ t: 'rematch' });
const start3 = await sA2;
if (start3.players.length !== 2) fail(`rematch fighter count wrong (${start3.players.length})`);
log('sys', `rematch after leaver ok (${start3.players.length} fighters: host + CPU)`);

// --- host keeps playing, then leaves: room cleanup ---
await new Promise((r) => setTimeout(r, 900));
A.send({ t: 'input', input: { mx: 1, my: 0, jump: true, attack: true, smash: false, special: false, shield: false } });
await new Promise((r) => setTimeout(r, 600));
if (snapsA < 30) fail('host match not running');
A.send({ t: 'leave' });
await new Promise((r) => setTimeout(r, 600));
const brEnd = A.next('rooms');
A.send({ t: 'browse' });
const roomsEnd = await brEnd;
log('sys', `rooms after everyone left: ${roomsEnd.rooms.length}`);
if (roomsEnd.rooms.length !== 0) fail('room not cleaned up');

console.log(`\nINTEGRATION TEST PASSED in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
