// Tiny WebAudio synth: SFX + optional chip-tune music. No audio assets.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musGain = null;
    this.enabled = true;
    this.masterVol = 0.6;
    this.sfxVol = 0.8;
    this.musVol = 0.35;
    this.musicOn = true;
    this._musicTimer = null;
    this._beat = 0;
    this._muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVol;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);
    this.musGain = this.ctx.createGain();
    this.musGain.gain.value = this.musVol;
    this.musGain.connect(this.master);
    this.startMusic();
  }

  setMaster(v) {
    this.masterVol = v;
    if (this.master) this.master.gain.value = v;
  }
  setSfx(v) {
    this.sfxVol = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }
  setMusic(v) {
    this.musVol = v;
    if (this.musGain) this.musGain.gain.value = v;
  }

  tone({ freq = 440, dur = 0.12, type = 'square', vol = 0.3, slide = 0, delay = 0, attack = 0.002, dest = null }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(24, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest || this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.15, vol = 0.25, freq = 800, q = 1.2, delay = 0, dest = null }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t0);
  }

  // ------------------------------------------------------------ sfx
  jump() {
    this.tone({ freq: 320, slide: 280, dur: 0.12, type: 'square', vol: 0.16 });
  }
  doubleJump() {
    this.tone({ freq: 380, slide: 320, dur: 0.1, type: 'square', vol: 0.15 });
    this.tone({ freq: 520, slide: 300, dur: 0.12, type: 'triangle', vol: 0.12, delay: 0.05 });
  }
  land(hard) {
    this.noise({ dur: hard ? 0.16 : 0.08, vol: hard ? 0.3 : 0.15, freq: 300, q: 0.8 });
    this.tone({ freq: 130, slide: -60, dur: 0.08, type: 'sine', vol: hard ? 0.22 : 0.1 });
  }
  hit(heavy) {
    this.noise({ dur: heavy ? 0.22 : 0.1, vol: heavy ? 0.42 : 0.22, freq: heavy ? 900 : 1400, q: 0.9 });
    this.tone({ freq: heavy ? 190 : 260, slide: heavy ? -140 : -90, dur: heavy ? 0.18 : 0.08, type: 'square', vol: heavy ? 0.3 : 0.18 });
    if (heavy) this.tone({ freq: 90, slide: -50, dur: 0.25, type: 'sine', vol: 0.32 });
  }
  smashSwing() {
    this.noise({ dur: 0.12, vol: 0.16, freq: 2400, q: 0.6 });
    this.tone({ freq: 700, slide: -420, dur: 0.1, type: 'sawtooth', vol: 0.07 });
  }
  shield() {
    this.tone({ freq: 520, slide: -120, dur: 0.08, type: 'triangle', vol: 0.12 });
    this.noise({ dur: 0.07, vol: 0.1, freq: 2000, q: 1.5 });
  }
  block() {
    this.noise({ dur: 0.08, vol: 0.25, freq: 2600, q: 1.2 });
    this.tone({ freq: 880, slide: -300, dur: 0.07, type: 'square', vol: 0.14 });
  }
  shieldBreak() {
    this.tone({ freq: 700, slide: -620, dur: 0.5, type: 'sawtooth', vol: 0.28 });
    this.noise({ dur: 0.5, vol: 0.3, freq: 1200, q: 0.6 });
  }
  dodge() {
    this.noise({ dur: 0.12, vol: 0.14, freq: 3200, q: 0.7 });
    this.tone({ freq: 240, slide: 380, dur: 0.1, type: 'triangle', vol: 0.1 });
  }
  ko() {
    this.tone({ freq: 520, slide: -480, dur: 0.55, type: 'sawtooth', vol: 0.3 });
    this.tone({ freq: 260, slide: -230, dur: 0.65, type: 'square', vol: 0.22, delay: 0.04 });
    this.noise({ dur: 0.5, vol: 0.35, freq: 700, q: 0.5 });
  }
  spawn() {
    this.tone({ freq: 300, slide: 400, dur: 0.14, type: 'triangle', vol: 0.14 });
    this.tone({ freq: 500, slide: 300, dur: 0.16, type: 'sine', vol: 0.12, delay: 0.06 });
  }
  proj() {
    this.tone({ freq: 620, slide: -280, dur: 0.1, type: 'sawtooth', vol: 0.11 });
    this.noise({ dur: 0.09, vol: 0.1, freq: 1800, q: 1 });
  }
  projDie() {
    this.noise({ dur: 0.12, vol: 0.16, freq: 1100, q: 0.8 });
    this.tone({ freq: 320, slide: -160, dur: 0.1, type: 'triangle', vol: 0.12 });
  }
  menu() {
    this.tone({ freq: 660, dur: 0.05, type: 'triangle', vol: 0.12 });
    this.tone({ freq: 990, dur: 0.07, type: 'triangle', vol: 0.1, delay: 0.05 });
  }
  confirm() {
    this.tone({ freq: 520, dur: 0.07, type: 'triangle', vol: 0.14 });
    this.tone({ freq: 780, dur: 0.09, type: 'triangle', vol: 0.13, delay: 0.07 });
    this.tone({ freq: 1040, dur: 0.12, type: 'triangle', vol: 0.12, delay: 0.15 });
  }
  back() {
    this.tone({ freq: 420, slide: -140, dur: 0.09, type: 'triangle', vol: 0.12 });
  }
  countdown(beep) {
    const f = beep ? 660 : 1046;
    this.tone({ freq: f, dur: beep ? 0.12 : 0.32, type: 'square', vol: 0.2 });
  }
  gameover() {
    const notes = [523, 659, 784, 1046, 784, 1046];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.2, delay: i * 0.13 }));
    this.noise({ dur: 0.8, vol: 0.14, freq: 900, q: 0.5, delay: 0.1 });
  }

  // ------------------------------------------------------------ music
  startMusic() {
    if (this._musicTimer) return;
    // 16-step loop, scheduled in chunks
    const stepDur = 0.125;
    const bass = [55, 55, 82.4, 55, 61.7, 55, 82.4, 49, 55, 55, 82.4, 55, 61.7, 73.4, 82.4, 49];
    const lead = [440, 0, 659, 523, 0, 440, 392, 0, 523, 0, 587, 659, 0, 523, 440, 0];
    const kickStep = [0, 4, 8, 10, 12];
    const playBeat = () => {
      if (!this.ctx || !this.musicOn) return;
      const s = this._beat % 16;
      const when = 0;
      if (bass[s]) {
        this.tone({ freq: bass[s], dur: 0.22, type: 'triangle', vol: 0.16, delay: when, dest: this.musGain });
      }
      if (lead[s]) {
        this.tone({ freq: lead[s], dur: 0.16, type: 'square', vol: 0.055, delay: when, dest: this.musGain });
      }
      if (kickStep.includes(s)) {
        this.tone({ freq: 120, slide: -60, dur: 0.1, type: 'sine', vol: 0.22, delay: when, dest: this.musGain });
      }
      if (s === 4 || s === 12) {
        this.noise({ dur: 0.05, vol: 0.07, freq: 5000, q: 1, dest: this.musGain });
      }
      this._beat++;
    };
    this._musicTimer = setInterval(playBeat, stepDur * 1000);
    playBeat();
  }

  stopMusic() {
    clearInterval(this._musicTimer);
    this._musicTimer = null;
  }
}

export const audio = new GameAudio();
