// Shared game data: characters, stages, moves, tuning. Used by server + client.

export const TICK_RATE = 60;
export const SNAP_RATE = 30; // snapshots per second
export const TICK_MS = 1000 / TICK_RATE;

export const WORLD = {
  blast: { left: -240, right: 2040, top: -420, bottom: 1240 },
  respawnY: 120,
};

export const RULE_DEFAULTS = {
  stocks: 3,
  timeMinutes: 8,
  maxPlayers: 4,
  stage: 'battlefield',
  items: false,
};

// ---------------------------------------------------------------- characters
// stat multipliers tuned around base physics in sim.js
export const CHARACTERS = {
  blaze: {
    id: 'blaze', name: 'Blaze', title: 'Flame Brawler',
    weight: 1.0, speed: 1.0, jump: 1.0, fall: 1.0, size: 1.0, airAccel: 1.0,
    color: '#ff6b35', color2: '#c23a1c', accent: '#ffd166',
    desc: 'Well-rounded fire striker. Solid everywhere.',
    stats: { power: 3, speed: 3, weight: 3, recovery: 3 },
  },
  volt: {
    id: 'volt', name: 'Volt', title: 'Spark Runner',
    weight: 0.8, speed: 1.22, jump: 1.12, fall: 0.94, size: 0.88, airAccel: 1.25,
    color: '#40c9ff', color2: '#1d6fd6', accent: '#fff35c',
    desc: 'Lightning fast and hard to pin down. Hits quick, flies far.',
    stats: { power: 2, speed: 5, weight: 1, recovery: 4 },
  },
  titan: {
    id: 'titan', name: 'Titan', title: 'Iron Colossus',
    weight: 1.38, speed: 0.8, jump: 0.88, fall: 1.14, size: 1.2, airAccel: 0.82,
    color: '#9b5de5', color2: '#5b2c9e', accent: '#c8ff4d',
    desc: 'A wall of muscle. Slow start, insane knockback.',
    stats: { power: 5, speed: 1, weight: 5, recovery: 2 },
  },
  rift: {
    id: 'rift', name: 'Rift', title: 'Void Dancer',
    weight: 0.9, speed: 0.96, jump: 1.26, fall: 0.82, size: 0.95, airAccel: 1.1,
    color: '#00f5d4', color2: '#007f7b', accent: '#f15bb5',
    desc: 'Floaty trickster with godlike recovery and tricky angles.',
    stats: { power: 3, speed: 3, weight: 2, recovery: 5 },
  },
};

export const CHAR_ORDER = ['blaze', 'volt', 'titan', 'rift'];

// team colors for up to 4 players
export const PLAYER_COLORS = ['#ff6b35', '#40c9ff', '#ffd166', '#7bf178'];

// ---------------------------------------------------------------- stages
export const STAGES = {
  battlefield: {
    id: 'battlefield', name: 'Battlefield',
    desc: 'Classic main platform with three floating platforms.',
    platforms: [
      { x: 300, y: 760, w: 1200, h: 46, type: 'solid' },
      { x: 560, y: 540, w: 280, h: 24, type: 'soft' },
      { x: 960, y: 540, w: 280, h: 24, type: 'soft' },
      { x: 760, y: 400, w: 280, h: 24, type: 'soft' },
    ],
    spawn: { x: 700, y: 620 },
    camY: 560,
  },
  final: {
    id: 'final', name: 'Final Destination',
    desc: 'Flat and honest. Just you and the blast zone.',
    platforms: [
      { x: 260, y: 740, w: 1280, h: 46, type: 'solid' },
    ],
    spawn: { x: 900, y: 620 },
    camY: 560,
  },
  skyroost: {
    id: 'skyroost', name: 'Sky Roost',
    desc: 'A wide lower deck with two high side perches.',
    platforms: [
      { x: 380, y: 820, w: 1040, h: 46, type: 'solid' },
      { x: 240, y: 520, w: 260, h: 22, type: 'soft' },
      { x: 1300, y: 520, w: 260, h: 22, type: 'soft' },
      { x: 770, y: 600, w: 260, h: 22, type: 'soft' },
    ],
    spawn: { x: 620, y: 680 },
    camY: 560,
  },
};

export const STAGE_ORDER = ['battlefield', 'final', 'skyroost'];

// ---------------------------------------------------------------- moves
// hitbox is an offset rect in front of the fighter (facing right assumed)
// {x,y,w,h} offset from fighter center; dmg; baseKb; kbScale; angle (deg, 0=right, 90=up);
// startup/active/end in frames; type for FX.
const M = (o) => ({
  startup: 6, active: 4, end: 22, dmg: 8, baseKb: 26, kbScale: 1.35,
  angle: 42, hitlag: 4, hitstun: 1.1, range: null, proj: null,
  fx: 'hit', knockdown: false, ...o,
});

export const MOVES = {
  // ground tilts / jabs
  jab:      M({ startup: 3, active: 3, end: 13, dmg: 3.4, baseKb: 16, kbScale: 1.05, angle: 45, hitlag: 3, fx: 'hit', box: { x: 34, y: -26, w: 74, h: 52 } }),
  ftilt:    M({ startup: 6, active: 4, end: 20, dmg: 8, baseKb: 28, kbScale: 1.3, angle: 40, box: { x: 42, y: -32, w: 88, h: 58 } }),
  utilt:    M({ startup: 5, active: 5, end: 18, dmg: 7, baseKb: 24, kbScale: 1.25, angle: 84, box: { x: -6, y: -108, w: 84, h: 100 } }),
  dtilt:    M({ startup: 4, active: 3, end: 15, dmg: 5.5, baseKb: 20, kbScale: 1.15, angle: 28, box: { x: 38, y: -22, w: 82, h: 36 } }),
  // smash attacks
  fsmash:   M({ startup: 11, active: 5, end: 34, dmg: 16, baseKb: 46, kbScale: 1.95, angle: 38, hitlag: 8, fx: 'smash', knockdown: true, box: { x: 46, y: -48, w: 108, h: 84 } }),
  usmash:   M({ startup: 10, active: 5, end: 32, dmg: 15, baseKb: 42, kbScale: 1.85, angle: 88, hitlag: 7, fx: 'smash', box: { x: -24, y: -150, w: 116, h: 132 } }),
  dsmash:   M({ startup: 9, active: 6, end: 30, dmg: 13.5, baseKb: 40, kbScale: 1.7, angle: 36, hitlag: 7, fx: 'smash', box: { x: -12, y: -34, w: 120, h: 52 } }),
  // aerials
  nair:     M({ startup: 5, active: 6, end: 22, dmg: 7, baseKb: 24, kbScale: 1.25, angle: 45, box: { x: -34, y: -44, w: 82, h: 82 } }),
  fair:     M({ startup: 6, active: 5, end: 24, dmg: 9, baseKb: 30, kbScale: 1.4, angle: 32, box: { x: 38, y: -36, w: 88, h: 66 } }),
  bair:     M({ startup: 5, active: 5, end: 22, dmg: 9.5, baseKb: 31, kbScale: 1.42, angle: 40, box: { x: -112, y: -36, w: 92, h: 66 } }),
  uair:     M({ startup: 5, active: 5, end: 22, dmg: 8, baseKb: 26, kbScale: 1.35, angle: 86, box: { x: -22, y: -112, w: 88, h: 84 } }),
  dair:     M({ startup: 7, active: 6, end: 26, dmg: 11, baseKb: 32, kbScale: 1.5, angle: 268, fx: 'smash', box: { x: -26, y: 12, w: 86, h: 86 } }),
  // specials (shared skeleton; per-char modifiers below)
  nspecial: M({ startup: 12, active: 2, end: 32, dmg: 7.5, baseKb: 26, kbScale: 1.25, angle: 36, proj: 'bolt', box: null }),
  fspecial: M({ startup: 9, active: 8, end: 32, dmg: 11, baseKb: 38, kbScale: 1.55, angle: 38, fx: 'smash', box: { x: 30, y: -40, w: 104, h: 72 } }),
  uspecial: M({ startup: 6, active: 8, end: 34, dmg: 8, baseKb: 30, kbScale: 1.3, angle: 80, box: { x: -30, y: -120, w: 100, h: 128 } }),
  dspecial: M({ startup: 8, active: 6, end: 30, dmg: 10, baseKb: 34, kbScale: 1.5, angle: 55, fx: 'smash', box: { x: -22, y: -46, w: 118, h: 84 } }),
};

// Per-character special flavour. Values override base move params.
export const CHAR_MOVES = {
  blaze: {
    nspecial: { proj: 'fire', dmg: 8, speed: 13, size: 1.15, name: 'Fire Shot' },
    fspecial: { dmg: 12, dash: 15, name: 'Blaze Rush' },
    uspecial: { dmg: 9, rise: 17, name: 'Flame Uppercut' },
    dspecial: { dmg: 11, name: 'Magma Stomp' },
  },
  volt: {
    nspecial: { proj: 'spark', dmg: 6, speed: 19, size: 0.85, name: 'Spark Jolt' },
    fspecial: { dmg: 9, dash: 22, name: 'Volt Tackle' },
    uspecial: { dmg: 7, rise: 19.5, name: 'Thunder Rise' },
    dspecial: { dmg: 8.5, name: 'Static Burst' },
  },
  titan: {
    nspecial: { proj: 'rock', dmg: 12, speed: 9, size: 1.5, name: 'Boulder Toss' },
    fspecial: { dmg: 15, dash: 11, name: 'Iron Charge' },
    uspecial: { dmg: 11, rise: 14.5, name: 'Giant Swing' },
    dspecial: { dmg: 14, name: 'Quake Slam' },
  },
  rift: {
    nspecial: { proj: 'void', dmg: 5.5, speed: 11, size: 1.0, name: 'Void Orb' },
    fspecial: { dmg: 8.5, dash: 17, name: 'Rift Slide' },
    uspecial: { dmg: 6, rise: 18, name: 'Phase Leap' },
    dspecial: { dmg: 7, name: 'Rift Bloom' },
  },
};

// projectile visuals
export const PROJ_STYLES = {
  fire:  { color: '#ff7b2e', glow: '#ffd166', r: 16, trail: 'fire' },
  spark: { color: '#7bf1ff', glow: '#ffffff', r: 11, trail: 'spark' },
  rock:  { color: '#b08968', glow: '#e6ccb2', r: 22, trail: 'dust' },
  void:  { color: '#c77dff', glow: '#00f5d4', r: 14, trail: 'void' },
};

export const PAUSE_KEYS = ['Escape', 'KeyP'];
