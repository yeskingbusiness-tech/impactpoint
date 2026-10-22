// ImpactPoint Arena — entry point: static file server + WebSocket matchmaking.

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { LobbyManager, } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const PORT = parseInt(process.env.PORT || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

function safeJoin(base, reqPath) {
  const p = path.normalize(path.join(base, reqPath));
  return p.startsWith(base) ? p : null;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
    });
    res.end(data);
  });
}

const lobby = new LobbyManager();
lobby.wsAll = new Set();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: lobby.list().length, uptime: process.uptime() }));
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveFile(res, path.join(PUBLIC, 'index.html'));
    return;
  }

  if (pathname.startsWith('/shared/')) {
    const fp = safeJoin(SHARED, pathname.slice('/shared/'.length));
    if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) return serveFile(res, fp);
    res.writeHead(404); res.end('Not found');
    return;
  }

  const fp = safeJoin(PUBLIC, pathname);
  if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    serveFile(res, fp);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

wss.on('connection', (ws) => {
  lobby.wsAll.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let player = null;

  const send = (msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };

  send({ t: 'hello', rooms: lobby.list() });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    try {
      switch (msg.t) {
        case 'hello': {
          // (re)register identity
          if (player) lobby.leave(player);
          player = createPlayer(ws, msg.name);
          send({ t: 'welcome', id: player.id, name: player.name, rooms: lobby.list() });
          break;
        }

        case 'browse':
          send({ t: 'rooms', rooms: lobby.list() });
          break;

        case 'host': {
          if (!player) return send({ t: 'error', msg: 'Not connected.' });
          if (msg.charId) player.charId = msg.charId;
          lobby.host(player, msg);
          break;
        }

        case 'join': {
          if (!player) return send({ t: 'error', msg: 'Not connected.' });
          if (msg.charId) player.charId = msg.charId;
          lobby.join(player, msg.roomId);
          break;
        }

        case 'quickplay': {
          if (!player) return send({ t: 'error', msg: 'Not connected.' });
          lobby.quickplay(player);
          break;
        }

        case 'leave':
          if (player) lobby.leave(player);
          break;

        case 'ready': {
          const room = player && lobby.roomOf(player);
          if (!room) return;
          if (msg.charId) player.charId = msg.charId;
          if (typeof msg.colorIdx === 'number') player.colorIdx = Math.max(0, Math.min(3, msg.colorIdx | 0));
          if (msg.ready !== undefined) player.ready = !!msg.ready;
          room.broadcastLobby();
          break;
        }

        case 'settings': {
          const room = player && lobby.roomOf(player);
          if (!room || !room.isHost(player) || room.state !== 'lobby') return;
          const s = msg.settings || {};
          if (s.stage) room.settings.stage = s.stage;
          if (s.stocks != null) room.settings.stocks = Math.max(1, Math.min(9, s.stocks | 0));
          if (s.timeMinutes != null) room.settings.timeMinutes = Math.max(1, Math.min(20, s.timeMinutes | 0));
          if (s.maxPlayers != null) room.settings.maxPlayers = Math.max(2, Math.min(4, s.maxPlayers | 0));
          room.broadcastLobby();
          break;
        }

        case 'addbot': {
          const room = player && lobby.roomOf(player);
          if (!room || !room.isHost(player) || room.state !== 'lobby') return;
          room.addBot();
          room.broadcastLobby();
          break;
        }

        case 'kick': {
          const room = player && lobby.roomOf(player);
          if (!room || !room.isHost(player) || room.state !== 'lobby') return;
          const target = room.players.find((p) => p.id === msg.id && p.isBot);
          if (target) {
            room.players.splice(room.players.indexOf(target), 1);
            room.broadcastLobby();
          }
          break;
        }

        case 'start': {
          const room = player && lobby.roomOf(player);
          if (!room || !room.isHost(player)) return;
          room.start();
          break;
        }

        case 'input': {
          const room = player && lobby.roomOf(player);
          if (!room || !room.session) return;
          room.session.setInput(player.id, msg.input || {});
          break;
        }

        case 'chat': {
          const room = player && lobby.roomOf(player);
          if (!room) return;
          const text = String(msg.text || '').slice(0, 140).trim();
          if (!text) return;
          room.broadcast({ t: 'chat', from: player.name, fromId: player.id, text });
          break;
        }

        case 'rematch': {
          const room = player && lobby.roomOf(player);
          if (!room || room.state !== 'results') return;
          if (!room.isHost(player)) return;
          room.start(true);
          break;
        }

        case 'ping':
          send({ t: 'pong', t2: msg.t2 });
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('msg error', err);
      send({ t: 'error', msg: 'Server error.' });
    }
  });

  ws.on('close', () => {
    lobby.wsAll.delete(ws);
    if (player) lobby.leave(player);
  });
  ws.on('error', () => {});
});

// tiny player factory (kept here to avoid exporting Player from rooms.js)
let SPAWN_IDX = 0;
function createPlayer(ws, name) {
  // rooms.js Player instances are created through LobbyManager via duck typing
  const p = {
    id: 'p' + (++SPAWN_IDX) + Math.floor(Math.random() * 1e4).toString(36),
    ws,
    name: (name || 'Player').slice(0, 16),
    charId: 'blaze',
    colorIdx: 0,
    ready: false,
    isBot: false,
    send(msg) {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    },
  };
  return p;
}

// heartbeat
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

setInterval(() => lobby.sweep(), 60000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ▄████████  ▄██████▄  ███    █▄     ▄████████  ▄██████▄    ▄▄▄▄███▄▄▄▄      ▄████████');
  console.log('  ███    ███ ███    ███ ███    ███   ███    ███ ███    ███ ▄██▀▀▀███▀▀▀██▄   ███    ███');
  console.log('  ███    █▀  ███    ███ ███    ███   ███    ███ ███    ███ ███   ███   ███   ███    █▀ ');
  console.log('  ███        ███    ███ ███    ███  ▄███▄▄▄▄██▀ ███    ███ ███   ███   ███  ▄███▄▄▄▄  ');
  console.log('▀███████████ ███    ███ ███    ███ ▀▀███▀▀▀▀▀   ███    ███ ███   ███   ███ ▀▀███▀▀▀▀  ');
  console.log('         ███ ███    ███ ███    ███ ▀███████████ ███    ███ ███   ███   ███   ███    █▄');
  console.log('   ▄█    ███ ███    ███ ███    ███   ███    ███ ███    ███ ███   ███   ███   ███    ███');
  console.log(' ▄████████▀   ▀██████▀  ████████▀    ███    ███  ▀██████▀   █▀   ███   █▀    ██████████');
  console.log('                                     ███    ███                                    ');
  console.log('');
  console.log(`  ImpactPoint Arena server running on http://0.0.0.0:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  LAN address: http://${net.address}:${PORT}  (${name})`);
      }
    }
  }
  console.log('  Share that address with players on your network to host/join matches.');
  console.log('');
});
