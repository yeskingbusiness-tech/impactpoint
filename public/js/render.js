// ImpactPoint Arena — canvas renderer: stages, procedural fighters, particles, FX.

import { CHARACTERS, STAGES, PROJ_STYLES, WORLD } from '../../shared/constants.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.shakeAmt = 0;
    this.shakeEnabled = true;
    this.showNames = true;
    this.time = 0;
    this.menuT = 0;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.cam = { x: 900, y: 560, zoom: 1, tx: 900, ty: 560, tz: 1 };
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * 3200, y: Math.random() * 900,
        r: Math.random() * 1.8 + 0.4, s: Math.random() * 0.6 + 0.2,
      });
    }
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      this.clouds.push({
        x: Math.random() * 3000, y: 60 + Math.random() * 420,
        w: 140 + Math.random() * 260, h: 34 + Math.random() * 50,
        v: 0.12 + Math.random() * 0.3, o: 0.05 + Math.random() * 0.1,
      });
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  shake(a) {
    if (this.shakeEnabled) this.shakeAmt = Math.min(28, this.shakeAmt + a);
  }

  // ---------------------------------------------------------------- events
  handleEvent(ev) {
    const P = this.particles;
    const push = (p) => { if (P.length < 600) P.push(p); };
    switch (ev.t) {
      case 'hit': {
        const n = ev.heavy ? 26 : 12;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = (ev.heavy ? 8 : 5) * (0.3 + Math.random());
          push({
            type: i % 3 === 0 ? 'star' : 'spark',
            x: ev.x, y: ev.y,
            vx: Math.cos(a) * sp + ev.dir * 2, vy: Math.sin(a) * sp - 1,
            life: ev.heavy ? 30 : 18, maxLife: ev.heavy ? 30 : 18,
            size: ev.heavy ? 10 : 6, color: i % 2 ? '#fff' : '#ffd166',
          });
        }
        push({
          type: 'ring', x: ev.x, y: ev.y, vx: 0, vy: 0,
          life: 14, maxLife: 14, size: ev.heavy ? 60 : 30, color: ev.heavy ? '#ff9a5c' : '#ffffff',
        });
        push({
          type: 'text', x: ev.x, y: ev.y - 10, vx: 0.4, vy: -1.6,
          life: 40, maxLife: 40, size: ev.heavy ? 26 : 18, color: '#fff',
          text: String(Math.round(ev.dmg)),
        });
        this.shake(ev.heavy ? 10 : 4);
        break;
      }
      case 'block':
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          push({
            type: 'spark', x: ev.x, y: ev.y,
            vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 - 1,
            life: 14, maxLife: 14, size: 5, color: '#8be9ff',
          });
        }
        push({ type: 'ring', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 12, maxLife: 12, size: 34, color: '#8be9ff' });
        break;
      case 'shieldbreak':
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          push({
            type: 'shard', x: ev.x, y: ev.y - 20,
            vx: Math.cos(a) * 6, vy: Math.sin(a) * 6 - 2,
            life: 36, maxLife: 36, size: 10, color: '#8be9ff', rot: Math.random() * 6,
          });
        }
        this.shake(14);
        break;
      case 'ko': {
        for (let i = 0; i < 46; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 3 + Math.random() * 11;
          push({
            type: i % 4 === 0 ? 'star' : 'spark',
            x: ev.x, y: ev.y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 50, maxLife: 50,
            size: 7 + Math.random() * 12,
            color: ['#fff', '#ffd166', '#ff7b2e', '#40c9ff'][i % 4],
          });
        }
        push({ type: 'ring', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 26, maxLife: 26, size: 120, color: '#fff' });
        push({ type: 'text', x: ev.x, y: ev.y - 30, vx: 0, vy: -1.2, life: 60, maxLife: 60, size: 30, color: '#ffd166', text: 'KO!' });
        this.shake(22);
        break;
      }
      case 'respawn':
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          push({
            type: 'spark', x: ev.x, y: ev.y,
            vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2,
            life: 26, maxLife: 26, size: 6, color: '#40c9ff',
          });
        }
        break;
      case 'land':
        for (let i = 0; i < (ev.hard ? 12 : 5); i++) {
          push({
            type: 'dust',
            x: ev.x + (Math.random() - 0.5) * 30, y: ev.y,
            vx: (Math.random() - 0.5) * (ev.hard ? 5 : 2.4), vy: -Math.random() * (ev.hard ? 3 : 1.4),
            life: 22, maxLife: 22, size: ev.hard ? 9 : 6, color: '#c9d2ff',
          });
        }
        if (ev.hard) this.shake(5);
        break;
      case 'dust':
        push({
          type: 'dust', x: ev.x, y: ev.y, vx: -Math.random() * 1.2, vy: -Math.random() * 1.2,
          life: 16, maxLife: 16, size: 5, color: '#aab4e8',
        });
        break;
      case 'jump':
        for (let i = 0; i < (ev.d ? 8 : 4); i++) {
          push({
            type: 'ring2', x: ev.x, y: ev.y + 18, vx: 0, vy: 0.4,
            life: 12, maxLife: 12, size: 14 + i * 4, color: '#ffffff',
          });
        }
        break;
      case 'dodge':
        push({ type: 'ring', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 12, maxLife: 12, size: 30, color: '#c9d2ff' });
        break;
      case 'swing':
        push({
          type: 'slash', x: ev.x + ev.face * 30, y: ev.y - 12, vx: 0, vy: 0,
          life: ev.heavy ? 12 : 8, maxLife: ev.heavy ? 12 : 8,
          size: ev.heavy ? 54 : 34, color: '#fff', face: ev.face,
        });
        break;
      case 'proj':
        for (let i = 0; i < 6; i++) {
          const st = PROJ_STYLES[ev.style] || PROJ_STYLES.fire;
          push({
            type: 'spark', x: ev.x, y: ev.y,
            vx: (Math.random() - 0.5) * 3 + ev.vx * 0.12, vy: (Math.random() - 0.5) * 3,
            life: 16, maxLife: 16, size: 6, color: st.color,
          });
        }
        break;
      case 'projdie': {
        const st = PROJ_STYLES[ev.style] || PROJ_STYLES.fire;
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          push({
            type: 'spark', x: ev.x, y: ev.y,
            vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4,
            life: 18, maxLife: 18, size: 7, color: st.glow,
          });
        }
        push({ type: 'ring', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 10, maxLife: 10, size: st.r * 2, color: st.color });
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- camera
  updateCamera(fighters, dt, snapCd) {
    const alive = fighters.filter((f) => !f.el && f.st !== 'ko');
    const target = alive.length ? alive : fighters;
    if (target.length) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let sx = 0, sy = 0;
      for (const f of target) {
        sx += f.x; sy += f.y;
        minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x);
        minY = Math.min(minY, f.y); maxY = Math.max(maxY, f.y);
      }
      const cx = sx / target.length;
      const cy = sy / target.length;
      const spreadX = maxX - minX, spreadY = maxY - minY;
      const need = Math.max(spreadX * 1.15 + 420, spreadY * 1.5 + 300, 900);
      const zoom = clamp((this.w * 0.92) / need, 0.52, 1.12);
      this.cam.tx = clamp(cx, 260, 1560);
      this.cam.ty = clamp(cy - 60, 220, 720);
      this.cam.tz = zoom;
    }
    const k = clamp(dt * 4.2, 0, 1);
    this.cam.x = lerp(this.cam.x, this.cam.tx, k);
    this.cam.y = lerp(this.cam.y, this.cam.ty, k);
    this.cam.zoom = lerp(this.cam.zoom, this.cam.tz, clamp(dt * 3, 0, 1));
    this.shakeAmt *= Math.pow(0.0015, dt);
    if (this.shakeAmt < 0.05) this.shakeAmt = 0;
  }

  worldTransform() {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const sx = (Math.random() - 0.5) * this.shakeAmt;
    const sy = (Math.random() - 0.5) * this.shakeAmt;
    ctx.save();
    ctx.translate(this.w / 2 + sx, this.h / 2 + sy);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);
    return () => ctx.restore();
  }

  // ---------------------------------------------------------------- menu bg
  drawMenu(dt) {
    this.menuT += dt;
    const ctx = this.ctx;
    const t = this.menuT;
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0b0e1a');
    g.addColorStop(0.45, '#1a1440');
    g.addColorStop(0.75, '#3b1d4f');
    g.addColorStop(1, '#7a2c3c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // stars
    for (const s of this.stars) {
      const x = (s.x - t * 12 * s.s) % (this.w + 60);
      ctx.globalAlpha = 0.35 + Math.sin(t * 2 * s.s + s.x) * 0.3;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc((x + this.w + 60) % (this.w + 60), (s.y / 900) * this.h * 0.8, s.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // silhouette skyline
    ctx.fillStyle = 'rgba(16, 12, 36, 0.85)';
    ctx.beginPath();
    ctx.moveTo(0, this.h * 0.82);
    for (let x = 0; x <= this.w; x += 60) {
      const y = this.h * 0.82 - (Math.sin(x * 0.012 + 2) * 40 + Math.sin(x * 0.004) * 70 + 60);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(this.w, this.h);
    ctx.lineTo(0, this.h);
    ctx.closePath();
    ctx.fill();

    // floating platform glow
    const px = this.w * 0.5, py = this.h * 0.72;
    const glow = ctx.createRadialGradient(px, py, 10, px, py, 320);
    glow.addColorStop(0, 'rgba(255, 122, 69, 0.22)');
    glow.addColorStop(1, 'rgba(255, 122, 69, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - 320, py - 220, 640, 400);

    ctx.fillStyle = '#2a2145';
    const fw = 360, fh = 18;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px - fw / 2, py, fw, fh, 10);
    else ctx.rect(px - fw / 2, py, fw, fh);
    ctx.fill();
    ctx.fillStyle = '#ff7a45';
    ctx.fillRect(px - fw / 2, py, fw, 4);
  }

  // ---------------------------------------------------------------- game
  drawGame(state, dt) {
    const ctx = this.ctx;
    const stage = STAGES[state.stage] || STAGES.battlefield;
    this.updateCamera(state.fighters, dt, state.cd);

    // sky
    const camY = this.cam.y;
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    const skyT = clamp((camY - 100) / 700, 0, 1);
    g.addColorStop(0, mix('#0e1230', '#1c2a6b', skyT));
    g.addColorStop(0.55, mix('#2c2470', '#4a58b8', skyT));
    g.addColorStop(1, mix('#7c3d64', '#e0836c', skyT));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // parallax clouds / stars
    this.menuT += dt;
    const t = this.menuT;
    for (const s of this.stars) {
      const x = ((s.x - this.cam.x * 0.22) % 3400 + 3400) % 3400 - 300;
      const y = ((s.y - this.cam.y * 0.14) % 1000 + 1000) % 1000 - 100;
      ctx.globalAlpha = 0.25 + Math.sin(t * 1.4 + s.x) * 0.2;
      ctx.fillStyle = '#e8edff';
      ctx.beginPath();
      ctx.arc((x / 3400) * this.w, (y / 1000) * this.h, s.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const c of this.clouds) {
      const x = ((c.x - this.cam.x * 0.4 + t * c.v * 14) % 3200 + 3200) % 3200 - 300;
      const y = ((c.y - this.cam.y * 0.25) % 700 + 700) % 700 - 80;
      ctx.fillStyle = `rgba(220, 228, 255, ${c.o})`;
      ctx.beginPath();
      ctx.ellipse((x / 3200) * this.w, (y / 700) * this.h, c.w / 3, c.h / 2.2, 0, 0, 7);
      ctx.fill();
    }

    // distant mountains
    ctx.fillStyle = 'rgba(30, 26, 70, 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, this.h);
    for (let x = 0; x <= this.w + 80; x += 80) {
      const wx = x + this.cam.x * 0.35;
      const y = this.h * 0.72 - (Math.sin(wx * 0.0032) * 90 + Math.sin(wx * 0.0011 + 3) * 140 + 160) * this.cam.zoom;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(this.w, this.h);
    ctx.closePath();
    ctx.fill();

    const pop = this.worldTransform();

    // stage platforms
    for (const p of stage.platforms) this.drawPlatform(p, state);

    // blast zone edge glow
    this.drawBlastGlow();

    // projectiles
    for (const pr of state.projectiles) this.drawProjectile(pr, t);

    // fighters
    for (const f of state.fighters) {
      if (f.el) continue;
      if (f.rs > 0) continue;
      this.drawFighter(f, t);
    }

    // particles in world space
    this.drawParticles();

    pop();

    // offscreen fighter arrows
    this.drawOffscreenArrows(state.fighters);
  }

  drawBlastGlow() {
    const ctx = this.ctx;
    const b = WORLD.blast;
    const grad = (x0, y0, x1, y1) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(255, 60, 60, 0.28)');
      g.addColorStop(1, 'rgba(255, 60, 60, 0)');
      return g;
    };
    const th = 60;
    ctx.fillStyle = grad(b.left, 0, b.left + th, 0);
    ctx.fillRect(b.left, b.top, th, b.bottom - b.top);
    ctx.fillStyle = grad(b.right, 0, b.right - th, 0);
    ctx.fillRect(b.right - th, b.top, th, b.bottom - b.top);
    ctx.fillStyle = grad(0, b.top, 0, b.top + th);
    ctx.fillRect(b.left, b.top, b.right - b.left, th);
    ctx.fillStyle = grad(0, b.bottom, 0, b.bottom - th);
    ctx.fillRect(b.left, b.bottom - th, b.right - b.left, th);
  }

  drawPlatform(p, state) {
    const ctx = this.ctx;
    if (p.type === 'solid') {
      // body
      const body = ctx.createLinearGradient(0, p.y, 0, p.y + 220);
      body.addColorStop(0, '#3c3363');
      body.addColorStop(1, '#1d1838');
      ctx.fillStyle = body;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, p.h + 190, 8);
      else ctx.rect(p.x, p.y, p.w, p.h + 190);
      ctx.fill();
      // top surface
      const top = ctx.createLinearGradient(0, p.y, 0, p.y + 18);
      top.addColorStop(0, '#6be3ff');
      top.addColorStop(0.25, '#3f7fd6');
      top.addColorStop(1, '#2b2c5c');
      ctx.fillStyle = top;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, 18, 6);
      else ctx.rect(p.x, p.y, p.w, 18);
      ctx.fill();
      // grass-ish edge lines
      ctx.strokeStyle = 'rgba(160, 235, 255, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + 6, p.y + 22);
      ctx.lineTo(p.x + p.w - 6, p.y + 22);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(60, 48, 110, 0.92)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, p.h, 10);
      else ctx.rect(p.x, p.y, p.w, p.h);
      ctx.fill();
      const glow = ctx.createLinearGradient(0, p.y, 0, p.y + 10);
      glow.addColorStop(0, '#b48cff');
      glow.addColorStop(1, 'rgba(180, 140, 255, 0.1)');
      ctx.fillStyle = glow;
      ctx.fillRect(p.x + 8, p.y, p.w - 16, 6);
      // under glow
      ctx.fillStyle = 'rgba(120, 90, 220, 0.16)';
      ctx.fillRect(p.x + 14, p.y + p.h, p.w - 28, 16);
    }
  }

  drawProjectile(pr, t) {
    const ctx = this.ctx;
    const st = PROJ_STYLES[pr.st] || PROJ_STYLES.fire;
    const r = pr.r;
    // trail
    for (let i = 1; i <= 4; i++) {
      ctx.globalAlpha = 0.16 * (5 - i);
      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.arc(pr.x - pr.vx * i * 0.55, pr.y - pr.vy * i * 0.55, r * (1 - i * 0.12), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, r * 2.2);
    glow.addColorStop(0, st.glow);
    glow.addColorStop(0.35, st.color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, r * 2.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, r * 0.45, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    // spin ring
    ctx.strokeStyle = st.glow;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, r * 1.15, t * 6, t * 6 + 2.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- fighter
  drawFighter(f, t) {
    const ctx = this.ctx;
    const ch = CHARACTERS[f.c] || CHARACTERS.blaze;
    const size = ch.size;
    const x = f.x, y = f.y;
    const face = f.fa || 1;

    // shadow
    if (f.g) {
      ctx.fillStyle = 'rgba(10, 8, 30, 0.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + 34 * size, 26 * size, 7 * size, 0, 0, 7);
      ctx.fill();
    }

    // shield bubble
    if (f.st === 'shield') {
      const hp = clamp(f.sh / 100, 0, 1);
      const r = 52 * size * (0.75 + hp * 0.35);
      const sg = ctx.createRadialGradient(x, y - 8, r * 0.2, x, y - 8, r);
      sg.addColorStop(0, `rgba(120, 200, 255, ${0.05 + hp * 0.12})`);
      sg.addColorStop(0.75, `rgba(90, 170, 255, ${0.12 + hp * 0.2})`);
      sg.addColorStop(1, 'rgba(90, 170, 255, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(x, y - 8, r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = `rgba(150, 210, 255, ${0.35 + hp * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y - 8, r * 0.92, 0, 7);
      ctx.stroke();
    }

    // invuln flicker
    let alpha = 1;
    if (f.iv) alpha = 0.55 + Math.sin(t * 18) * 0.28;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    // tumble rotation in hitstun
    if (f.st === 'hitstun' && f.hs > 4) {
      ctx.rotate(Math.sin(t * 7 + f.x * 0.01) * 0.7 * face);
    }

    const runPhase = f.animPhase || 0;
    const attacking = !!f.am;
    const atkProgress = f.am ? clamp((f.af || 0) / 12, 0, 1.4) : 0;

    // ---- pose params
    let legSwing = 0, armSwing = 0, bodyBob = 0, crouch = 0, armOut = 0, armUp = 0;
    switch (f.st) {
      case 'run':
        legSwing = Math.sin(runPhase * 1.6) * 0.85;
        armSwing = Math.sin(runPhase * 1.6 + Math.PI) * 0.8;
        bodyBob = Math.abs(Math.sin(runPhase * 1.6)) * 3;
        break;
      case 'jump':
        legSwing = -0.55; armSwing = -0.7; bodyBob = -2;
        break;
      case 'fall':
        legSwing = 0.35; armSwing = 0.55;
        break;
      case 'attack':
      case 'special':
        armOut = 1;
        if (f.am === 'usmash' || f.am === 'uspecial' || f.am === 'uair' || f.am === 'utilt') armUp = 1, armOut = 0.25;
        if (f.am === 'dsmash' || f.am === 'dtilt' || f.am === 'dair' || f.am === 'dspecial') armUp = -0.75, armOut = 0.35;
        if (f.am === 'bair') armOut = -1;
        if (f.am === 'fsmash' || f.am === 'fspecial') armOut = 1.45;
        break;
      case 'hitstun':
        legSwing = 0.8; armSwing = -0.9;
        break;
      case 'shield':
        crouch = 4; armUp = 0.8; armOut = 0.35;
        break;
      case 'dodge':
        crouch = 8; legSwing = -0.8;
        break;
      case 'stunned':
        legSwing = 0.4; armSwing = -1.1; bodyBob = Math.sin(t * 9) * 2;
        break;
      default:
        bodyBob = Math.sin(t * 2.4 + f.x * 0.01) * 1.6;
        armSwing = Math.sin(t * 2.4 + f.x * 0.01) * 0.12;
    }

    const S = size;
    const bodyH = 44 * S;
    const headR = 17 * S;

    // ---- legs
    ctx.lineCap = 'round';
    ctx.lineWidth = 11 * S;
    ctx.strokeStyle = ch.color2;
    const hipY = bodyH * 0.42;
    const legLen = 24 * S;
    for (const side of [-1, 1]) {
      const sw = legSwing * side;
      const lx = side * 9 * S + sw * 13 * S;
      const ly = hipY + legLen * (1 - Math.abs(sw) * 0.18);
      ctx.beginPath();
      ctx.moveTo(side * 8 * S, hipY - 2);
      ctx.lineTo(lx, ly - bodyBob * 0.2);
      ctx.stroke();
      // foot
      ctx.fillStyle = '#1a1330';
      ctx.beginPath();
      ctx.ellipse(lx + 3 * S * side, ly + 3 * S - bodyBob * 0.2, 8 * S, 5 * S, 0, 0, 7);
      ctx.fill();
    }

    // ---- body
    const bob = bodyBob;
    const bodyGrad = ctx.createLinearGradient(-20 * S, -30 * S + bob, 22 * S, 30 * S + bob);
    bodyGrad.addColorStop(0, ch.color);
    bodyGrad.addColorStop(1, ch.color2);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-18 * S, -bodyH * 0.52 + bob - crouch * 0.4, 36 * S, bodyH, 16 * S);
    else ctx.ellipse(0, bob - crouch * 0.4, 18 * S, bodyH / 2, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12, 8, 28, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ---- back arm
    ctx.lineWidth = 10 * S;
    ctx.strokeStyle = ch.color2;
    ctx.beginPath();
    ctx.moveTo(-10 * S, -8 * S + bob);
    ctx.lineTo(-22 * S - armSwing * 8 * S, 12 * S + bob + armSwing * 6);
    ctx.stroke();

    // ---- head
    const headY = -bodyH * 0.52 - headR * 0.75 + bob - crouch * 0.5;
    const hg = ctx.createRadialGradient(-5 * S, headY - 6 * S, 2, 0, headY, headR * 1.5);
    hg.addColorStop(0, '#ffffff');
    hg.addColorStop(0.12, ch.accent);
    hg.addColorStop(1, ch.color);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12, 8, 28, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // char accessories
    this.drawAccessory(ctx, f.c, S, headY, headR, face, t, bob);

    // ---- eyes
    const lookX = face * 3.2 * S;
    const blink = (Math.sin(t * 1.7 + f.x * 0.05) > 0.985) ? 0.15 : 1;
    const eyeY = headY - 1 * S;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(side * 6 * S + lookX * 0.5, eyeY, 5 * S, 5.6 * S * blink, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#131022';
      ctx.beginPath();
      ctx.ellipse(side * 6 * S + lookX, eyeY + 0.6 * S, 2.5 * S, 3 * S * blink, 0, 0, 7);
      ctx.fill();
    }
    // mouth
    ctx.strokeStyle = 'rgba(20, 12, 30, 0.75)';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    if (f.st === 'hitstun') {
      ctx.arc(0, headY + 8 * S, 3.4 * S, 0, Math.PI); // frown-ish open
    } else if (attacking) {
      ctx.arc(0, headY + 7 * S, 4.2 * S, 0.15, Math.PI - 0.15);
    } else {
      ctx.arc(0, headY + 6 * S, 3.6 * S, 0.25, Math.PI - 0.25);
    }
    ctx.stroke();

    // ---- front arm (attack arm)
    ctx.lineWidth = 11 * S;
    ctx.strokeStyle = ch.color;
    const reach = (18 + armOut * 26 + (attacking ? atkProgress * 18 : 0)) * S;
    const armAngle = armUp * -1.1 - (attacking ? 0 : 0.15);
    const ax = Math.cos(armAngle) * reach * (f.am === 'bair' ? -1 : face === -1 && !attacking ? 1 : 1) * (face);
    const ay = Math.sin(armAngle) * reach + (-8 * S + bob);
    ctx.beginPath();
    ctx.moveTo(10 * S * face, -8 * S + bob);
    ctx.lineTo(10 * S * face + ax * 0.55, ay);
    ctx.stroke();
    // fist
    ctx.fillStyle = ch.accent;
    ctx.beginPath();
    ctx.arc(10 * S * face + ax * 0.62, ay, 8.5 * S * (attacking ? 1.18 : 1), 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12, 8, 28, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // attack swing glow
    if (attacking && f.af >= 0 && atkProgress < 1.1) {
      const gr = ctx.createRadialGradient(ax * 0.7, ay, 2, ax * 0.7, ay, 34 * S);
      const heavy = f.am.includes('smash') || f.am.includes('special');
      gr.addColorStop(0, heavy ? 'rgba(255, 200, 90, 0.5)' : 'rgba(255, 255, 255, 0.32)');
      gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(ax * 0.7, ay, 34 * S, 0, 7);
      ctx.fill();
    }

    // stunned stars
    if (f.st === 'stunned') {
      for (let i = 0; i < 3; i++) {
        const a = t * 3 + (i / 3) * Math.PI * 2;
        const sx = Math.cos(a) * 26 * S, sy = headY - 12 * S + Math.sin(a) * 8;
        this.drawStar(ctx, sx, sy, 5, 6 * S, 3 * S, '#ffd166');
      }
    }

    ctx.restore();

    // name tag
    if (this.showNames) {
      ctx.save();
      ctx.font = `700 ${11 * clamp(this.cam.zoom, 0.7, 1)}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      const tagY = y - 62 * size - 12;
      const label = f.n;
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(10, 12, 28, 0.62)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, tagY - 11, w, 16, 8);
      else ctx.rect(x - w / 2, tagY - 11, w, 16);
      ctx.fill();
      ctx.fillStyle = PLAYER_TAG_COLORS[f.ci % 4];
      ctx.fillText(label, x, tagY + 1);
      ctx.restore();
    }
  }

  drawAccessory(ctx, charId, S, headY, headR, face, t, bob) {
    const ctx2 = ctx;
    if (charId === 'blaze') {
      // flame hair tuft
      ctx2.fillStyle = '#ffd166';
      for (let i = -1; i <= 1; i++) {
        const fh = 16 * S + Math.sin(t * 6 + i) * 4 * S;
        ctx2.beginPath();
        ctx2.moveTo(i * 8 * S - 4 * S, headY - headR * 0.75);
        ctx2.lineTo(i * 8 * S, headY - headR * 0.75 - fh);
        ctx2.lineTo(i * 8 * S + 4 * S, headY - headR * 0.75);
        ctx2.closePath();
        ctx2.fill();
      }
      // scarf
      ctx2.fillStyle = '#c23a1c';
      ctx2.beginPath();
      ctx2.moveTo(-14 * S, headY + headR * 0.85);
      ctx2.quadraticCurveTo(-34 * S - face * 4, headY + headR + 10 * S + Math.sin(t * 4) * 3, -40 * S - face * 8, headY + headR * 1.8 + Math.sin(t * 3) * 5);
      ctx2.lineWidth = 7 * S;
      ctx2.strokeStyle = '#c23a1c';
      ctx2.stroke();
    } else if (charId === 'volt') {
      // lightning crest
      ctx2.fillStyle = '#fff35c';
      ctx2.beginPath();
      ctx2.moveTo(-4 * S, headY - headR * 0.9);
      ctx2.lineTo(6 * S, headY - headR * 1.9);
      ctx2.lineTo(2 * S, headY - headR * 1.05);
      ctx2.lineTo(12 * S, headY - headR * 1.5);
      ctx2.lineTo(4 * S, headY - headR * 0.7);
      ctx2.closePath();
      ctx2.fill();
      // ears
      ctx2.fillStyle = '#40c9ff';
      ctx2.beginPath();
      ctx2.moveTo(-headR * 0.9, headY - headR * 0.3);
      ctx2.lineTo(-headR * 1.65, headY - headR * 1.35);
      ctx2.lineTo(-headR * 0.35, headY - headR * 0.85);
      ctx2.closePath();
      ctx2.fill();
    } else if (charId === 'titan') {
      // horns
      ctx2.fillStyle = '#c8ff4d';
      for (const s of [-1, 1]) {
        ctx2.beginPath();
        ctx2.moveTo(s * headR * 0.55, headY - headR * 0.7);
        ctx2.quadraticCurveTo(s * headR * 1.7, headY - headR * 1.7, s * headR * 1.25, headY - headR * 2.1);
        ctx2.quadraticCurveTo(s * headR * 1.15, headY - headR * 1.2, s * headR * 0.25, headY - headR * 0.55);
        ctx2.closePath();
        ctx2.fill();
      }
      // shoulder pads
      ctx2.fillStyle = 'rgba(200, 255, 77, 0.85)';
      for (const s of [-1, 1]) {
        ctx2.beginPath();
        ctx2.ellipse(s * 20 * S, headY + headR * 2.6, 12 * S, 8 * S, s * 0.3, 0, 7);
        ctx2.fill();
      }
    } else if (charId === 'rift') {
      // hood
      ctx2.fillStyle = '#007f7b';
      ctx2.beginPath();
      ctx2.ellipse(0, headY - headR * 0.25, headR * 1.28, headR * 1.12, 0, Math.PI, 0);
      ctx2.fill();
      // tail
      ctx2.strokeStyle = '#f15bb5';
      ctx2.lineWidth = 5 * S;
      ctx2.beginPath();
      ctx2.moveTo(-14 * S, headY + headR * 3.2);
      ctx2.quadraticCurveTo(-38 * S, headY + headR * 3 + Math.sin(t * 5) * 6, -30 * S, headY + headR * 1.6 + Math.cos(t * 4) * 5);
      ctx2.stroke();
      // hood tip glow
      ctx2.fillStyle = '#00f5d4';
      ctx2.beginPath();
      ctx2.arc(0, headY - headR * 1.15, 4 * S + Math.sin(t * 6) * 1.2 * S, 0, 7);
      ctx2.fill();
    }
  }

  drawStar(ctx, x, y, points, outer, inner, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const k = p.life / p.maxLife;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      switch (p.type) {
        case 'spark':
          p.vx *= 0.92; p.vy *= 0.92; p.vy += 0.12;
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * k, 0, 7);
          ctx.fill();
          break;
        case 'star':
          p.vx *= 0.93; p.vy *= 0.93;
          ctx.globalAlpha = k;
          this.drawStar(ctx, p.x, p.y, 4, p.size * (0.5 + k), p.size * 0.4, p.color);
          break;
        case 'dust':
          p.vy += 0.03; p.vx *= 0.96;
          ctx.globalAlpha = k * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.3 - k * 0.6), 0, 7);
          ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = k * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * k + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.35 - k), 0, 7);
          ctx.stroke();
          break;
        case 'ring2':
          ctx.globalAlpha = k * 0.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.5 - k), 0, 7);
          ctx.stroke();
          break;
        case 'shard':
          p.vy += 0.18;
          p.rot += 0.2;
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'text':
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.font = `900 ${p.size}px "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(20, 10, 30, 0.8)';
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
          break;
        case 'slash':
          ctx.globalAlpha = k * 0.85;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 5 * k + 1;
          ctx.beginPath();
          const s = p.size * (1.25 - k * 0.4);
          const start = p.face >= 0 ? -0.9 : Math.PI + 0.9;
          ctx.arc(p.x, p.y, s, start, start + 1.9 * p.face);
          ctx.stroke();
          break;
        default:
          break;
      }
      ctx.globalAlpha = 1;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  drawOffscreenArrows(fighters) {
    const ctx = this.ctx;
    const pop = null;
    for (const f of fighters) {
      if (f.el || f.rs > 0) continue;
      // project to screen
      const z = this.cam.zoom;
      const sx = (f.x - this.cam.x) * z + this.w / 2;
      const sy = (f.y - this.cam.y) * z + this.h / 2;
      const m = 54;
      if (sx > m && sx < this.w - m && sy > m && sy < this.h - m) continue;
      const cx = clamp(sx, m, this.w - m);
      const cy = clamp(sy, m, this.h - m);
      const ang = Math.atan2(sy - this.h / 2, sx - this.w / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const col = PLAYER_TAG_COLORS[f.ci % 4];
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}

const PLAYER_TAG_COLORS = ['#ff6b35', '#40c9ff', '#ffd166', '#7bf178'];

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}
