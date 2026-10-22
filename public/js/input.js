// Keyboard + gamepad input, normalized to a single action object.

const KEYMAP = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  attack: ['KeyJ', 'KeyZ'],
  smash: ['KeyK', 'KeyX'],
  special: ['KeyL', 'KeyC'],
  shield: ['ShiftLeft', 'ShiftRight', 'KeyQ'],
  pause: ['Escape', 'KeyP'],
  taunt: ['KeyT'],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.prevKeys = new Set();
    this.enabled = true;
    this.anyKeyHandler = null;

    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.prevKeys.add(...[]); // noop keep
      this.keys.add(e.code);
      if (this.anyKeyHandler) this.anyKeyHandler(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onAnyKey(fn) {
    this.anyKeyHandler = fn;
  }

  down(action) {
    if (!this.enabled) return false;
    for (const code of KEYMAP[action] || []) if (this.keys.has(code)) return true;
    return false;
  }

  gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  // returns the normalized input object sent to the server
  sample() {
    const gp = this.gamepad();
    let mx = 0, my = 0;
    if (this.down('left')) mx -= 1;
    if (this.down('right')) mx += 1;
    if (this.down('up')) my -= 1;
    if (this.down('down')) my += 1;

    let jump = this.down('jump');
    let attack = this.down('attack');
    let smash = this.down('smash');
    let special = this.down('special');
    let shield = this.down('shield');

    if (gp) {
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      if (Math.abs(ax) > 0.28) mx = Math.sign(ax);
      if (Math.abs(ay) > 0.35) my = Math.sign(ay);
      const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (btn(0)) jump = true;
      if (btn(2)) attack = true;
      if (btn(3)) smash = true;
      if (btn(1)) special = true;
      if (btn(4) || btn(5) || btn(6) || btn(7)) shield = true;
      if (btn(12)) my = -1;
      if (btn(13)) my = 1;
      if (btn(14)) mx = -1;
      if (btn(15)) mx = 1;
    }

    return {
      mx: mx === 0 ? 0 : Math.sign(mx),
      my: my === 0 ? 0 : Math.sign(my),
      jump, attack, smash, special, shield,
    };
  }

  consumePause() {
    for (const code of KEYMAP.pause) {
      if (this.keys.has(code)) {
        this.keys.delete(code);
        return true;
      }
    }
    return false;
  }
}
