// ImpactPoint Arena — lobby / room manager + authoritative game sessions.

import { Simulation } from '../shared/sim.js';
import { TICK_RATE, SNAP_RATE, RULE_DEFAULTS, CHAR_ORDER, STAGE_ORDER, CHARACTERS } from '../shared/constants.js';

const CODE_CHARS = 'ACDEFGHJKLMNPQRSTUVWXYZ2345679';

function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s + '-' + (10 + Math.floor(Math.random() * 89));
}

let PID = 1;

class Player {
  constructor(ws, name) {
    this.id = 'p' + (PID++);
    this.ws = ws;
    this.name = (name || 'Player').slice(0, 16);
    this.charId = 'blaze';
    this.colorIdx = 0;
    this.ready = false;
    this.isBot = false;
  }
  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}

class Bot extends Player {
  constructor(name, charId, colorIdx) {
    super(null, name);
    this.isBot = true;
    this.charId = charId;
    this.colorIdx = colorIdx;
    this.ready = true;
    this.id = 'b' + (PID++);
  }
  send() {}
}

export class Room {
  constructor(host, settings, name) {
    this.id = makeCode();
    this.name = (name || `${host.name}'s Arena`).slice(0, 24);
    this.hostId = host.id;
    this.settings = { ...RULE_DEFAULTS, ...settings };
    this.players = [host];
    this.state = 'lobby'; // lobby | playing | results
    this.session = null;
    this.loop = null;
    this.createdAt = Date.now();
    this.lastResults = null;
  }

  host() {
    return this.players.find((p) => p.id === this.hostId) || this.players[0];
  }

  isHost(player) {
    return player.id === this.hostId;
  }

  nextColor() {
    const used = new Set(this.players.map((p) => p.colorIdx));
    for (let i = 0; i < 4; i++) if (!used.has(i)) return i;
    return Math.floor(Math.random() * 4);
  }

  publicInfo() {
    return {
      id: this.id,
      name: this.name,
      host: this.host() ? this.host().name : '?',
      players: this.players.filter((p) => !p.isBot).length,
      bots: this.players.filter((p) => p.isBot).length,
      max: this.settings.maxPlayers,
      stage: this.settings.stage,
      stocks: this.settings.stocks,
      state: this.state,
      age: Math.round((Date.now() - this.createdAt) / 1000),
    };
  }

  lobbyInfo() {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      settings: this.settings,
      state: this.state,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        charId: p.charId,
        colorIdx: p.colorIdx,
        ready: p.ready,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
      })),
    };
  }

  broadcast(msg, except) {
    const raw = JSON.stringify(msg);
    for (const p of this.players) {
      if (p === except || p.isBot) continue;
      if (p.ws && p.ws.readyState === 1) p.ws.send(raw);
    }
  }

  broadcastLobby() {
    this.broadcast({ t: 'lobby', room: this.lobbyInfo() });
  }

  // ---------------------------------------------------------------- match
  start(force = false) {
    if (this.state === 'playing') return;
    // everyone except host must be ready (bots always ready); host can force-start
    const humans = this.players.filter((p) => !p.isBot);
    if (!force && humans.some((p) => !p.ready && p.id !== this.hostId)) {
      this.host().send({ t: 'error', msg: 'Waiting for players to ready up.' });
      return;
    }
    // ensure at least 2 fighters
    while (this.players.length < 2) {
      this.addBot();
    }

    this.settings.stage = STAGE_ORDER.includes(this.settings.stage) ? this.settings.stage : 'battlefield';
    this.session = new Simulation({
      rules: this.settings,
      players: this.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        charId: p.charId,
        isBot: p.isBot,
        colorIdx: p.colorIdx ?? i,
      })),
    });
    this.state = 'playing';
    this.lastResults = null;

    const payload = {
      t: 'start',
      config: {
        stage: this.settings.stage,
        stocks: this.settings.stocks,
        timeMinutes: this.settings.timeMinutes,
        countdown: 3,
      },
      players: this.players.map((p) => ({
        id: p.id, name: p.name, charId: p.charId, colorIdx: p.colorIdx, isBot: p.isBot, isHost: p.id === this.hostId,
      })),
    };
    this.broadcast(payload);
    this.broadcastLobby();

    let tickAcc = 0;
    let snapAcc = 0;
    let last = Date.now();
    this.loop = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      tickAcc += dt;
      snapAcc += dt;
      let steps = 0;
      while (tickAcc >= 1000 / TICK_RATE && steps < 6) {
        tickAcc -= 1000 / TICK_RATE;
        this.session.step();
        steps++;
      }
      if (this.session.finished) {
        this.finishMatch();
        return;
      }
      if (snapAcc >= 1000 / SNAP_RATE) {
        snapAcc = 0;
        this.broadcast({ t: 'snap', ...this.session.snapshot() });
      }
    }, 1000 / TICK_RATE);
  }

  finishMatch() {
    clearInterval(this.loop);
    this.loop = null;
    const results = this.session.results();
    this.lastResults = results;
    this.state = 'results';
    this.broadcast({ t: 'snap', ...this.session.snapshot() });
    this.broadcast({ t: 'results', ranked: results, roomId: this.id });
    // keep the room alive for rematch
    for (const p of this.players) p.ready = false;
    this.broadcastLobby();
    this.session = null;
    // auto-close empty-ish rooms after long idle handled by sweeper
    this.finishedAt = Date.now();
  }

  stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.session = null;
    this.state = 'lobby';
  }

  addBot() {
    if (this.players.length >= this.settings.maxPlayers) return false;
    const names = ['CPU Alpha', 'CPU Bravo', 'CPU Colossus', 'CPU Delta', 'CPU Echo', 'CPU Foxtrot'];
    const usedChars = new Set(this.players.map((p) => p.charId));
    let charId = CHAR_ORDER[Math.floor(Math.random() * CHAR_ORDER.length)];
    if (usedChars.size < CHAR_ORDER.length) {
      while (usedChars.has(charId)) charId = CHAR_ORDER[Math.floor(Math.random() * CHAR_ORDER.length)];
    }
    const bot = new Bot(names[this.players.filter((p) => p.isBot).length % names.length], charId, this.nextColor());
    this.players.push(bot);
    return true;
  }

  removePlayer(player) {
    const idx = this.players.indexOf(player);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    if (this.state === 'playing' && this.session) {
      // hand fighter over to the CPU so the match survives
      const f = this.session.fighters.find((x) => x.id === player.id);
      if (f) f.isBot = true;
    } else if (this.state !== 'results') {
      // keep 'results' intact so the host can still rematch after someone leaves
      this.stopLoop();
      this.state = 'lobby';
    }
    if (player.id === this.hostId && this.players.length > 0) {
      const next = this.players.find((p) => !p.isBot) || this.players[0];
      this.hostId = next.id;
      next.send({ t: 'info', msg: 'You are now the host.' });
    }
    if (this.players.filter((p) => !p.isBot).length === 0) {
      this.stopLoop();
    }
  }
}

export class LobbyManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
    this.playerRoom = new Map(); // playerId -> room
    this.roomsByWs = new Map();
  }

  list() {
    return [...this.rooms.values()]
      .filter((r) => r.players.filter((p) => !p.isBot).length > 0)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => r.publicInfo());
  }

  host(player, opts = {}) {
    this.leave(player);
    const settings = {
      stocks: clampInt(opts.stocks, 1, 9, RULE_DEFAULTS.stocks),
      timeMinutes: clampInt(opts.timeMinutes, 1, 20, RULE_DEFAULTS.timeMinutes),
      maxPlayers: clampInt(opts.maxPlayers, 2, 4, RULE_DEFAULTS.maxPlayers),
      stage: STAGE_ORDER.includes(opts.stage) ? opts.stage : RULE_DEFAULTS.stage,
    };
    const room = new Room(player, settings, opts.name);
    player.charId = CHARACTERS[opts.charId] ? opts.charId : 'blaze';
    player.colorIdx = 0;
    player.ready = false;
    this.rooms.set(room.id, room);
    this.playerRoom.set(player.id, room);
    player.send({ t: 'lobby', room: room.lobbyInfo() });
    this.broadcastRooms();
    return room;
  }

  join(player, code) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) {
      player.send({ t: 'error', msg: 'Room not found. Check the code.' });
      return null;
    }
    if (room.state === 'playing' && room.session) {
      player.send({ t: 'error', msg: 'Match already in progress.' });
      return null;
    }
    const humans = room.players.filter((p) => !p.isBot).length;
    if (humans >= room.settings.maxPlayers) {
      player.send({ t: 'error', msg: 'Room is full.' });
      return null;
    }
    this.leave(player);
    // replace a bot if possible
    const bot = room.players.find((p) => p.isBot);
    if (bot) room.players.splice(room.players.indexOf(bot), 1);
    player.ready = false;
    player.colorIdx = room.nextColor();
    player.charId = player.charId || 'blaze';
    room.players.push(player);
    this.playerRoom.set(player.id, room);
    room.broadcast({ t: 'info', msg: `${player.name} joined the arena.` }, player);
    room.broadcastLobby();
    this.broadcastRooms();
    return room;
  }

  quickplay(player) {
    // find a public lobby with room
    for (const room of this.rooms.values()) {
      if (room.state !== 'lobby') continue;
      const humans = room.players.filter((p) => !p.isBot).length;
      if (humans < room.settings.maxPlayers) {
        this.join(player, room.id);
        return;
      }
    }
    // otherwise host instantly with CPUs
    const room = this.host(player, { name: `${player.name}'s Quick Match`, stocks: 3, timeMinutes: 6, maxPlayers: 4, stage: 'battlefield' });
    while (room.players.length < Math.min(4, room.settings.maxPlayers)) room.addBot();
    player.ready = true;
    room.broadcastLobby();
    setTimeout(() => {
      if (this.rooms.get(room.id) === room && room.state === 'lobby') room.start();
    }, 900);
  }

  leave(player) {
    const room = this.playerRoom.get(player.id);
    if (!room) return;
    room.removePlayer(player);
    this.playerRoom.delete(player.id);
    if (room.players.filter((p) => !p.isBot).length === 0) {
      room.stopLoop();
      this.rooms.delete(room.id);
    } else {
      room.broadcastLobby();
    }
    this.broadcastRooms();
  }

  roomOf(player) {
    return this.playerRoom.get(player.id) || null;
  }

  broadcastRooms() {
    const list = this.list();
    const raw = JSON.stringify({ t: 'rooms', rooms: list });
    for (const room of this.rooms.values()) {
      for (const p of room.players) {
        if (!p.isBot && p.ws && p.ws.readyState === 1) p.ws.send(raw);
      }
    }
    // also send to players not in rooms (they subscribe on hello via ws registry)
    if (this.wsAll) {
      for (const ws of this.wsAll) {
        if (ws.readyState === 1 && !this.roomsByWs.has(ws)) ws.send(raw);
      }
    }
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const humans = room.players.filter((p) => !p.isBot).length;
      const idle = room.state === 'results' && room.finishedAt && now - room.finishedAt > 10 * 60 * 1000;
      if (humans === 0 || idle) {
        room.stopLoop();
        this.rooms.delete(code);
      }
    }
    this.broadcastRooms();
  }
}

function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
