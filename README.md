# 💥 ImpactPoint Arena

A Super Smash Bros–style **LAN multiplayer platform fighter** that runs in your browser.
One player **hosts** an arena, everyone else **joins** from the match browser or with a room code —
up to 4 fighters (humans + CPUs) battle with stocks, damage percentage, knockback, and blast zones.

![genre](https://img.shields.io/badge/genre-platform%20fighter-ff6b35) ![players](https://img.shields.io/badge/players-1--4%20LAN-40c9ff) ![stack](https://img.shields.io/badge/stack-Node%20%2B%20Canvas-9b5de5)

## Quick start

```bash
npm install
npm start          # → http://localhost:8080
```

Open the page, pick a name, and hit **PRESS START**.

- **QUICK PLAY** — instant match against CPUs (great for a first look)
- **HOST MATCH** — create a named arena with stage/stocks/time rules, then share your address or room code
- **JOIN MATCH** — browse open arenas on the server, or type a room code

### LAN play

Everyone on your network opens the host's address (the server prints its LAN IPs on startup, e.g.
`http://192.168.1.20:8080`). One player hosts, the others join from the browser list or the
5-character room code shown in the lobby. No internet required.

## Deploy on Render

The repo ships with a `render.yaml` blueprint, so deployment takes about two minutes:

1. **Push this repo to GitHub** (already the case if you're reading it there).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the GitHub repo `yeskingbusiness-tech/impactpoint`. Render reads `render.yaml`
   and creates the web service (Node, `npm install` / `npm start`, health check `/api/status`).
   - Prefer manual setup? **New → Web Service**, pick the repo, then set
     Build Command `npm install`, Start Command `npm start`, and the same health check path.
4. **Branch:** by default Render deploys `main`. This project lives on `arena/d3399585-impactpoint`,
   so either merge it into `main` first, or in the service settings set **Branch** to
   `arena/d3399585-impactpoint` (or add `branch: arena/d3399585-impactpoint` to `render.yaml`).
5. Deploy — when the health check goes green, share your URL
   (`https://impactpoint-arena.onrender.com`). Everyone opens that same address and hosts/joins
   as usual. The client automatically uses `wss://` on HTTPS, so no config is needed.

Notes for Render:

- The server reads Render's `PORT` env var and binds `0.0.0.0` — no extra configuration.
- **Free instances sleep** after ~15 min without traffic (a sleeping server feels dead until it
  wakes). For a game server your friends can hit any time, set the plan to **Starter**.
- All match state lives in memory: if the instance restarts, open arenas vanish (players just
  re-host). Nothing else is persisted, so there's no database or disk to set up.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move / fast-fall / drop through | `WASD` / Arrows | Stick / D-pad |
| Jump (double jump) | `W` `Space` / Up | `A` |
| Light attack (tilts & aerials) | `J` / `Z` | `X` |
| Smash attack | `K` / `X` | `Y` |
| Special (side / up / down) | `L` / `C` | `B` |
| Shield (hold) · Dodge roll (tap + direction) | `Shift` / `Q` | `LB` / `RB` |
| Pause | `Esc` / `P` | |

## The rules (Smash-style)

- Hits build **damage %** — the higher it climbs, the farther knockback sends you.
- Fly past the **blast zone** and lose a stock. Lose all your stocks and you're eliminated.
- Last fighter standing wins. Survive with double jumps, up-specials, and good recoveries.
- **Shield** blocks hits but drains (break = stunned). **Dodge** gives brief invulnerability.

## Fighters

| | Name | Style |
|---|---|---|
| 🔥 | **Blaze** | Balanced fire brawler |
| ⚡ | **Volt** | Lightning-fast, light, hits quick |
| 🛡️ | **Titan** | Heavyweight with insane knockback |
| 🌀 | **Rift** | Floaty trickster, godlike recovery |

Stages: **Battlefield**, **Final Destination**, **Sky Roost**. Free-for-all, up to 4 players, fill
slots with CPUs at any time from the lobby.

## Architecture

```
server/index.js     HTTP + WebSocket server (static files, matchmaking, relay)
server/rooms.js     Arenas: host/join/browse, ready-up, chat, session lifecycle
shared/constants.js Fighter/stage/move data shared by server & client
shared/sim.js       Authoritative 60 Hz simulation: physics, combat, knockback, CPU AI
public/js/          Canvas renderer (procedural fighters & FX), UI, input, net, WebAudio SFX
```

Gameplay runs **server-authoritative** at 60 Hz with 30 Hz snapshots (interpolated on the client),
so a player disconnecting hands their fighter to the CPU instead of killing the match.

## Tests

```bash
npm test           # spins up a server on :8099 and runs all three suites
```

1. `test/sim.test.js` — bots fight to completion on every stage (KOs, rankings, no stuck fighters)
2. `test/integration.test.js` — two real WebSocket clients: host → browse → join → chat → play → results → rematch
3. `test/client.test.js` — boots the actual client (jsdom) against the real server and drives every screen

---
*Not affiliated with Nintendo. Just a lot of love for platform fighters.*
