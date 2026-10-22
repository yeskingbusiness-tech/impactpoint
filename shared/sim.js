// ImpactPoint Arena — authoritative game simulation (pure JS, no DOM).
// Runs inside the Node server at 60Hz. Clients render snapshots of this.

import {
  TICK_RATE, WORLD, CHARACTERS, CHAR_MOVES, MOVES, STAGES, RULE_DEFAULTS, PROJ_STYLES,
} from './constants.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- fighter
let FID = 1;

function makeFighter(player, index, rules, stage) {
  const ch = CHARACTERS[player.charId] || CHARACTERS.blaze;
  const spread = ((index % 2 === 0) ? -1 : 1) * (120 + Math.floor(index / 2) * 90);
  return {
    id: player.id,
    fid: FID++,
    name: player.name,
    charId: ch.id,
    isBot: !!player.isBot,
    colorIdx: player.colorIdx ?? index,
    // body
    x: stage.spawn.x + spread,
    y: stage.spawn.y - 140 - (index % 2) * 60,
    vx: 0, vy: 0,
    face: spread >= 0 ? 1 : -1,
    halfW: 20 * ch.size,
    halfH: 31 * ch.size,
    // combat
    percent: 0,
    stocks: rules.stocks,
    state: 'fall',
    stateT: 0,
    jumps: 2,
    onGround: false,
    dropTimer: 0,
    hitlag: 0,
    hitstun: 0,
    invuln: 120, // spawn invuln
    shieldHp: 100,
    dodgeT: 0,
    attack: null, // {move, frame, hitSet:Set}
    lastHitBy: null,
    lastHitAt: -9999,
    // input
    input: emptyInput(),
    prevInput: emptyInput(),
    botTimer: 0,
    botPlan: { mode: 'chase', t: 0 },
    // stats
    stats: { dmgDealt: 0, kos: 0, falls: 0, biggest: 0 },
    eliminated: false,
    respawnT: 0,
    tauntT: 0,
    dashDustT: 0,
  };
}

export function emptyInput() {
  return { mx: 0, my: 0, jump: false, attack: false, smash: false, special: false, shield: false };
}

function pressed(inp, prev, key) { return inp[key] && !prev[key]; }

// ---------------------------------------------------------------- simulation
export class Simulation {
  constructor(opts) {
    const rules = {
      ...RULE_DEFAULTS,
      ...(opts.rules || {}),
    };
    this.rules = rules;
    this.stage = STAGES[rules.stage] || STAGES.battlefield;
    this.frame = 0;
    this.timeLeft = rules.timeMinutes * 60 * TICK_RATE;
    this.fighters = (opts.players || []).map((p, i) => makeFighter(p, i, rules, this.stage));
    this.projectiles = [];
    this.projId = 1;
    this.events = [];
    this.pendingEvents = []; // survives across steps until drained by snapshot()
    this.finished = false;
    this.winnerId = null;
    this.startCountdown = 3 * TICK_RATE + 30; // "3,2,1,GO" grace before control
    this.ranked = null;
  }

  aliveFighters() {
    return this.fighters.filter((f) => !f.eliminated);
  }

  pushEvent(e) {
    this.events.push(e);
    this.pendingEvents.push(e);
    if (this.pendingEvents.length > 500) this.pendingEvents.splice(0, 250);
  }

  setInput(playerId, input) {
    const f = this.fighters.find((x) => x.id === playerId);
    if (!f) return;
    f.input = { ...emptyInput(), ...input };
  }

  // ---------------------------------------------------------------- main tick
  step() {
    if (this.finished) return;
    this.frame++;
    this.events.length = 0;

    if (this.startCountdown > 0) {
      this.startCountdown--;
      // freeze players in place during countdown
      for (const f of this.fighters) {
        f.prevInput = { ...f.input };
      }
      if (this.startCountdown === 0) {
        this.pushEvent({ t: 'go' });
      }
      return;
    }

    if (this.timeLeft > 0) {
      this.timeLeft--;
      if (this.timeLeft === 0) {
        this.finishByTime();
        return;
      }
    }

    for (const f of this.fighters) {
      if (f.eliminated) continue;
      if (f.isBot) this.botThink(f);
      if (f.respawnT > 0) {
        f.respawnT--;
        if (f.respawnT === 0) this.respawnFighter(f);
        continue;
      }
      if (f.hitlag > 0) {
        f.hitlag--;
        f.prevInput = { ...f.input };
        continue;
      }
      this.updateFighter(f);
      f.prevInput = { ...f.input };
    }

    this.updateProjectiles();
    this.checkBlastZones();
    this.checkWin();
  }

  // ---------------------------------------------------------------- fighter
  updateFighter(f) {
    const ch = CHARACTERS[f.charId];
    const inp = f.input;
    const prev = f.prevInput;
    const stats = {
      gravity: 0.82 * ch.fall,
      maxFall: 15.5 * ch.fall,
      fastFall: 21.5 * ch.fall,
      run: 7.6 * ch.speed,
      airSpeed: 6.4 * ch.speed,
      airAccel: 0.62 * ch.airAccel,
      jumpVel: -15.8 * ch.jump,
      djumpVel: -13.6 * ch.jump,
      friction: 0.76,
    };

    if (f.invuln > 0) f.invuln--;
    if (f.dropTimer > 0) f.dropTimer--;
    if (f.tauntT > 0) f.tauntT--;

    // ------- stun / hitstun
    if (f.hitstun > 0) {
      f.hitstun--;
      // slight directional influence while tumbling
      f.vx += inp.mx * 0.22;
      f.vy += inp.my * 0.12 * (f.vy > 0 ? 1 : 0.4);
      this.physics(f, stats, true);
      if (f.hitstun === 0 && !f.onGround) f.state = 'fall';
      else if (f.hitstun === 0) f.state = 'idle';
      return;
    }

    // ------- dodge / roll
    if (f.state === 'dodge') {
      f.stateT++;
      const dur = f.onGround ? 24 : 18;
      f.invuln = f.stateT < 16 ? Math.max(f.invuln, 1) : f.invuln;
      if (f.onGround) f.vx *= 0.88;
      this.physics(f, stats, false);
      if (f.stateT >= dur) {
        f.state = f.onGround ? 'idle' : 'fall';
        f.attack = null;
      }
      return;
    }

    // ------- shield
    if (f.state === 'shield') {
      if (inp.shield && f.shieldHp > 0) {
        f.shieldHp = Math.max(0, f.shieldHp - 0.32);
        f.vx *= 0.7;
        // shield jump-cancel / roll
        if (pressed(inp, prev, 'jump')) {
          f.state = 'jump';
          f.vy = stats.jumpVel * 0.92;
          f.jumps = Math.min(f.jumps, 1);
          f.onGround = false;
          this.pushEvent({ t: 'jump', x: f.x, y: f.y, d: false });
          return;
        }
        if (Math.abs(inp.mx) > 0.5 && f.onGround) {
          f.state = 'dodge';
          f.stateT = 0;
          f.vx = Math.sign(inp.mx) * 11.5;
          f.face = Math.sign(inp.mx);
          this.pushEvent({ t: 'dodge', x: f.x, y: f.y });
          return;
        }
        this.physics(f, stats, false);
        return;
      }
      f.state = f.onGround ? 'idle' : 'fall';
    }

    // ------- shield break stun
    if (f.state === 'stunned') {
      f.stateT--;
      f.vx *= 0.92;
      this.physics(f, stats, true);
      if (f.stateT <= 0) {
        f.state = f.onGround ? 'idle' : 'fall';
        f.shieldHp = 40;
      }
      return;
    }

    // ------- attack / special in progress
    if (f.attack) {
      this.updateAttack(f, stats);
      return;
    }

    // ------- free movement ------------------------------------------------
    if (inp.shield) {
      if (f.onGround && Math.abs(inp.mx) > 0.5) {
        // shield + direction = roll
        f.state = 'dodge';
        f.stateT = 0;
        const dir = Math.sign(inp.mx);
        f.vx = dir * 11.5;
        f.face = dir;
        this.pushEvent({ t: 'dodge', x: f.x, y: f.y });
        return;
      }
      if (f.onGround) {
        f.state = 'shield';
        f.vx *= 0.6;
        this.physics(f, stats, false);
        return;
      }
      if (pressed(inp, prev, 'shield')) {
        // air dodge
        f.state = 'dodge';
        f.stateT = 0;
        const dir = Math.abs(inp.mx) > 0.3 ? Math.sign(inp.mx) : -f.face;
        f.vx = dir * 6;
        f.vy = Math.min(f.vy, 1);
        this.pushEvent({ t: 'dodge', x: f.x, y: f.y });
        return;
      }
    }

    // attack inputs
    if (pressed(inp, prev, 'special')) {
      this.startMove(f, this.pickSpecial(f), true);
      return;
    }
    if (pressed(inp, prev, 'smash')) {
      this.startMove(f, this.pickSmash(f), false);
      return;
    }
    if (pressed(inp, prev, 'attack')) {
      this.startMove(f, this.pickTilt(f), false);
      return;
    }

    // jumping
    const jumpPressed = pressed(inp, prev, 'jump');
    if (jumpPressed) {
      if (f.onGround) {
        if (inp.my > 0.5 && this.onSoftPlatform(f)) {
          f.dropTimer = 14;
          f.onGround = false;
          f.y += 6;
          f.state = 'fall';
        } else {
          f.vy = stats.jumpVel;
          f.onGround = false;
          f.jumps = 1;
          f.state = 'jump';
          this.pushEvent({ t: 'jump', x: f.x, y: f.y, d: false });
        }
      } else if (f.jumps > 0) {
        f.jumps--;
        f.vy = stats.djumpVel;
        f.state = 'jump';
        this.pushEvent({ t: 'jump', x: f.x, y: f.y, d: true });
      }
    }

    // horizontal movement
    const dir = Math.abs(inp.mx) > 0.25 ? Math.sign(inp.mx) : 0;
    if (f.onGround) {
      if (dir !== 0) {
        f.vx = dir * stats.run;
        f.face = dir;
        f.state = 'run';
        if (f.frame % 1 === 0 && Math.abs(f.vx) > 5 && this.frame % 7 === 0) {
          this.pushEvent({ t: 'dust', x: f.x - dir * 12, y: f.y + f.halfH });
        }
      } else {
        f.vx *= stats.friction;
        if (Math.abs(f.vx) < 0.4) f.vx = 0;
        f.state = Math.abs(f.vx) > 0.5 ? 'run' : 'idle';
      }
    } else {
      if (dir !== 0) {
        f.vx += dir * stats.airAccel;
        f.vx = clamp(f.vx, -stats.airSpeed, stats.airSpeed);
        f.face = dir;
      }
      // fast fall
      if (inp.my > 0.5 && f.vy > 0.5) f.vy = Math.min(f.vy + 1.15, stats.fastFall);
      f.state = f.vy < -0.6 ? 'jump' : 'fall';
      if (f.vy < -0.6) f.jumps = Math.min(f.jumps, 1);
    }

    this.physics(f, stats, false);
  }

  physics(f, stats, tumbling) {
    const wasGround = f.onGround;
    // gravity
    if (!f.onGround) {
      f.vy = Math.min(f.vy + stats.gravity, tumbling ? stats.maxFall * 1.25 : (f.input.my > 0.5 ? stats.fastFall : stats.maxFall));
      if (tumbling) f.vx *= 0.995;
    }

    const prevBottom = f.y + f.halfH;
    f.x += f.vx;
    f.y += f.vy;

    // platform collision (top surfaces only)
    let landed = false;
    if (f.vy >= 0 && f.dropTimer <= 0) {
      const newBottom = f.y + f.halfH;
      for (const p of this.stage.platforms) {
        if (p.type === 'soft' && f.dropTimer > 0) continue;
        const withinX = f.x + f.halfW * 0.55 > p.x && f.x - f.halfW * 0.55 < p.x + p.w;
        if (withinX && prevBottom <= p.y + 8 && newBottom >= p.y) {
          f.y = p.y - f.halfH;
          f.vy = 0;
          f.onGround = true;
          landed = true;
          f.jumps = 2;
          break;
        }
      }
    }
    if (!landed) {
      // keep stuck to platform when walking off edges gently
      if (f.onGround) {
        const still = this.standingOnPlatform(f);
        if (!still) f.onGround = false;
      }
    }
    if (landed && !wasGround) {
      const hard = Math.abs(f.vy) > 8;
      this.pushEvent({ t: 'land', x: f.x, y: f.y + f.halfH, hard: hard && f.state === 'fall' });
      if (f.state === 'fall' || f.state === 'jump') f.state = 'idle';
    }
  }

  standingOnPlatform(f) {
    const bottom = f.y + f.halfH;
    for (const p of this.stage.platforms) {
      if (f.dropTimer > 0 && p.type === 'soft') continue;
      const withinX = f.x + f.halfW * 0.55 > p.x && f.x - f.halfW * 0.55 < p.x + p.w;
      if (withinX && Math.abs(bottom - p.y) < 10) return true;
    }
    return false;
  }

  onSoftPlatform(f) {
    const bottom = f.y + f.halfH;
    for (const p of this.stage.platforms) {
      if (p.type !== 'soft') continue;
      const withinX = f.x > p.x && f.x < p.x + p.w;
      if (withinX && Math.abs(bottom - p.y) < 10) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- moves
  pickTilt(f) {
    const { mx, my } = f.input;
    if (f.onGround) {
      if (my > 0.5) return 'dtilt';
      if (my < -0.5) return 'utilt';
      if (Math.abs(mx) > 0.4) return 'ftilt';
      return 'jab';
    }
    if (my > 0.5) return 'dair';
    if (my < -0.5) return 'uair';
    if (Math.abs(mx) > 0.4) {
      const fwd = Math.sign(mx) === f.face;
      return fwd ? 'fair' : 'bair';
    }
    return 'nair';
  }

  pickSmash(f) {
    const { mx, my } = f.input;
    if (my < -0.5) return 'usmash';
    if (my > 0.5 && f.onGround) return 'dsmash';
    return 'fsmash';
  }

  pickSpecial(f) {
    const { mx, my } = f.input;
    if (my < -0.5) return 'uspecial';
    if (my > 0.5) return 'dspecial';
    if (Math.abs(mx) > 0.4) return 'fspecial';
    return 'nspecial';
  }

  startMove(f, moveId, isSpecial) {
    const base = MOVES[moveId];
    if (!base) return;
    const over = (CHAR_MOVES[f.charId] || {})[moveId] || {};
    const move = { ...base, ...over, id: moveId, isSpecial: !!isSpecial };
    f.attack = { move, frame: 0, hitSet: new Set(), spawnedProj: false };
    f.state = isSpecial ? 'special' : 'attack';
    f.stateT = 0;

    // face the stick direction when committing to a move
    if (Math.abs(f.input.mx) > 0.1) f.face = Math.sign(f.input.mx);

    // movement during specials
    const ch = CHARACTERS[f.charId];
    if (moveId === 'fspecial') {
      f.vx = f.face * (move.dash || 14) * (ch.speed * 0.85 + 0.25);
      if (!f.onGround) f.vy = Math.min(f.vy, 1);
    } else if (moveId === 'uspecial') {
      f.vy = -(move.rise || 16) * (0.85 + ch.jump * 0.18);
      f.vx *= 0.55;
      f.onGround = false;
      f.jumps = 0;
    } else if (moveId === 'dsmash' || moveId === 'dtilt') {
      f.vx *= 0.55;
    } else if (moveId === 'fsmash') {
      f.vx *= 0.35;
    } else {
      f.vx *= 0.75;
    }

    this.pushEvent({ t: 'swing', x: f.x, y: f.y, face: f.face, move: moveId, heavy: move.dmg >= 11 });
  }

  updateAttack(f, stats) {
    const atk = f.attack;
    const m = atk.move;
    atk.frame++;

    // spawn projectile at active window start
    if (m.proj && !atk.spawnedProj && atk.frame >= m.startup) {
      atk.spawnedProj = true;
      const style = PROJ_STYLES[m.proj] || PROJ_STYLES.fire;
      const speed = (m.speed || 12);
      this.projectiles.push({
        id: this.projId++,
        owner: f.id,
        style: m.proj,
        x: f.x + f.face * 34,
        y: f.y - 18,
        vx: f.face * speed,
        vy: m.id === 'uspecial' ? -speed : (m.id === 'dspecial' ? speed * 0.4 : 0),
        dmg: m.dmg,
        baseKb: m.baseKb,
        kbScale: m.kbScale,
        angle: m.angle,
        r: style.r * (m.size || 1),
        life: m.id === 'nspecial' ? 110 : 40,
      });
      this.pushEvent({ t: 'proj', x: f.x + f.face * 34, y: f.y - 18, style: m.proj, vx: f.face * speed, id: this.projId - 1 });
    }

    // active hitbox
    if (atk.frame >= m.startup && atk.frame < m.startup + m.active && !m.proj) {
      this.resolveHitbox(f, m, atk);
    }

    // movement while attacking
    if (f.onGround) {
      f.vx *= m.id === 'fspecial' ? 0.965 : 0.82;
    } else {
      // air drift on aerials
      const dir = Math.abs(f.input.mx) > 0.25 ? Math.sign(f.input.mx) : 0;
      if (dir !== 0) f.vx = clamp(f.vx + dir * stats.airAccel * 0.75, -stats.airSpeed, stats.airSpeed);
      f.vy = Math.min(f.vy + stats.gravity * (m.id === 'uspecial' ? 0.45 : 1), stats.maxFall);
      if (m.id === 'uspecial' && atk.frame < m.startup + m.active) f.vy -= 0.55; // hover a bit
      if (m.id === 'dair') f.vy = Math.min(f.vy + 1.4, 17);
    }

    this.physics(f, stats, false);

    const total = m.startup + m.active + m.end;
    if (atk.frame >= total) {
      f.attack = null;
      f.state = f.onGround ? 'idle' : 'fall';
    }
  }

  resolveHitbox(f, m, atk) {
    const dir = f.face;
    const box = m.box || { x: 34, y: -30, w: 80, h: 60 };
    const hx = f.x + (dir > 0 ? box.x : -box.x - box.w);
    const hy = f.y + box.y;
    const hw = box.w, hh = box.h;

    for (const t of this.fighters) {
      if (t === f || t.eliminated || t.respawnT > 0) continue;
      if (atk.hitSet.has(t.id)) continue;
      if (t.invuln > 0) continue; // dodges + spawn invulnerability
      const bx = t.x - t.halfW, by = t.y - t.halfH, bw = t.halfW * 2, bh = t.halfH * 2;
      if (hx < bx + bw && hx + hw > bx && hy < by + bh && hy + hh > by) {
        atk.hitSet.add(t.id);
        this.applyHit(f, t, m, m.dmg, m.angle, dir);
      }
    }
  }

  applyHit(attacker, target, m, dmg, angleDeg, dir, projX, projY) {
    // shield block
    if (target.state === 'shield' && target.shieldHp > 0) {
      target.shieldHp = Math.max(0, target.shieldHp - dmg * 1.35);
      target.vx += dir * 1.4;
      attacker.hitlag = Math.max(attacker.hitlag, 3);
      target.hitlag = Math.max(target.hitlag, 3);
      this.pushEvent({ t: 'block', x: (projX ?? target.x), y: (projY ?? target.y) - 20 });
      if (target.shieldHp <= 0) {
        target.state = 'stunned';
        target.stateT = 110;
        target.shieldHp = 0;
        this.pushEvent({ t: 'shieldbreak', x: target.x, y: target.y, id: target.id });
      }
      return;
    }

    const ch = CHARACTERS[target.charId];
    const before = target.percent;
    target.percent = Math.round((target.percent + dmg) * 10) / 10;

    // knockback: grows with victim's percent
    const kbUnits = (m.baseKb + m.kbScale * before * 0.33) / (ch.weight * 0.92 + 0.08);
    const speed = kbUnits * 0.42;
    const ang = (angleDeg * Math.PI) / 180;
    let kx = Math.cos(ang) * speed * dir;
    let ky = -Math.sin(ang) * speed;
    if (angleDeg === 268) { // dair spike
      kx *= 0.35;
      ky = Math.abs(speed) * 0.95;
    }
    // slight DI baseline away from attacker
    target.vx = kx;
    target.vy = ky;
    target.onGround = false;
    target.attack = null;
    target.state = 'hitstun';
    const stun = clamp(4 + speed * 2.6 + dmg * 0.45, 7, 84);
    target.hitstun = stun;
    const lag = clamp(Math.round(m.hitlag + dmg * 0.28), 3, 14);
    target.hitlag = lag;
    attacker.hitlag = Math.max(attacker.hitlag, lag);
    if (attacker.attack) attacker.attack.frame = Math.max(0, attacker.attack.frame - 0); // hold frame during lag

    target.lastHitBy = attacker.id;
    target.lastHitAt = this.frame;

    if (attacker) {
      attacker.stats.dmgDealt = Math.round((attacker.stats.dmgDealt + dmg) * 10) / 10;
      attacker.stats.biggest = Math.max(attacker.stats.biggest, speed);
    }

    const heavy = dmg >= 11 || speed > 14;
    this.pushEvent({
      t: 'hit',
      x: projX ?? target.x - dir * 12,
      y: projY ?? target.y - 14,
      dir,
      dmg,
      heavy,
      speed,
    });
    if (speed > 17 && before > 60) {
      this.pushEvent({ t: 'zoom', x: target.x, y: target.y });
    }
  }

  // ---------------------------------------------------------------- projectiles
  updateProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.style === 'rock') p.vy += 0.22;
      if (p.style === 'void') p.vy += Math.sin(this.frame * 0.16 + p.id) * 0.35;
      p.life--;
      // hit fighters
      for (const t of this.fighters) {
        if (t.eliminated || t.respawnT > 0) continue;
        if (t.id === p.owner && p.life > 60) continue;
        const dx = t.x - p.x, dy = t.y - p.y;
        if (dx * dx + dy * dy < (p.r + t.halfW) * (p.r + t.halfW)) {
          const owner = this.fighters.find((f) => f.id === p.owner);
          const dir = Math.sign(p.vx) || 1;
          this.applyHit(owner || t, t, {
            baseKb: p.baseKb, kbScale: p.kbScale, angle: p.angle, hitlag: 4,
          }, p.dmg, p.angle, dir, p.x, p.y);
          p.life = 0;
          this.pushEvent({ t: 'projdie', x: p.x, y: p.y, style: p.style });
          break;
        }
      }
      if (p.life <= 0) {
        if (!this.events.some((e) => e.t === 'projdie' && e.x === p.x && e.y === p.y)) {
          this.pushEvent({ t: 'projdie', x: p.x, y: p.y, style: p.style });
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  // ---------------------------------------------------------------- stocks / ko
  checkBlastZones() {
    const b = WORLD.blast;
    for (const f of this.fighters) {
      if (f.eliminated || f.respawnT > 0) continue;
      if (f.x < b.left || f.x > b.right || f.y < b.top || f.y > b.bottom) {
        this.knockOut(f);
      }
    }
  }

  knockOut(f) {
    f.stocks--;
    f.stats.falls++;
    this.pushEvent({ t: 'ko', x: clamp(f.x, WORLD.blast.left + 40, WORLD.blast.right - 40), y: clamp(f.y, WORLD.blast.top + 40, WORLD.blast.bottom - 40), id: f.id, stocks: f.stocks, charId: f.charId });

    // credit KO
    const killer = this.fighters.find((x) => x.id === f.lastHitBy);
    if (killer && killer.id !== f.id && this.frame - f.lastHitAt < 60 * 8) {
      killer.stats.kos++;
    }

    if (f.stocks <= 0) {
      f.eliminated = true;
      f.respawnT = 0;
      this.pushEvent({ t: 'eliminated', id: f.id, name: f.name });
    } else {
      f.respawnT = 100;
      f.x = -99999; // park offscreen while waiting
      f.y = -99999;
    }
  }

  respawnFighter(f) {
    const s = this.stage.spawn;
    f.x = s.x;
    f.y = WORLD.respawnY;
    f.vx = 0;
    f.vy = 1.5;
    f.percent = 0;
    f.hitstun = 0;
    f.hitlag = 0;
    f.invuln = 150;
    f.state = 'fall';
    f.jumps = 2;
    f.attack = null;
    f.shieldHp = 100;
    this.pushEvent({ t: 'respawn', x: f.x, y: f.y, id: f.id });
  }

  // ---------------------------------------------------------------- win
  checkWin() {
    const alive = this.aliveFighters();
    if (this.fighters.length > 1 && alive.length <= 1 && !this.finished) {
      this.finish(alive[0] || null);
    } else if (this.fighters.length === 1 && alive.length === 0 && !this.finished) {
      this.finish(null);
    }
  }

  finishByTime() {
    const ranked = [...this.fighters].sort((a, b) => {
      if (a.stocks !== b.stocks) return b.stocks - a.stocks;
      return a.percent - b.percent;
    });
    this.finish(ranked[0] || null);
  }

  finish(winner) {
    this.finished = true;
    this.winnerId = winner ? winner.id : null;
    this.ranked = [...this.fighters]
      .sort((a, b) => {
        if (a.stocks !== b.stocks) return b.stocks - a.stocks;
        return a.percent - b.percent;
      })
      .map((f, i) => ({
        rank: i + 1,
        id: f.id,
        name: f.name,
        charId: f.charId,
        isBot: f.isBot,
        stocks: Math.max(0, f.stocks),
        percent: f.percent,
        stats: f.stats,
        winner: winner ? f.id === winner.id : false,
      }));
    this.pushEvent({ t: 'gameover', winnerId: this.winnerId, ranked: this.ranked });
  }

  // ---------------------------------------------------------------- bots
  groundBelowAt(x, y, maxDrop = 170) {
    for (const p of this.stage.platforms) {
      if (x > p.x - 6 && x < p.x + p.w + 6 && p.y >= y - 20 && p.y < y + maxDrop) return true;
    }
    return false;
  }

  botThink(f) {
    f.botTimer--;
    if (f.botTimer > 0) return;
    f.botTimer = Math.round(rand(5, 11));

    const inp = emptyInput();
    const enemies = this.fighters.filter((t) => t !== f && !t.eliminated && t.respawnT <= 0);
    if (enemies.length === 0) {
      f.input = inp;
      return;
    }
    let target = enemies[0];
    let best = Infinity;
    for (const t of enemies) {
      const d = Math.abs(t.x - f.x) + Math.abs(t.y - f.y) * 1.15;
      if (d < best) { best = d; target = t; }
    }

    const plan = f.botPlan;
    plan.t--;
    if (plan.t <= 0) {
      plan.t = Math.round(rand(36, 100));
      plan.mode = Math.random() < 0.1 ? 'retreat' : 'chase';
    }

    const spawnX = this.stage.spawn.x;
    const offstage = !f.onGround && !this.groundBelowAt(f.x, f.y + 40, 240);

    // -------- recovery: head back to center, use resources wisely
    if (offstage || f.x < 320 || f.x > 1500 || f.y > 830) {
      const centerDir = Math.sign(spawnX - f.x);
      inp.mx = centerDir || 0;
      // rise: prefer jumps first, then up-special when high/low on options
      if (f.jumps > 0 && (f.vy > -2 || f.y > 620)) {
        inp.jump = true;
      } else if (f.attack === null) {
        if (f.y > 560 || f.jumps === 0) {
          inp.my = -1;
          inp.special = true;
        }
      }
      // if very high above stage, drift down toward it
      if (f.y < 320 && Math.abs(f.x - spawnX) < 260) {
        inp.my = 1;
      }
      f.input = inp;
      return;
    }

    const dx = target.x - f.x;
    const dy = target.y - f.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dir = Math.sign(dx) || 1;

    if (plan.mode === 'retreat' && f.onGround) {
      // retreat toward center, keep the stage at your back
      inp.mx = Math.sign(spawnX - f.x) || -dir;
      const aheadX = f.x + inp.mx * 90;
      if (!this.groundBelowAt(aheadX, f.y + 20)) inp.mx = 0;
      if (Math.random() < 0.08) { inp.shield = true; }
      f.input = inp;
      return;
    }

    // -------- approach
    if (adx > 170 || ady > 150) {
      inp.mx = dir;
      const aheadX = f.x + dir * 85;
      const gapAhead = !this.groundBelowAt(aheadX, f.y + 20);
      if (gapAhead) {
        // don't walk into the void: hop the gap if the target is out there, else hold
        if (adx < 340 && ady < 140) {
          inp.jump = true;
        } else {
          inp.mx = 0;
        }
      }
      // jump toward targets on higher platforms
      if (dy < -110 && f.onGround && adx < 380) {
        inp.jump = true;
        inp.mx = dir;
      }
      // occasional projectile from range (mx=0 → neutral special)
      if (adx > 240 && adx < 560 && ady < 90 && Math.random() < 0.14) {
        inp.special = true;
        inp.mx = 0;
      }
    } else {
      // -------- in range: attack
      const clearance = this.groundBelowAt(f.x + dir * 170, f.y + 20);
      inp.mx = dir;
      if (f.onGround && !this.groundBelowAt(f.x + dir * 70, f.y + 20) && adx > 70) {
        inp.mx = 0; // edge safety while fighting
      }
      const r = Math.random();
      const enemyThreat = (target.state === 'attack' || target.state === 'special') && adx < 120;
      const killPct = target.percent > 75;
      if (enemyThreat && r < 0.16) {
        inp.shield = true;
        if (r < 0.06) inp.mx = dir; // roll through
      } else if (dy < -80 && ady < 190) {
        // enemy above
        if (!f.onGround) {
          inp.my = -1;
          inp.attack = true; // uair
        } else if (r < 0.55) {
          inp.my = -1;
          inp.smash = true; // usmash
        } else {
          inp.jump = true;
        }
      } else if (dy > 95 && !f.onGround && ady < 190) {
        inp.my = 1;
        if (r < 0.5) inp.attack = true; // dair
      } else if (ady < 120) {
        if (r < 0.42) inp.attack = true; // jab / tilt
        else if (r < (killPct ? 0.72 : 0.55)) inp.smash = true; // smash when it kills
        else if (r < 0.68) {
          // side-special only with runway; otherwise safe projectile
          if (clearance && adx > 90) {
            inp.special = true;
            inp.mx = dir;
          } else {
            inp.special = true;
            inp.mx = 0;
          }
        } else if (r < 0.78) inp.jump = true;
        else if (r < 0.88) { inp.shield = true; }
      } else {
        inp.mx = dir;
      }
    }

    f.input = inp;
  }

  // ---------------------------------------------------------------- snapshot
  snapshot() {
    return {
      f: this.frame,
      tl: this.timeLeft,
      cd: this.startCountdown,
      done: this.finished,
      win: this.winnerId,
      fighters: this.fighters.map((f) => ({
        id: f.id,
        n: f.name,
        c: f.charId,
        bot: f.isBot ? 1 : 0,
        ci: f.colorIdx,
        x: Math.round(f.x * 10) / 10,
        y: Math.round(f.y * 10) / 10,
        vx: Math.round(f.vx * 10) / 10,
        vy: Math.round(f.vy * 10) / 10,
        fa: f.face,
        st: f.state,
        t: f.stateT,
        p: f.percent,
        s: f.stocks,
        j: f.jumps,
        g: f.onGround ? 1 : 0,
        iv: f.invuln > 0 ? 1 : 0,
        hl: f.hitlag > 0 ? 1 : 0,
        hs: Math.round(f.hitstun),
        sh: Math.round(f.shieldHp),
        am: f.attack ? f.attack.move.id : null,
        af: f.attack ? f.attack.frame : 0,
        el: f.eliminated ? 1 : 0,
        rs: f.respawnT,
      })),
      proj: this.projectiles.map((p) => ({
        id: p.id, o: p.owner, st: p.style,
        x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
        vx: p.vx, vy: p.vy, r: p.r,
      })),
      ev: this.pendingEvents.splice(0, this.pendingEvents.length),
    };
  }

  results() {
    return this.ranked || [...this.fighters].map((f, i) => ({
      rank: i + 1, id: f.id, name: f.name, charId: f.charId, isBot: f.isBot,
      stocks: f.stocks, percent: f.percent, stats: f.stats, winner: f.id === this.winnerId,
    }));
  }
}
